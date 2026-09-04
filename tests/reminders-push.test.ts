import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

/**
 * Being told with the app closed.
 *
 * Reminders used to reach exactly one place: a page that was open *and* in
 * front of somebody. On a phone they never arrived at all — Android refuses a
 * notification raised outside a service worker, and with the app closed there
 * was nothing running to raise one. So the feature worked for the person who
 * did not need reminding.
 *
 * These are the parts of the fix that can be tested without a browser and a
 * real push service: which rows the job picks up, what happens to a
 * subscription the push service has given up on, and that the two channels
 * cannot swallow each other's reminders. The browser end — permission, the
 * subscription, the worker showing the notification — is `e2e/reminders.e2e.ts`.
 */

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

/** What the fake push service does with the next send. */
let outcome: 'ok' | { status: number } = 'ok';
const sends: { endpoint: string; body: string }[] = [];

vi.mock('web-push', () => ({
	default: {
		generateVAPIDKeys: () => ({ publicKey: 'test-public', privateKey: 'test-private' }),
		setVapidDetails: () => {},
		sendNotification: async (subscription: { endpoint: string }, body: string) => {
			sends.push({ endpoint: subscription.endpoint, body });
			if (outcome !== 'ok') {
				const error = new Error('push service said no') as Error & { statusCode: number };
				error.statusCode = outcome.status;
				throw error;
			}
			return { statusCode: 201 };
		}
	}
}));

const push = await import('../src/lib/server/services/push');
const reminders = await import('../src/lib/server/services/reminders');
const birthdays = await import('../src/lib/server/services/birthdays');
const delivery = await import('../src/lib/server/services/reminder-delivery');
const { buildCtx } = await import('../src/lib/server/services/ctx');

const ctx = () => buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T09:00:00Z') });

/** A subscription in the shape a browser hands over. */
function device(endpoint: string) {
	return { endpoint, keys: { p256dh: 'key-material', auth: 'auth-secret' } };
}

beforeEach(() => {
	sends.length = 0;
	outcome = 'ok';
	database.exec('delete from push_subscriptions');
	database.exec('delete from reminders');
	database.exec('delete from people');
	push.forgetKeys();
});

describe('a browser signing up', () => {
	test('is remembered once, however many times it asks', () => {
		push.saveSubscription(ctx(), device('https://push.example/aaa'), 'Firefox on Linux');
		push.saveSubscription(ctx(), device('https://push.example/aaa'), 'Firefox on Linux');

		expect(push.subscriptionsFor(OWNER)).toHaveLength(1);
	});

	test('belongs to one account and is invisible to another', () => {
		push.saveSubscription(ctx(), device('https://push.example/aaa'));

		expect(push.subscriptionsFor(STRANGER)).toHaveLength(0);
	});

	test('and a plain-http endpoint is refused', () => {
		expect(() => push.saveSubscription(ctx(), device('http://push.example/aaa'))).toThrow();
	});

	test('re-subscribing forgives the failures counted against it', () => {
		push.saveSubscription(ctx(), device('https://push.example/aaa'));
		database.exec('update push_subscriptions set failures = 7');

		push.saveSubscription(ctx(), device('https://push.example/aaa'));

		const row = database.get('select failures from push_subscriptions') as { failures: number };
		expect(row.failures).toBe(0);
	});
});

