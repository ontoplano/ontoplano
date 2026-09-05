import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { user } from '../db/schema.js';
import { renderEmail } from '../email-template.js';
import { getGridHours, getUserSetting, setUserSetting } from '../settings.js';
import { addDays } from '../week-generator.js';
import { buildCtx, localDateOf, type Ctx } from './ctx.js';
import { sendLogged } from './mail-log.js';
import { readWeek, reviewPending } from './review.js';

/**
 * Monday morning: what last week actually was, in the inbox.
 *
 * The review page has held these numbers since the beginning and nothing ever
 * asked anybody to look at them — the app only helps on the days you remember
 * to open it, which is why most people who try a planner stop in week two. A
 * report over data already collected is the cheapest thing there is that
 * brings somebody back, and unlike a notification it is not asking for
 * anything: it says what happened and leaves the door open.
 *
 * ## What it will not do
 *
 * **Send about a week that had nothing in it.** The rule is `reviewPending()`,
 * the same one the dashboard's own prompt uses, so the mail and the app never
 * disagree about whether there is a week worth looking at. Somebody who did
 * not plan gets no mail at all rather than a mail full of zeroes.
 *
 * **Send twice.** The week it last wrote about is stored, so a timer that
 * fires hourly, a box that reboots, and a run somebody starts by hand all
 * produce one mail.
 *
 * **Send to an address nobody confirmed.** An unverified address is one
 * somebody typed, possibly somebody else's.
 *
 * **Send to anybody who did not ask.** Off unless the account turns it on,
 * under Settings → Account. Mail somebody did not ask for is spam however
 * useful it is, and the fact that it is about their own data does not change
 * whose inbox it lands in. Every message carries a link that stops them in one
 * click with nothing to sign in to, which is the other half of the same rule.
 *
 * ## When
 *
 * The hour is the account's own: the start of its planner grid, plus an offset.
 * Somebody whose day starts at 06:00 is up an hour before somebody whose day
 * starts at 09:00, and both of them want this over the first coffee rather than
 * at a time the app chose. The offset is one setting for the whole instance
 * rather than a number in this file — see `REVIEW_MAIL_OFFSET_HOURS`.
 */

/** Set to `on` to get them. Absent means off: nobody is mailed unasked. */
export const REVIEW_MAIL_KEY = 'mail.weekly-review';

/** The Monday of the week last written about, so it is written about once. */
const LAST_SENT_KEY = 'mail.weekly-review.last';

/**
 * Hours after the planner's own start of day.
 *
 * An hour, unless the instance says otherwise. Not a constant in the middle of
 * a function: "why does mine arrive at eight" has an answer somebody can change
 * without editing this file, and the number is a judgement rather than a fact.
 * Bounded to a day, since past that it is no longer the same morning.
 */
export function reviewMailOffsetHours(): number {
	const raw = Number(process.env.ONTOPLANO_REVIEW_MAIL_OFFSET_HOURS);
	if (!Number.isFinite(raw)) return 1;
	return Math.min(Math.max(Math.round(raw), 0), 23);
}

/** Off unless the account said otherwise. Nobody is mailed unasked. */
export function weeklyReviewMailEnabled(userId: string): boolean {
	return getUserSetting(userId, REVIEW_MAIL_KEY) === 'on';
}

/**
 * The hour this account's mail goes out, in its own timezone.
 *
 * The planner's first hour plus the offset, clamped to the day: a grid that
 * starts at 23:00 would otherwise send at midnight tomorrow, which is not the
 * morning of anything.
 */
export function reviewMailHour(userId: string): number {
	return Math.min(getGridHours(userId).start + reviewMailOffsetHours(), 23);
}

export function setWeeklyReviewMail(ctx: Ctx, on: boolean): void {
	setUserSetting(ctx.userId, REVIEW_MAIL_KEY, on ? 'on' : 'off');
}

/**
 * The signature on an unsubscribe link.
 *
 * The link has to work from a mail client with no session — that is the whole
 * point of a one-click unsubscribe — so the account is named in the URL and
 * the signature is what makes naming it safe. Without one, the address bar
 * would be a way to turn off anybody's mail by guessing an id.
 *
 * It signs the account and the purpose together, so a link for this mail is
 * not a link for anything else that might one day be unsubscribable.
 */
function secret(): string {
	return process.env.BETTER_AUTH_SECRET ?? '';
}

export function unsubscribeToken(userId: string): string {
	return createHmac('sha256', secret()).update(`weekly-review:${userId}`).digest('base64url');
}

