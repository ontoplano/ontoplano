import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import type { Bot } from 'grammy';
import { db, getPrimaryUserId } from './db.js';
import { reminders, userSettings } from '../../src/lib/server/db/schema.js';

/**
 * The only channel that works while the app is closed.
 *
 * A reminder that needs a tab open is a reminder you will miss, and the usual
 * answer — Web Push — routes every notification through Google's or Mozilla's
 * servers. On a box that is yours alone the bot is already sitting there with
 * the database open, so it can do the job with nobody else in the path.
 *
 * `delivered_at` is the interlock: the page and the bot both stamp it, so
 * whichever gets there first is the only one that speaks.
 */

/** Often enough that a reminder is never more than a minute stale. */
const EVERY = 30_000;

function zoneOf(userId: string): string {
	const row = db
		.select({ value: userSettings.value })
		.from(userSettings)
		.where(and(eq(userSettings.userId, userId), eq(userSettings.key, 'user.timezone')))
		.get();

	return row?.value || 'UTC';
}

/** Now, as the wall-clock string reminders are stored in. */
function localNow(zone: string): string {
	// `sv-SE` gives `YYYY-MM-DD HH:MM`, which is one character from ISO.
	const formatted = new Intl.DateTimeFormat('sv-SE', {
		timeZone: zone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(new Date());

	return `${formatted.replace(' ', 'T')}:59`;
}

async function deliverDue(bot: Bot, chatId: number): Promise<void> {
	const userId = await getPrimaryUserId();

	const due = db
		.select({ id: reminders.id, message: reminders.message, remindAt: reminders.remindAt })
		.from(reminders)
		.where(
			and(
				eq(reminders.userId, userId),
				isNull(reminders.deliveredAt),
				isNull(reminders.dismissedAt),
				lte(reminders.remindAt, localNow(zoneOf(userId)))
			)
		)
		.orderBy(asc(reminders.remindAt))
		.all();

	for (const reminder of due) {
		// Claim it before sending. If the send fails the reminder is lost rather
		// than repeated, which is the right way round: a notification that arrives
		// four times is worse than one that does not arrive.
		const claimed = db
			.update(reminders)
			.set({ deliveredAt: new Date().toISOString() })
			.where(and(eq(reminders.id, reminder.id), isNull(reminders.deliveredAt)))
			.run().changes;

		if (claimed === 0) continue;

		await bot.api
			.sendMessage(chatId, `⏰ ${reminder.message}\n\n${reminder.remindAt.slice(11, 16)}`)
			.catch((error: unknown) => console.error('Failed to deliver a reminder:', error));
	}
}

export function startReminders(bot: Bot, chatId: number): void {
	const tick = () =>
		deliverDue(bot, chatId).catch((error: unknown) =>
			console.error('Reminder sweep failed:', error)
		);

	tick();
	setInterval(tick, EVERY);
}