describe('pushing', () => {
	test('reaches every device the account has', async () => {
		push.saveSubscription(ctx(), device('https://push.example/laptop'));
		push.saveSubscription(ctx(), device('https://push.example/phone'));

		const { sent, failed } = await push.pushToUser(OWNER, { title: 'Gym in ten minutes' });

		expect(sent).toBe(2);
		expect(failed).toEqual([]);
		expect(sends.map((s) => s.endpoint).sort()).toEqual([
			'https://push.example/laptop',
			'https://push.example/phone'
		]);
	});

	/**
	 * The one that keeps the table from filling up with the dead. A push service
	 * answers 410 for a subscription that is gone for good — an uninstalled
	 * browser, a revoked permission — and retrying it every minute for years is
	 * the alternative to this.
	 */
	test('drops a subscription the push service says is gone', async () => {
		push.saveSubscription(ctx(), device('https://push.example/old'));
		outcome = { status: 410 };

		await push.pushToUser(OWNER, { title: 'Anything' });

		expect(push.subscriptionsFor(OWNER)).toHaveLength(0);
	});

	test('but keeps one that merely failed, and counts it', async () => {
		push.saveSubscription(ctx(), device('https://push.example/flaky'));
		outcome = { status: 500 };

		await push.pushToUser(OWNER, { title: 'Anything' });

		const row = database.get('select failures from push_subscriptions') as { failures: number };
		expect(row.failures).toBe(1);
		expect(push.subscriptionsFor(OWNER)).toHaveLength(1);
	});

	test('and gives up on one that has failed for long enough', async () => {
		push.saveSubscription(ctx(), device('https://push.example/dead'));
		database.exec('update push_subscriptions set failures = 19');
		outcome = { status: 500 };

		await push.pushToUser(OWNER, { title: 'Anything' });

		expect(push.subscriptionsFor(OWNER)).toHaveLength(0);
	});

	test('an account with no devices is not an error', async () => {
		expect(await push.pushToUser(OWNER, { title: 'Anything' })).toEqual({ sent: 0, failed: [] });
	});

	/**
	 * A subscription made against a key this instance no longer has.
	 *
	 * The push service answers 403: the browser pinned the old key when it
	 * subscribed, so this can never succeed. Left in the table it fails every
	 * minute forever while somebody wonders why their phone is quiet — and the
	 * count that reported it, "sent to 1 of 2 devices", reads as "the phone was
	 * not seen", which is the one thing it does not mean.
	 */
	test('a subscription for a different key is dropped, and says so', async () => {
		push.saveSubscription(ctx(), device('https://push.example/old-key'), 'Chrome on Android');
		outcome = { status: 403 };

		const { sent, failed } = await push.pushToUser(OWNER, { title: 'Anything' });

		expect(sent).toBe(0);
		expect(push.subscriptionsFor(OWNER), 'it will fail forever if it is kept').toHaveLength(0);
		expect(failed).toHaveLength(1);
		expect(failed[0].device).toBe('Chrome on Android');
		expect(failed[0].why, 'the message does not say what to do').toMatch(/turn notifications on/i);
	});

	test('and a device that merely failed is named too', async () => {
		push.saveSubscription(ctx(), device('https://push.example/flaky2'), 'Firefox on Linux');
		outcome = { status: 500 };

		const { failed } = await push.pushToUser(OWNER, { title: 'Anything' });

		expect(failed[0].device).toBe('Firefox on Linux');
		expect(failed[0].why).toContain('500');
	});
});

describe('the delivery pass', () => {
	function reminderAt(at: string, message = 'Gym in ten minutes') {
		database.exec(
			`insert into reminders (user_id, subject_kind, subject_id, remind_at, message) values (?, 'instance', 1, ?, ?)`,
			OWNER,
			at,
			message
		);
	}

	test('pushes what is due and leaves what is not', async () => {
		push.saveSubscription(ctx(), device('https://push.example/phone'));
		reminderAt('2026-03-14T08:50:00');
		reminderAt('2026-03-14T23:00:00', 'Much later');

		await delivery.deliverDueReminders(new Date('2026-03-14T09:00:00Z'));

		expect(sends).toHaveLength(1);
		expect(JSON.parse(sends[0].body).title).toBe('Gym in ten minutes');
	});

	test('and does not push the same reminder twice', async () => {
		push.saveSubscription(ctx(), device('https://push.example/phone'));
		reminderAt('2026-03-14T08:50:00');

		await delivery.deliverDueReminders(new Date('2026-03-14T09:00:00Z'));
		await delivery.deliverDueReminders(new Date('2026-03-14T09:01:00Z'));

		expect(sends).toHaveLength(1);
	});

	/**
	 * The two channels are separate on purpose. A reminder that reached a locked
	 * phone at ten to nine is still worth seeing on the planner at nine, and a
	 * card dismissed on the laptop must not cause the phone to be pushed the
	 * same thing again.
	 */
	test('pushing does not consume the card the open page would show', async () => {
		push.saveSubscription(ctx(), device('https://push.example/phone'));
		reminderAt('2026-03-14T08:50:00');

		await delivery.deliverDueReminders(new Date('2026-03-14T09:00:00Z'));

		expect(reminders.dueReminders(ctx())).toHaveLength(1);
	});

	test('and showing it on the page does not stop the phone being told', async () => {
		push.saveSubscription(ctx(), device('https://push.example/phone'));
		reminderAt('2026-03-14T08:50:00');
		const due = reminders.dueReminders(ctx());
		reminders.markDelivered(
			ctx(),
			due.map((r) => r.id)
		);

		await delivery.deliverDueReminders(new Date('2026-03-14T09:00:00Z'));

		expect(sends).toHaveLength(1);
	});

	/**
	 * An account that never turned notifications on still has due reminders, and
	 * leaving them unstamped would make every one of them a candidate on every
	 * run for as long as the account exists.
	 */
	test('a reminder for an account with no devices is not reconsidered forever', async () => {
		reminderAt('2026-03-14T08:50:00');

		await delivery.deliverDueReminders(new Date('2026-03-14T09:00:00Z'));

		const row = database.get('select pushed_at from reminders') as { pushed_at: string | null };
		expect(row.pushed_at).not.toBeNull();
	});

	test('one account is never pushed another account’s reminder', async () => {
		push.saveSubscription(ctx(), device('https://push.example/mine'));
		database.exec(
			`insert into reminders (user_id, subject_kind, subject_id, remind_at, message) values (?, 'instance', 1, ?, ?)`,
			STRANGER,
			'2026-03-14T08:50:00',
			'Not yours'
		);

		await delivery.deliverDueReminders(new Date('2026-03-14T09:00:00Z'));

		expect(sends).toHaveLength(0);
	});
});

