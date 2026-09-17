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
import { readFileSync } from 'node:fs';
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
/**
 * English, because these tests read the sentences.
 *
 * The sources take a translator rather than reaching for one: they are called
 * from a job that writes for somebody asleep and from a page rendered for
 * whoever is looking, and those are two different languages.
 */
let t: import('../src/lib/i18n/core').Translate;
const ctxAt = (iso: string) => ({ userId: OWNER, now: new Date(iso), tz: 'UTC' });

/** Everything written about bills, as plain sentences. */
function billSaid(ctx: ReturnType<typeof ctxAt>): string[] {
	return s.reminders
		.listReminders(ctx, { includePast: true })
		.filter((r) => r.subjectKind === 'bill')
		.map((r) => r.message);
}

beforeAll(async () => {
	const { translatorFor } = await import('../src/lib/i18n/core');
	t = await translatorFor('en');
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
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC', t);
		expect(billSaid(ctx).some((m) => /Today is the day for paying Rent/.test(m))).toBe(true);
	});

	test('and does not say it twice, however often the pass runs', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC', t);
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC', t);
		const said = billSaid(ctx).filter((m) => /Today is the day for paying Rent/.test(m));
		expect(said).toHaveLength(1);
	});

	test('keeps asking on the days between, which is the point of it', () => {
		const ctx = ctxAt('2026-09-08T06:00:00Z');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC', t);
		expect(billSaid(ctx).some((m) => /You still have to pay Rent/.test(m))).toBe(true);
	});

	test('and says something sharper on the day it is actually due', () => {
		const ctx = ctxAt('2026-09-10T06:00:00Z');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC', t);
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
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC', t);
		expect(billSaid(ctx)).toHaveLength(before);
	});
});

describe('the weekly review', () => {
	test('says nothing about a week nobody planned', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		expect(s.sources.ensureReviewReminder(ctx, ctx.now, 'UTC', t)).toBe(0);
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

		const coming = s.sources.upcomingDerived(ctx, ctx.now, 'UTC', t);
		const ana = coming.find((u) => u.message.includes('Ana'));

		expect(ana?.message).toBe('Ana turns 34');
		expect(ana?.message).not.toContain('today');
		// The date is on the row, which is why the sentence does not need one.
		expect(ana?.at.slice(0, 10)).toBe('2026-09-14');
	});

	test('and says only the name when no year was written down', () => {
		const ctx = ctxAt('2026-09-08T06:00:00Z');
		s.people.createPerson(ctx, { name: 'Rui', birthday: '--09-16', remindOnBirthday: true });

		const coming = s.sources.upcomingDerived(ctx, ctx.now, 'UTC', t);
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
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC', t);

		const said = billSaid(ctx).find((m) => /Rent/.test(m)) ?? '';
		// 1200 is twelve reais, not one thousand two hundred of anything.
		expect(said).toMatch(/12[.,]00/);
		expect(said).not.toMatch(/\b1200\b/);
	});

	test('and in the list of what is coming, which is where it was seen', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		const coming = s.sources.upcomingDerived(ctx, ctx.now, 'UTC', t, 30);

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
		expect(s.sources.ensureEndOfDayReminder(ctx, ctx.now, 'UTC', t)).toBe(0);
	});

	test('writes one, ahead of its hour, about the day it is for', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		notifications.setNotification(ctx, 'endOfDay', { on: true, at: '21:00' });

		expect(s.sources.ensureEndOfDayReminder(ctx, ctx.now, 'UTC', t)).toBe(1);
		const written = daySaid(ctx);
		expect(written).toHaveLength(1);
		expect(written[0].remindAt).toBe('2026-09-07T21:00:00');
		expect(written[0].message).toMatch(/That was today/);
	});

	test('running again writes nothing', () => {
		const ctx = ctxAt('2026-09-07T07:00:00Z');
		expect(s.sources.ensureEndOfDayReminder(ctx, ctx.now, 'UTC', t)).toBe(0);
		expect(daySaid(ctx)).toHaveLength(1);
	});

	test('moving the hour moves the one row rather than adding a second', () => {
		// It is written hours ahead, so a row at the old hour is a thing about to
		// go off at a time nobody asked for any more.
		const ctx = ctxAt('2026-09-07T07:00:00Z');
		notifications.setNotification(ctx, 'endOfDay', { on: true, at: '19:30' });

		expect(s.sources.ensureEndOfDayReminder(ctx, ctx.now, 'UTC', t)).toBe(1);
		const written = daySaid(ctx);
		expect(written).toHaveLength(1);
		expect(written[0].remindAt).toBe('2026-09-07T19:30:00');
	});

	test('and not at all once its hour has gone', () => {
		const ctx = ctxAt('2026-09-07T22:00:00Z');
		expect(s.sources.ensureEndOfDayReminder(ctx, ctx.now, 'UTC', t)).toBe(0);
	});
});

