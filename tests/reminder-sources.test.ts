/**
 * The reminders nobody types.
 *
 * A reminder somebody sets is easy. These are the ones the app owes them: a
 * week left open, and money with a date on it. Three sentences about a bill
 * because they are three different situations — the day it wants paying, every
 * day it is late, and the day it can no longer be paid — and the whole thing
 * has to be safe to run twice, because the pass that writes them is woken
 * rather than scheduled.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	sources: typeof import('../src/lib/services/reminder-sources');
	reminders: typeof import('../src/lib/services/reminders');
	bills: typeof import('../src/lib/services/bills');
	people: typeof import('../src/lib/services/people');
};

let s: Services;
const ctxAt = (iso: string) => ({ userId: OWNER, now: new Date(iso), tz: 'UTC' });

/** Everything written about bills, as plain sentences. */
function billSaid(ctx: ReturnType<typeof ctxAt>): string[] {
	return s.reminders
		.listReminders(ctx, { includePast: true })
		.filter((r) => r.subjectKind === 'bill')
		.map((r) => r.message);
}

beforeAll(async () => {
	s = {
		sources: await import('../src/lib/services/reminder-sources'),
		reminders: await import('../src/lib/services/reminders'),
		bills: await import('../src/lib/services/bills'),
		people: await import('../src/lib/services/people')
	};

	// Due on the 10th, wanted paid three days earlier.
	s.bills.createBill(ctxAt('2026-08-01T09:00:00Z'), {
		name: 'Rent',
		amountExpected: 1200,
		currency: 'BRL',
		dueDay: 10,
		payLeadDays: 3,
		rhythm: 'monthly'
	});
});

describe('a bill', () => {
	test('says today is the day, on the day it wants paying', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC');
		expect(billSaid(ctx).some((m) => /Today is the day for paying Rent/.test(m))).toBe(true);
	});

	test('and does not say it twice, however often the pass runs', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC');
		const said = billSaid(ctx).filter((m) => /Today is the day for paying Rent/.test(m));
		expect(said).toHaveLength(1);
	});

	test('keeps asking on the days between, which is the point of it', () => {
		const ctx = ctxAt('2026-09-08T06:00:00Z');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC');
		expect(billSaid(ctx).some((m) => /You still have to pay Rent/.test(m))).toBe(true);
	});

	test('and says something sharper on the day it is actually due', () => {
		const ctx = ctxAt('2026-09-10T06:00:00Z');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC');
		const said = billSaid(ctx);
		expect(said.some((m) => /Careful — Rent is due today/.test(m))).toBe(true);
		// Once, and only the sharp sentence: the gentle "you still have to pay"
		// is not also written on the morning it stops being true.
		expect(said.filter((m) => /Careful/.test(m))).toHaveLength(1);
	});

	test('says nothing at all once it is paid', () => {
		const ctx = ctxAt('2026-09-11T06:00:00Z');
		const bill = s.bills.listBills(ctx)[0];
		s.bills.markPaid(ctx, bill.id, { period: '2026-09' });
		const before = billSaid(ctx).length;
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC');
		expect(billSaid(ctx)).toHaveLength(before);
	});
});

describe('the weekly review', () => {
	test('says nothing about a week nobody planned', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		expect(s.sources.ensureReviewReminder(ctx, ctx.now, 'UTC')).toBe(0);
	});
});

describe('a birthday that has not happened yet', () => {
	test('does not claim to be today, because the list is about what is coming', () => {
		const ctx = ctxAt('2026-09-08T06:00:00Z');
		s.people.createPerson(ctx, {
			name: 'Ana',
			birthday: '1992-09-14',
			remindOnBirthday: true
		});

		const coming = s.sources.upcomingDerived(ctx, ctx.now, 'UTC');
		const ana = coming.find((u) => u.message.includes('Ana'));

		expect(ana?.message).toBe('Ana turns 34');
		expect(ana?.message).not.toContain('today');
		// The date is on the row, which is why the sentence does not need one.
		expect(ana?.at.slice(0, 10)).toBe('2026-09-14');
	});

	test('and says only the name when no year was written down', () => {
		const ctx = ctxAt('2026-09-08T06:00:00Z');
		s.people.createPerson(ctx, { name: 'Rui', birthday: '--09-16', remindOnBirthday: true });

		const coming = s.sources.upcomingDerived(ctx, ctx.now, 'UTC');
		expect(coming.find((u) => u.message.includes('Rui'))?.message).toBe("Rui's birthday");
	});
});

/**
 * Money, written the way money is written.
 *
 * Amounts are integers in the currency's smallest unit — two hundred reais is
 * 20000 — because a price added up in floating point is eventually wrong in
 * front of somebody. Every screen runs them through `formatMoney`; these
 * reminders interpolated the integer straight into the sentence, so a bill for
 * two hundred reais announced itself as "Hedi — 20000, due 2026-09-15".
 */
describe('what a bill costs', () => {
	test('is formatted, not printed raw', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC');

		const said = billSaid(ctx).find((m) => /Rent/.test(m)) ?? '';
		// 1200 is twelve reais, not one thousand two hundred of anything.
		expect(said).toMatch(/12[.,]00/);
		expect(said).not.toMatch(/\b1200\b/);
	});

	test('and in the list of what is coming, which is where it was seen', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		const coming = s.sources.upcomingDerived(ctx, ctx.now, 'UTC', 30);

		const bill = coming.find((u) => u.kind === 'bill');
		expect(bill).toBeDefined();
		expect(bill!.message).toMatch(/12[.,]00/);
		expect(bill!.message).not.toMatch(/\b1200\b/);
	});
});