describe('a birthday', () => {
	function person(name: string, birthday: string, tellMe = 1) {
		database.exec(
			'insert into people (user_id, name, birthday, remind_on_birthday) values (?, ?, ?, ?)',
			OWNER,
			name,
			birthday,
			tellMe
		);
	}

	const onTheDay = new Date('2026-03-14T00:30:00Z');

	test('becomes a reminder at the hour the day starts', () => {
		person('Ana', '1992-03-14');

		expect(birthdays.ensureBirthdayReminders(OWNER, onTheDay, 'UTC')).toBe(1);

		const row = database.get('select remind_at, message, subject_kind from reminders') as Record<
			string,
			string
		>;
		// Six is the default first hour of the planner grid.
		expect(row.remind_at).toBe('2026-03-14T06:00:00');
		expect(row.subject_kind).toBe('person');
		expect(row.message).toBe('Ana turns 34 today');
	});

	test('and follows the account’s own start of day', () => {
		database.exec(
			"insert into user_settings (user_id, key, value) values (?, 'planner.grid_start_hour', '5')",
			OWNER
		);
		person('Ana', '1992-03-14');

		birthdays.ensureBirthdayReminders(OWNER, onTheDay, 'UTC');

		const row = database.get('select remind_at from reminders') as { remind_at: string };
		expect(row.remind_at).toBe('2026-03-14T05:00:00');
		database.exec("delete from user_settings where key = 'planner.grid_start_hour'");
	});

	test('says the plain thing when the year was never known', () => {
		person('Bruno', '--03-14');

		birthdays.ensureBirthdayReminders(OWNER, onTheDay, 'UTC');

		const row = database.get('select message from reminders') as { message: string };
		expect(row.message).toBe("Bruno's birthday is today");
	});

	test('is written once however many times the day is swept', () => {
		person('Ana', '1992-03-14');

		birthdays.ensureBirthdayReminders(OWNER, onTheDay, 'UTC');
		birthdays.ensureBirthdayReminders(OWNER, new Date('2026-03-14T09:00:00Z'), 'UTC');
		birthdays.ensureBirthdayReminders(OWNER, new Date('2026-03-14T23:00:00Z'), 'UTC');

		const row = database.get('select count(*) as n from reminders') as { n: number };
		expect(row.n).toBe(1);
	});

	test('does not come back once it has been dismissed', () => {
		person('Ana', '1992-03-14');
		birthdays.ensureBirthdayReminders(OWNER, onTheDay, 'UTC');
		database.exec("update reminders set dismissed_at = '2026-03-14T06:05:00'");

		birthdays.ensureBirthdayReminders(OWNER, new Date('2026-03-14T18:00:00Z'), 'UTC');

		const row = database.get('select count(*) as n from reminders') as { n: number };
		expect(row.n).toBe(1);
	});

	test('is not written for somebody whose box is unticked', () => {
		person('Colleague', '1980-03-14', 0);

		expect(birthdays.ensureBirthdayReminders(OWNER, onTheDay, 'UTC')).toBe(0);
	});

	test('or on any other day of the year', () => {
		person('Ana', '1992-03-14');

		expect(birthdays.ensureBirthdayReminders(OWNER, new Date('2026-03-15T09:00:00Z'), 'UTC')).toBe(
			0
		);
	});

	test('and is pushed like any other reminder', async () => {
		push.saveSubscription(ctx(), device('https://push.example/phone'));
		person('Ana', '1992-03-14');

		await delivery.deliverDueReminders(new Date('2026-03-14T09:00:00Z'));

		expect(sends).toHaveLength(1);
		const payload = JSON.parse(sends[0].body);
		expect(payload.title).toBe('Ana turns 34 today');
		// It leads to the person, not to a day on the planner: a notification you
		// cannot follow is one you have to remember twice.
		expect(payload.url).toMatch(/^\/diary\/people\?person=\d+$/);
	});
});
