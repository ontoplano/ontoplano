/**
 * A page's poll does not repeat a pass the clock has just run.
 *
 * Every open tab asked for the reminder pass twice a minute, and on a served
 * instance the clock runs it for every account anyway — so the polls were the
 * busiest work the server did, and all of it repeated. What has to hold: once
 * a clock runs, a poll inside the window writes nothing; the clock itself is
 * never skipped; and a write by the account clears the mark, so the poll a page
 * makes right after a change still sees it.
 *
 * Its own file because the switch is process-wide: once thrown, every other
 * test in the same file would be polling against a clock.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let sources: typeof import('../src/lib/services/reminder-sources');
let reminders: typeof import('../src/lib/services/reminders');
let bills: typeof import('../src/lib/services/bills');
let t: import('../src/lib/i18n/core').Translate;
const ctxAt = (iso: string) => ({ userId: OWNER, now: new Date(iso), tz: 'UTC' });
const billRows = (ctx: ReturnType<typeof ctxAt>) =>
	reminders.listReminders(ctx, { includePast: true }).filter((r) => r.subjectKind === 'bill')
		.length;

beforeAll(async () => {
	t = await (await import('../src/lib/i18n/core')).translatorFor('en');
	sources = await import('../src/lib/services/reminder-sources');
	reminders = await import('../src/lib/services/reminders');
	bills = await import('../src/lib/services/bills');
	sources.passesRunOnAClock();
});

describe('with a clock running the pass', () => {
	test('a poll right after a pass writes nothing, and the next write clears that', () => {
		const ctx = ctxAt('2026-09-07T06:00:00Z');
		sources.ensureOwnReminders(ctx, ctx.now, 'UTC', t, { always: true });

		// Due on the 10th, wanted paid three days earlier — so today.
		const later = ctxAt('2026-09-07T06:00:20Z');
		addBill('Rent', later);
		const before = billRows(later);

		sources.ensureOwnReminders(later, later.now, 'UTC', t);
		expect(billRows(later), 'a poll inside the window ran the pass').toBe(before);

		// What `hooks.server.ts` does after any write by this account.
		sources.forgetReminderPass(OWNER);
		sources.ensureOwnReminders(later, later.now, 'UTC', t);
		expect(billRows(later), 'the poll after a write did not run the pass').toBeGreaterThan(before);
	});

	test('a poll a minute on runs it again', () => {
		const ctx = ctxAt('2026-10-07T06:00:00Z');
		sources.ensureOwnReminders(ctx, ctx.now, 'UTC', t, { always: true });
		// Made through the service, not a request, so nothing clears the mark.
		addBill('Water', ctx);
		const before = billRows(ctx);

		const soon = new Date(ctx.now.getTime() + sources.PASS_EVERY_MS / 2);
		sources.ensureOwnReminders({ ...ctx, now: soon }, soon, 'UTC', t);
		expect(billRows(ctx), 'half a minute on, the poll ran').toBe(before);

		const minuteOn = new Date(ctx.now.getTime() + sources.PASS_EVERY_MS);
		sources.ensureOwnReminders({ ...ctx, now: minuteOn }, minuteOn, 'UTC', t);
		expect(billRows(ctx), 'a minute on, the poll still did not run').toBeGreaterThan(before);
	});

	test('the clock itself is never skipped', () => {
		const ctx = ctxAt('2026-11-07T06:00:00Z');
		sources.ensureOwnReminders(ctx, ctx.now, 'UTC', t);
		addBill('Gas', ctx);
		const before = billRows(ctx);

		const soon = new Date(ctx.now.getTime() + 1000);
		sources.ensureOwnReminders({ ...ctx, now: soon }, soon, 'UTC', t, { always: true });
		expect(billRows(ctx), 'the clock was skipped by the poll before it').toBeGreaterThan(before);
	});
});

/** A monthly bill wanted paid on the 7th, made at that moment. */
function addBill(name: string, ctx: ReturnType<typeof ctxAt>) {
	bills.createBill(ctx, {
		name,
		amountExpected: 100,
		currency: 'BRL',
		dueDay: 10,
		payLeadDays: 3,
		rhythm: 'monthly'
	});
}