/**
 * The two that were not possible before there was a list of these.
 *
 * "Tell me when things start" was a lead time set on one block at a time,
 * which is the right answer to "ten minutes before gym" and no answer at all
 * to the general question. "Tell me how today went" had nowhere to live: it is
 * the only reminder that is about a day rather than about a thing in it.
 */
describe('blocks, as they start', () => {
	let s2: {
		notifications: typeof import('../src/lib/services/notifications');
		activities: typeof import('../src/lib/services/activities');
		slots: typeof import('../src/lib/services/slots');
		instances: typeof import('../src/lib/services/instances');
	};

	beforeAll(async () => {
		s2 = {
			notifications: await import('../src/lib/services/notifications'),
			activities: await import('../src/lib/services/activities'),
			slots: await import('../src/lib/services/slots'),
			instances: await import('../src/lib/services/instances')
		};

		// Monday 2026-09-07, a block at 09:00.
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		const cat = s2.activities.createCategory(ctx, { name: 'Focus', color: '#1d4ed8' });
		s2.slots.createSlot(ctx, {
			weekday: 0,
			startTime: '09:00',
			durationMinutes: 60,
			mode: 'category',
			categoryId: cat,
			label: 'Write'
		});
		s2.instances.generateInstances(
			ctx,
			new Date('2026-09-07T00:00:00'),
			new Date('2026-09-08T00:00:00')
		);
	});

	/** Every reminder written about a block, as sentences. */
	const blockSaid = (ctx: ReturnType<typeof ctxAt>) =>
		s.reminders
			.listReminders(ctx, { includePast: true })
			.filter((r) => r.subjectKind === 'instance')
			.map((r) => r.message);

	test('says nothing at all until it is turned on', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		expect(s.sources.ensureBlockReminders(ctx, ctx.now, 'UTC')).toBe(0);
		expect(blockSaid(ctx)).toHaveLength(0);
	});

	test('gives each block ahead of now a nudge at its own time', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		s2.notifications.setNotification(ctx, 'blocks', { on: true });

		expect(s.sources.ensureBlockReminders(ctx, ctx.now, 'UTC')).toBe(1);
		expect(blockSaid(ctx)).toContain('Write');

		const written = s.reminders
			.listReminders(ctx, { includePast: true })
			.find((r) => r.subjectKind === 'instance')!;
		expect(written.remindAt).toBe('2026-09-07T09:00:00');
	});

	test('and does not write a second one when the pass runs again', () => {
		const ctx = ctxAt('2026-09-07T07:00:00Z');
		expect(s.sources.ensureBlockReminders(ctx, ctx.now, 'UTC')).toBe(0);
		expect(blockSaid(ctx)).toHaveLength(1);
	});

	test('leaves alone a block whose time has been', () => {
		// Nothing to announce about nine o'clock at eleven: the row would be due
		// the moment it existed and would arrive as though it were news.
		const ctx = ctxAt('2026-09-07T11:00:00Z');
		expect(s.sources.ensureBlockReminders(ctx, ctx.now, 'UTC')).toBe(0);
	});
});

describe('the end of the day', () => {
	let notifications: typeof import('../src/lib/services/notifications');

	const daySaid = (ctx: ReturnType<typeof ctxAt>) =>
		s.reminders.listReminders(ctx, { includePast: true }).filter((r) => r.subjectKind === 'day');

	beforeAll(async () => {
		notifications = await import('../src/lib/services/notifications');
	});

	test('says nothing until it is turned on', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		expect(s.sources.ensureEndOfDayReminder(ctx, ctx.now, 'UTC')).toBe(0);
	});

	test('writes one, ahead of its hour, about the day it is for', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		notifications.setNotification(ctx, 'endOfDay', { on: true, at: '21:00' });

		expect(s.sources.ensureEndOfDayReminder(ctx, ctx.now, 'UTC')).toBe(1);
		const written = daySaid(ctx);
		expect(written).toHaveLength(1);
		expect(written[0].remindAt).toBe('2026-09-07T21:00:00');
		expect(written[0].message).toMatch(/That was today/);
	});

	test('running again writes nothing', () => {
		const ctx = ctxAt('2026-09-07T07:00:00Z');
		expect(s.sources.ensureEndOfDayReminder(ctx, ctx.now, 'UTC')).toBe(0);
		expect(daySaid(ctx)).toHaveLength(1);
	});

	test('moving the hour moves the one row rather than adding a second', () => {
		// It is written hours ahead, so a row at the old hour is a thing about to
		// go off at a time nobody asked for any more.
		const ctx = ctxAt('2026-09-07T07:00:00Z');
		notifications.setNotification(ctx, 'endOfDay', { on: true, at: '19:30' });

		expect(s.sources.ensureEndOfDayReminder(ctx, ctx.now, 'UTC')).toBe(1);
		const written = daySaid(ctx);
		expect(written).toHaveLength(1);
		expect(written[0].remindAt).toBe('2026-09-07T19:30:00');
	});

	test('and not at all once its hour has gone', () => {
		const ctx = ctxAt('2026-09-07T22:00:00Z');
		expect(s.sources.ensureEndOfDayReminder(ctx, ctx.now, 'UTC')).toBe(0);
	});
});
