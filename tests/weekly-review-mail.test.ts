import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

/**
 * Monday's mail: who gets one, when, and how many times.
 *
 * The four ways a lifecycle mail goes wrong are all here. It goes to somebody
 * who never asked for it. It goes to somebody who did nothing that week and
 * reads as a page of zeroes. It goes twice, because the job runs hourly and
 * nothing remembered the first one. Or it goes on a Wednesday, because the
 * clock it read was the server's rather than the reader's — which is the one
 * that would only ever have shown up in a bug report from somebody twelve
 * hours away.
 */

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Mail = { to: string; subject: string; text: string };
const sendEmail = vi.fn<(email: Mail) => Promise<{ delivered: boolean }>>(async () => ({
	delivered: true
}));
vi.mock('../src/lib/server/email', () => ({
	sendEmail: (email: Mail) => sendEmail(email),
	isEmailConfigured: () => true
}));

let mail: typeof import('../src/lib/server/services/review-mail');
let slots: typeof import('../src/lib/server/services/slots');
let activities: typeof import('../src/lib/server/services/activities');
let instances: typeof import('../src/lib/server/services/instances');
let review: typeof import('../src/lib/server/services/review');

/** A Monday at 08:00 UTC — inside the send window for a UTC account. */
const MONDAY = new Date('2026-08-24T08:00:00Z');
/** The Monday before it: the week the mail is about. */
const LAST_WEEK = '2026-08-17';

function ctxFor(userId: string, tz = 'UTC', now = new Date('2026-08-19T12:00:00')) {
	return { userId, tz, now };
}

beforeAll(async () => {
	mail = await import('../src/lib/server/services/review-mail');
	slots = await import('../src/lib/server/services/slots');
	activities = await import('../src/lib/server/services/activities');
	instances = await import('../src/lib/server/services/instances');
	review = await import('../src/lib/server/services/review');

	process.env.ORIGIN = 'https://app.test.invalid';
	process.env.BETTER_AUTH_SECRET = 'a-secret-for-tests';

	// Both accounts have confirmed their address; that is a precondition, not
	// the thing under test.
	database.exec(`update user set email_verified = 1`);
});

/** A week with something in it: one block a day, some of them done. */
function planLastWeek(userId: string, done: number) {
	const ctx = ctxFor(userId);
	// Off unless asked for, so every test that expects a mail has to ask.
	mail.setWeeklyReviewMail(ctx, true);
	const category = activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
	const activity = activities.createActivity(ctx, { name: 'Deep work', categoryId: category });

	slots.createSlot(ctx, {
		weekday: 0,
		startTime: '09:00',
		durationMinutes: 60,
		mode: 'activity',
		activityId: activity
	});
	slots.createSlot(ctx, {
		weekday: 1,
		startTime: '09:00',
		durationMinutes: 60,
		mode: 'activity',
		activityId: activity
	});

	// Materialise Monday and Tuesday of the week being reviewed.
	for (const day of ['2026-08-17', '2026-08-18']) {
		instances.generateForDate(ctx, new Date(`${day}T12:00:00`));
	}

	const { loose } = review.readWeek(ctx, LAST_WEEK);
	for (const block of loose.slice(0, done)) {
		instances.setInstanceStatus(ctx, block.id, 'done');
	}
}

beforeEach(() => {
	sendEmail.mockClear();
	for (const table of [
		'task_records',
		'exceptional_tasks',
		'recurring_tasks',
		'activities',
		'categories',
		'weekly_reviews',
		'user_settings'
	]) {
		database.exec(`delete from ${table}`);
	}
});