/**
 * The whole way from "tell me when blocks start" to what a phone books.
 *
 * Every step of this passes on its own and the chain is what matters: the pass
 * has to write the row, and `upcomingReminders` has to hand that row to the
 * phone. Read in a zone that is not UTC, because that is where the last break
 * in this chain lived — the two ends compared wall-clock against an instant,
 * which happens to agree in UTC and nowhere else.
 */
describe('a block starting later today, end to end', () => {
	let s3: {
		notifications: typeof import('../src/lib/services/notifications');
		activities: typeof import('../src/lib/services/activities');
		slots: typeof import('../src/lib/services/slots');
		instances: typeof import('../src/lib/services/instances');
	};

	/** The same account, read three hours west of UTC. */
	const west = (iso: string) => ({
		userId: OWNER,
		now: new Date(iso),
		tz: 'America/Sao_Paulo'
	});

	beforeAll(async () => {
		s3 = {
			notifications: await import('../src/lib/services/notifications'),
			activities: await import('../src/lib/services/activities'),
			slots: await import('../src/lib/services/slots'),
			instances: await import('../src/lib/services/instances')
		};

		// Tuesday 2026-09-15 local, a block at 18:00.
		const ctx = west('2026-09-15T12:00:00Z');
		const cat = s3.activities.createCategory(ctx, { name: 'Evening', color: '#b45309' });
		s3.slots.createSlot(ctx, {
			weekday: 1,
			startTime: '18:00',
			durationMinutes: 60,
			mode: 'category',
			categoryId: cat,
			label: 'Cook'
		});
		s3.instances.generateInstances(
			ctx,
			new Date('2026-09-15T00:00:00'),
			new Date('2026-09-16T00:00:00')
		);
	});

	test('is written as a reminder, and handed to the phone to book', () => {
		// 12:00Z is 09:00 in São Paulo: the block is nine hours off.
		const ctx = west('2026-09-15T12:00:00Z');
		s3.notifications.setNotification(ctx, 'blocks', { on: true });

		expect(s.sources.ensureOwnReminders(ctx, ctx.now, ctx.tz, t)).toBeGreaterThan(0);

		const written = s.reminders
			.listReminders(ctx)
			.find((r) => r.subjectKind === 'instance' && r.message === 'Cook');
		expect(written, 'no reminder was written for the block').toBeTruthy();
		expect(written!.remindAt).toBe('2026-09-15T18:00:00');

		// And this is the list `/api/reminders?upcoming=1` hands the phone.
		const upcoming = s.reminders.upcomingReminders(ctx);
		expect(
			upcoming.some((r) => r.id === written!.id),
			'the phone was never given it to book'
		).toBe(true);
	});

	test('and once its hour has gone, it is not written again', () => {
		// 23:00Z is 20:00 local — two hours after the block. Nothing to announce.
		const ctx = west('2026-09-15T23:00:00Z');
		const before = s.reminders
			.listReminders(ctx, { includePast: true })
			.filter((r) => r.subjectKind === 'instance').length;
		s.sources.ensureOwnReminders(ctx, ctx.now, ctx.tz, t);
		expect(
			s.reminders
				.listReminders(ctx, { includePast: true })
				.filter((r) => r.subjectKind === 'instance').length
		).toBe(before);
	});
});

/**
 * Every switch on the notifications screen actually stops its source.
 *
 * The screen is a list of switches and the sources are five separate
 * functions, and "on" was the only state any of them had ever been in: three
 * of them — the review nag, bills, birthdays — always happened, and the gate
 * was added to them long after they were written. A gate nobody has seen
 * closed is a gate that might be reading the wrong key, or a key nobody
 * writes, and the symptom is a notification arriving after you turned it off,
 * which is the one kind nobody forgives.
 *
 * Driven through `ensureOwnReminders`, because that is the call every caller
 * actually makes — a gate that works when the source is called directly and
 * not through the pass would be no gate at all.
 */