export function unsubscribeTokenValid(userId: string, token: string): boolean {
	if (!secret() || !token) return false;
	const expected = Buffer.from(unsubscribeToken(userId));
	const given = Buffer.from(token);
	// Length first: timingSafeEqual throws on a mismatch rather than answering.
	return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Where this instance is, for links in a mail nobody is reading in a browser. */
function origin(): string {
	return process.env.ORIGIN ?? '';
}

function hours(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * A week, in the four sentences worth reading over breakfast.
 *
 * Not a rendering of the review page. The page is where you *do* something
 * about a week; the mail's job is to make somebody want to open it, so it says
 * the shape of the week and stops. The one number that carries the feeling is
 * how much of what you meant to do you did.
 */
export function weeklyReviewMail(
	ctx: Ctx,
	weekStart: string
): { subject: string; text: string; html: string } {
	const { reading, loose } = readWeek(ctx, weekStart);
	const end = addDays(new Date(weekStart + 'T00:00:00'), 6);
	const span = `${weekStart} to ${localDateOf(end, ctx.tz)}`;
	const rate = reading.planned === 0 ? 0 : Math.round((reading.done / reading.planned) * 100);

	const lines = [
		`Your week of ${span}: you did ${reading.done} of the ${reading.planned} blocks you ` +
			`planned — ${rate}% — and ${hours(reading.minutesDone)} of the ` +
			`${hours(reading.minutesPlanned)} you set aside.`
	];

	// The busiest category, when there is one that actually ran. A week where
	// everything got equal attention has nothing to say here, and a sentence
	// that says nothing is worse than no sentence.
	const busiest = [...reading.byCategory].sort((a, b) => b.done - a.done)[0];
	if (busiest && busiest.done > 0) {
		lines.push(`Most of it was ${busiest.name}: ${busiest.done} of ${busiest.planned}.`);
	}

	if (loose.length > 0) {
		const titles = loose.slice(0, 3).map((l) => l.title);
		const rest = loose.length - titles.length;
		lines.push(
			`${loose.length} thing${loose.length === 1 ? '' : 's'} did not happen — ` +
				titles.join(', ') +
				(rest > 0 ? ` and ${rest} more` : '') +
				`. Say what became of them, or carry them into this week.`
		);
	} else if (reading.planned > 0) {
		lines.push('Nothing was left over.');
	}

	lines.push('Three lines about the week is the part worth reading in a year.');

	const link = origin() ? `${origin()}/tasks/review?week=${weekStart}` : '';
	const off = origin()
		? `${origin()}/mail/weekly-review/off?u=${encodeURIComponent(ctx.userId)}` +
			`&t=${unsubscribeToken(ctx.userId)}`
		: '';

	return renderEmail({
		subject: `Your week: ${reading.done} of ${reading.planned}`,
		lines,
		action: link ? { label: 'Close the week', url: link } : undefined,
		small: off ? [`Stop these: ${off}`] : []
	});
}

/** Whether it is their hour, where they are, on the day this goes out. */
function isSendTime(now: Date, tz: string, hour: number): boolean {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: tz,
		weekday: 'short',
		hour: 'numeric',
		hour12: false
	}).formatToParts(now);

	const weekday = parts.find((p) => p.type === 'weekday')?.value;
	const local = Number(parts.find((p) => p.type === 'hour')?.value);

	return weekday === 'Mon' && Number.isFinite(local) && local >= hour;
}

/**
 * The account's own idea of "now", so the week is theirs and not the server's.
 *
 * `getMonday` and everything under it read a `Date` with the server's local
 * calendar, so handing it the raw instant would give somebody in Auckland the
 * week their server is in. Noon on their own calendar day reads back as that
 * day everywhere, whatever either side does about daylight saving.
 */
function localNoon(now: Date, tz: string): Date {
	return new Date(`${localDateOf(now, tz)}T12:00:00`);
}

/**
 * Write to everybody whose Monday it is. Answers with how many went.
 *
 * Run hourly: the account decides the hour, because the account decides the
 * timezone, and a job that ran once a day could only ever be right for one
 * of them.
 */
export async function sendWeeklyReviews(now = new Date()): Promise<{
	sent: number;
	considered: number;
}> {
	const accounts = db
		.select({ id: user.id, email: user.email, verified: user.emailVerified, banned: user.banned })
		.from(user)
		.where(eq(user.emailVerified, true))
		.all();

	let sent = 0;
	let considered = 0;

	for (const account of accounts) {
		if (account.banned) continue;
		if (!weeklyReviewMailEnabled(account.id)) continue;

		const ctx = buildCtx(account.id, { now });
		if (!isSendTime(now, ctx.tz, reviewMailHour(account.id))) continue;

		const local = buildCtx(account.id, { tz: ctx.tz, now: localNoon(now, ctx.tz) });

		// The same rule the dashboard prompts with: the week is over, and there
		// was something in it. It also answers null once a review is written, so
		// somebody who already closed the week is not chased about it.
		const pending = reviewPending(local);
		if (!pending) continue;

		considered += 1;
		if (getUserSetting(account.id, LAST_SENT_KEY) === pending.weekStart) continue;

		const result = await sendLogged(
			'weekly-review',
			{ to: account.email, ...weeklyReviewMail(local, pending.weekStart) },
			// Worth retrying by hand from /admin, but a box with no SMTP is a
			// self-hosted install doing exactly what it means to.
			{ retryable: true }
		);

		// Stamped only when it went, so a bad hour is retried on the next one
		// rather than skipping somebody's week entirely.
		if (result.delivered) {
			setUserSetting(account.id, LAST_SENT_KEY, pending.weekStart);
			sent += 1;
		}
	}

	return { sent, considered };
}