describe('who gets one', () => {
	test('somebody who planned a week, once', async () => {
		planLastWeek(OWNER, 1);

		expect((await mail.sendWeeklyReviews(MONDAY)).sent).toBe(1);
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(sendEmail.mock.calls[0][0].to).toBe('owner@test.invalid');

		// The timer fires hourly; every other run this Monday must send nothing.
		expect((await mail.sendWeeklyReviews(MONDAY)).sent).toBe(0);
		const later = new Date(MONDAY.getTime() + 3 * 3600_000);
		expect((await mail.sendWeeklyReviews(later)).sent).toBe(0);
		expect(sendEmail).toHaveBeenCalledTimes(1);
	});

	test('nobody who planned nothing', async () => {
		expect((await mail.sendWeeklyReviews(MONDAY)).sent).toBe(0);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	/**
	 * Closed means answered for, not written about.
	 *
	 * It used to mean the note, so somebody who tidied every block away was
	 * mailed about a week they had already finished with, and somebody who
	 * wrote a sentence over an unanswered Tuesday was not. The mail follows the
	 * dashboard here, because two prompts disagreeing about whether a week is
	 * open is worse than either being wrong on its own.
	 */
	test('nobody who already answered for every block', async () => {
		planLastWeek(OWNER, 1);
		const ctx = ctxFor(OWNER);
		const { loose } = review.readWeek(ctx, LAST_WEEK);
		review.resolveLoose(
			ctx,
			LAST_WEEK,
			loose.map((block) => block.id),
			'skipped'
		);

		expect((await mail.sendWeeklyReviews(MONDAY)).sent).toBe(0);
	});

	test('and writing about a week is not answering for it', async () => {
		planLastWeek(OWNER, 1);
		review.saveNote(ctxFor(OWNER), { weekStart: LAST_WEEK, content: 'It was a week.' });

		expect((await mail.sendWeeklyReviews(MONDAY)).sent).toBe(1);
	});

	test('nobody who turned it off', async () => {
		planLastWeek(OWNER, 1);
		mail.setWeeklyReviewMail(ctxFor(OWNER), false);

		expect((await mail.sendWeeklyReviews(MONDAY)).sent).toBe(0);
	});

	/**
	 * The one that matters most: mail nobody asked for is spam however useful it
	 * is, and "it is about your own data" does not change whose inbox it is.
	 */
	test('nobody who never asked for it', async () => {
		planLastWeek(OWNER, 1);
		database.exec(`delete from user_settings where key = 'mail.weekly-review'`);

		expect((await mail.sendWeeklyReviews(MONDAY)).sent).toBe(0);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	test('nobody whose address is unconfirmed', async () => {
		planLastWeek(OWNER, 1);
		database.exec(`update user set email_verified = 0 where id = '${OWNER}'`);

		expect((await mail.sendWeeklyReviews(MONDAY)).sent).toBe(0);

		database.exec(`update user set email_verified = 1 where id = '${OWNER}'`);
	});

	test('a failed send is tried again on the next hour', async () => {
		planLastWeek(OWNER, 1);
		sendEmail.mockResolvedValueOnce({ delivered: false });

		expect((await mail.sendWeeklyReviews(MONDAY)).sent).toBe(0);
		expect((await mail.sendWeeklyReviews(MONDAY)).sent).toBe(1);
	});
});

describe('when', () => {
	test('not on a Tuesday', async () => {
		planLastWeek(OWNER, 1);
		const tuesday = new Date('2026-08-25T08:00:00Z');

		expect((await mail.sendWeeklyReviews(tuesday)).sent).toBe(0);
	});

	test('not before their own hour', async () => {
		planLastWeek(OWNER, 1);
		const tooEarly = new Date('2026-08-24T04:00:00Z');

		expect((await mail.sendWeeklyReviews(tooEarly)).sent).toBe(0);
	});

	/**
	 * The hour is the account's, not the app's: the start of its planner grid
	 * plus the instance's offset. Somebody whose day starts at 06:00 is up an
	 * hour before somebody whose day starts at 09:00.
	 */
	test("it follows the planner's own start of day", async () => {
		planLastWeek(OWNER, 1);
		const { setGridHours } = await import('../src/lib/server/settings');

		setGridHours(OWNER, { start: 5, end: 22 });
		expect(mail.reviewMailHour(OWNER)).toBe(5 + mail.reviewMailOffsetHours());

		// 06:00 is now their hour, and it was not before.
		expect((await mail.sendWeeklyReviews(new Date('2026-08-24T06:00:00Z'))).sent).toBe(1);
	});

	test('a grid that starts late does not push the mail into tomorrow', async () => {
		planLastWeek(OWNER, 1);
		const { setGridHours } = await import('../src/lib/server/settings');

		setGridHours(OWNER, { start: 23, end: 24 });
		// 23 + 1 would be midnight, which is the morning of nothing.
		expect(mail.reviewMailHour(OWNER)).toBe(23);
	});

	test("in the account's own timezone, not the server's", async () => {
		planLastWeek(OWNER, 1);
		const { setTimezone } = await import('../src/lib/server/settings');

		// 20:00 UTC on Sunday is 08:00 Monday in Auckland: their Monday morning,
		// and nowhere near the server's.
		setTimezone(OWNER, 'Pacific/Auckland');
		const sundayEvening = new Date('2026-08-23T20:00:00Z');

		expect((await mail.sendWeeklyReviews(sundayEvening)).sent).toBe(1);
	});
});

describe('what it says', () => {
	test('the numbers, and a link back to the week', async () => {
		planLastWeek(OWNER, 1);
		await mail.sendWeeklyReviews(MONDAY);

		const sent = sendEmail.mock.calls[0][0];
		expect(sent.subject).toBe('Your week: 1 of 2');
		expect(sent.text).toContain('1 of the 2 blocks');
		expect(sent.text).toContain(`/tasks/review?week=${LAST_WEEK}`);
	});

	test('what did not happen, by name', async () => {
		planLastWeek(OWNER, 1);
		await mail.sendWeeklyReviews(MONDAY);

		expect(sendEmail.mock.calls[0][0].text).toContain('Deep work');
	});

	test('a way out that needs no password', async () => {
		planLastWeek(OWNER, 1);
		await mail.sendWeeklyReviews(MONDAY);

		const text = sendEmail.mock.calls[0][0].text;
		expect(text).toContain('/mail/weekly-review/off');
		expect(text).toContain(mail.unsubscribeToken(OWNER));
	});
});

describe('the unsubscribe link', () => {
	test('accepts its own signature and refuses everything else', () => {
		const good = mail.unsubscribeToken(OWNER);

		expect(mail.unsubscribeTokenValid(OWNER, good)).toBe(true);
		expect(mail.unsubscribeTokenValid(OWNER, '')).toBe(false);
		expect(mail.unsubscribeTokenValid(OWNER, good + 'x')).toBe(false);
		// The one that matters: somebody else's link must not work on this
		// account, or the id in the URL would be the only thing standing there.
		expect(mail.unsubscribeTokenValid(STRANGER, good)).toBe(false);
	});
});