describe('a switch that is off', () => {
	let notifications: typeof import('../src/lib/services/notifications');

	const kinds = (ctx: ReturnType<typeof ctxAt>, kind: string) =>
		s.reminders.listReminders(ctx, { includePast: true }).filter((r) => r.subjectKind === kind)
			.length;

	beforeAll(async () => {
		notifications = await import('../src/lib/services/notifications');
	});

	test('stops bills being written, and turning it back on resumes them', () => {
		// A day the Rent bill wants paying, in a month nothing else has touched.
		const ctx = ctxAt('2026-11-07T06:00:00Z');

		notifications.setNotification(ctx, 'bills', { on: false });
		const before = kinds(ctx, 'bill');
		s.sources.ensureOwnReminders(ctx, ctx.now, 'UTC', t);
		expect(kinds(ctx, 'bill'), 'a bill was written with bills off').toBe(before);

		notifications.setNotification(ctx, 'bills', { on: true });
		s.sources.ensureOwnReminders(ctx, ctx.now, 'UTC', t);
		expect(kinds(ctx, 'bill'), 'nothing was written with bills on').toBeGreaterThan(before);
	});

	test('stops birthdays being written, and turning it back on resumes them', () => {
		const ctx = ctxAt('2026-09-16T06:00:00Z');
		s.people.createPerson(ctx, {
			name: 'Switched',
			birthday: '--09-17',
			remindOnBirthday: true
		});
		const tomorrow = ctxAt('2026-09-17T06:00:00Z');

		notifications.setNotification(tomorrow, 'birthdays', { on: false });
		const before = kinds(tomorrow, 'person');
		s.sources.ensureOwnReminders(tomorrow, tomorrow.now, 'UTC', t);
		expect(kinds(tomorrow, 'person'), 'a birthday was written with birthdays off').toBe(before);

		notifications.setNotification(tomorrow, 'birthdays', { on: true });
		s.sources.ensureOwnReminders(tomorrow, tomorrow.now, 'UTC', t);
		expect(kinds(tomorrow, 'person'), 'nothing was written with birthdays on').toBeGreaterThan(
			before
		);
	});

	/**
	 * And the structural half: every source asks before it writes.
	 *
	 * The three tests above each need a state the source would otherwise write
	 * in, which is why the review nag is not among them — a pending week is a
	 * fixture of its own. This catches the case those cannot: a source added
	 * later, or one whose gate is deleted, with nothing on the screen to show
	 * for it.
	 */
	test('and every source in the file asks before it writes', () => {
		const source = readFileSync('src/lib/services/reminder-sources.ts', 'utf8');
		const ensures = [...source.matchAll(/export function (ensure\w+)\(([\s\S]*?)\n}/g)];
		// `ensureOwnReminders` is the pass itself: it calls the others, which do
		// the asking. Everything else is a source and has to.
		const sources = ensures.filter(([, name]) => name !== 'ensureOwnReminders');
		expect(sources.length, 'no sources were found — has the file moved?').toBeGreaterThan(2);

		for (const [, name, body] of sources) {
			expect(body.includes('notifies('), `${name} writes without asking`).toBe(true);
		}
	});
});

/**
 * The sentences are the reader's, in their words and in their calendar.
 *
 * These are the one part of the app written by a job rather than by a person,
 * and they were English with an ISO date in them — "Rent — R$1,800.00, due
 * 2026-10-05" — in an app whose every other surface was translated. A date in
 * that shape is a machine's answer to a question nobody asked: these sentences
 * are about the next few weeks, so the year in them is always this one.
 */
describe('the words a reminder is written in', () => {
	test('names the day the way a person says it, without the year', async () => {
		const { translatorFor } = await import('../src/lib/i18n/core');
		const ctx = ctxAt('2026-09-08T06:00:00Z');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC', await translatorFor('en'));
		const said = billSaid(ctx).find((m) => /You still have to pay Rent/.test(m)) ?? '';
		expect(said).toMatch(/due \w+ \d+\.?$/);
		expect(said, 'the year has no business in a sentence about this month').not.toMatch(/20\d\d/);
	});

	test('is written in the language it was asked for', async () => {
		const { translatorFor } = await import('../src/lib/i18n/core');
		const ctx = ctxAt('2026-10-08T06:00:00Z');
		s.sources.ensureBillReminders(ctx, ctx.now, 'UTC', await translatorFor('pt-BR'));
		const said = billSaid(ctx).find((m) => /ainda precisa pagar/.test(m)) ?? '';
		// "vence em 10 de out." — his words, and his month.
		expect(said).toMatch(/vence em \d+ de \w+/);
		expect(said).not.toMatch(/20\d\d/);
	});
});
