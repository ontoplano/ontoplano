import { afterAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';
import { refusal } from './helpers/refusal';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const ledger = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const ctx = { userId: OWNER, tz: 'Africa/Nairobi', now: new Date('2026-10-02T10:00:00Z') };
const stranger = { ...ctx, userId: STRANGER };
let serial = 0;
const account = (input = {}) => ledger.createLedger(ctx, { name: `Balance ${++serial}`, ...input });
const line = (id: number, day: string, amount: number) =>
	statements.recordMovement(ctx, {
		ledgerId: id,
		occurredOn: day,
		amountCents: amount,
		description: 'Synthetic movement'
	});

describe('declared openings', () => {
	test('inclusive as-of arithmetic excludes old and future movements without altering history', () => {
		const l = account({ currency: 'KES', openingMinor: 13262, openingOn: '2026-09-01' });
		line(l.id, '2026-08-31', -1000);
		line(l.id, '2026-09-01', -2000);
		line(l.id, '2026-09-02', -3000);
		line(l.id, '2026-10-03', 50000);
		const at = ledger.listLedgers(ctx, { asOf: '2026-09-02' }).find((x) => x.id === l.id)!;
		expect(at).toMatchObject({
			openingMinor: 13262,
			openingOn: '2026-09-01',
			supportedMinor: 8262,
			outsideCoveredPeriod: 1,
			balanceStatus: 'supported',
			asOf: '2026-09-02'
		});
		expect(
			ledger.listLedgers(ctx, { asOf: '2026-08-30' }).find((x) => x.id === l.id)?.supportedMinor
		).toBeNull();
		const before = database.all(
			'select * from finance_transactions where ledger_id = ? order by id',
			l.id
		);
		ledger.updateLedger(ctx, l.id, { openingOn: '2026-09-02' });
		expect(ledger.getLedger(ctx, l.id)).toMatchObject({
			supportedMinor: 10262,
			outsideCoveredPeriod: 2
		});
		expect(
			database.all('select * from finance_transactions where ledger_id = ? order by id', l.id)
		).toEqual(before);
	});
	test('no opening is recorded-only, unknown currency is never defaulted', () => {
		const l = account();
		line(l.id, '2026-09-02', 1200);
		expect(ledger.getLedger(ctx, l.id)).toMatchObject({
			currency: null,
			openingOn: null,
			supportedMinor: null,
			recordedMinor: 1200,
			balanceStatus: 'recorded'
		});
		ledger.updateLedger(ctx, l.id, { currency: 'KES', openingMinor: 0, openingOn: '2026-09-01' });
		expect(ledger.getLedger(ctx, l.id)).toMatchObject({ currency: 'KES', supportedMinor: 1200 });
		ledger.updateLedger(ctx, l.id, { openingOn: null });
		expect(ledger.getLedger(ctx, l.id).supportedMinor).toBeNull();
	});
	test('reject invalid dates, currency and unsafe minor units', () => {
		for (const openingOn of ['2026-02-30', '2026-2-01', 'bad'])
			expect(() => account({ openingOn })).toThrow();
		for (const openingMinor of [1.1, Number.MAX_SAFE_INTEGER + 1, Infinity])
			expect(() => account({ openingMinor })).toThrow();
		expect(() => account({ currency: 'ZZZ' })).toThrow();
		const l = account({ openingOn: '2026-09-01', openingMinor: Number.MAX_SAFE_INTEGER });
		line(l.id, '2026-09-02', 1);
		expect(() => ledger.getLedger(ctx, l.id)).toThrow();
		// Remove the deliberately unreportable account so later list tests stay meaningful.
		database.exec('delete from finance_transactions where ledger_id = ?', l.id);
		ledger.deleteLedger(ctx, l.id);
	});
});

test('opening edits roll back if the supported result would become inexact, and currency changes do not reinterpret evidence', () => {
	const l = account({ currency: 'KES', openingOn: '2026-09-01', openingMinor: 0 });
	line(l.id, '2026-09-02', 2);
	expect(() => ledger.updateLedger(ctx, l.id, { openingMinor: Number.MAX_SAFE_INTEGER })).toThrow();
	expect(ledger.getLedger(ctx, l.id)).toMatchObject({ openingMinor: 0, supportedMinor: 2 });
	expect(() => ledger.updateLedger(ctx, l.id, { currency: 'JPY' })).toThrow();
	const evidence = account({ currency: 'EUR' });
	ledger.recordBalanceCheck(ctx, { ledgerId: evidence.id, asOf: '2026-10-01', observedMinor: 10 });
	expect(() => ledger.updateLedger(ctx, evidence.id, { currency: 'JPY' })).toThrow();
	expect(ledger.getLedger({ ...ctx, now: new Date('2026-10-01T22:00:00Z') }, l.id).asOf).toBe(
		'2026-10-02'
	);
});

describe('statement observations', () => {
	test('evidence without opening is retained, then re-evaluated; differences never create entries', () => {
		const l = account({ currency: 'KES' });
		line(l.id, '2026-09-02', -5000);
		const check = ledger.recordBalanceCheck(ctx, {
			ledgerId: l.id,
			asOf: '2026-10-01',
			observedMinor: 137062,
			note: 'Statement closing'
		});
		expect(check).toMatchObject({
			observedMinor: 137062,
			computedMinor: null,
			differenceMinor: null,
			status: 'unverified'
		});
		ledger.updateLedger(ctx, l.id, { openingMinor: 142062, openingOn: '2026-09-01' });
		expect(ledger.getLedger(ctx, l.id)).toMatchObject({
			balanceStatus: 'verified',
			latestCheck: { status: 'matched', computedMinor: 137062, differenceMinor: 0 }
		});
		const next = ledger.recordBalanceCheck(ctx, {
			ledgerId: l.id,
			asOf: '2026-10-02',
			observedMinor: 137063
		});
		expect(next).toMatchObject({ status: 'different', differenceMinor: 1 });
		expect(ledger.getLedger(ctx, l.id).balanceStatus).toBe('supported');
		expect(ledger.listBalanceChecks(ctx, l.id).map((x) => x.id)).toEqual([next.id, check.id]);
		expect(statements.listMovements(ctx, { ledgerId: l.id })).toHaveLength(1);
		expect(() =>
			ledger.recordBalanceCheck(ctx, { ledgerId: l.id, asOf: '2026-10-02', observedMinor: 999 })
		).toThrow();
		expect(ledger.listBalanceChecks(ctx, l.id)[0].observedMinor).toBe(137063);
		ledger.deleteBalanceCheck(ctx, next.id);
		expect(ledger.getLedger(ctx, l.id).balanceStatus).toBe('verified');
		ledger.updateLedger(ctx, l.id, { openingOn: '2026-10-02' });
		expect(ledger.listBalanceChecks(ctx, l.id)[0].status).toBe('unverified');
	});
	test('editing movements re-evaluates checks; future evidence does not verify a past balance', () => {
		const l = account({ currency: 'EUR', openingOn: '2026-09-01', openingMinor: 100 });
		const m = line(l.id, '2026-09-02', 100);
		ledger.recordBalanceCheck(ctx, { ledgerId: l.id, asOf: '2026-10-01', observedMinor: 200 });
		expect(ledger.getLedger(ctx, l.id).balanceStatus).toBe('verified');
		expect(
			ledger.listLedgers(ctx, { asOf: '2026-09-30' }).find((x) => x.id === l.id)?.balanceStatus
		).toBe('supported');
		statements.updateMovement(ctx, m.id, { amountCents: 150 });
		expect(ledger.listBalanceChecks(ctx, l.id)[0]).toMatchObject({
			status: 'different',
			differenceMinor: -50
		});
	});
	test('cross-owner reads/writes equal missing records, and delete cascades checks', () => {
		const l = account({ currency: 'KES' });
		const check = ledger.recordBalanceCheck(ctx, {
			ledgerId: l.id,
			asOf: '2026-10-01',
			observedMinor: 10
		});
		expect(refusal(() => ledger.listBalanceChecks(stranger, l.id))).toEqual(
			refusal(() => ledger.listBalanceChecks(stranger, 999999))
		);
		const record = (id: number) =>
			ledger.recordBalanceCheck(stranger, { ledgerId: id, asOf: '2026-10-01', observedMinor: 10 });
		expect(refusal(() => record(l.id))).toEqual(refusal(() => record(999999)));
		expect(refusal(() => ledger.deleteBalanceCheck(stranger, check.id))).toEqual(
			refusal(() => ledger.deleteBalanceCheck(stranger, 999999))
		);
		ledger.deleteLedger(ctx, l.id);
		expect(
			database.get('select count(*) as n from finance_balance_checks where ledger_id = ?', l.id)
		).toEqual({ n: 0 });
	});
});

test('currency funds include only covered active accounts, naming every exclusion', () => {
	const local = { ...ctx, userId: STRANGER };
	const make = (name: string, input = {}) => ledger.createLedger(local, { name, ...input });
	const a = make('Covered one', { currency: 'KES', openingOn: '2026-09-01', openingMinor: 100 });
	const b = make('Covered two', { currency: 'KES', openingOn: '2026-09-01', openingMinor: 200 });
	const c = make('Partial', { currency: 'KES' });
	const unknown = make('Unknown currency', { openingOn: '2026-09-01', openingMinor: 1000 });
	const empty = make('No covered ledgers', { currency: 'USD' });
	const archived = make('Archived', {
		currency: 'KES',
		openingOn: '2026-09-01',
		openingMinor: 999
	});
	ledger.setLedgerArchived(local, archived.id, true);
	expect(ledger.supported(local)).toEqual([
		{
			currency: 'KES',
			supportedMinor: 300,
			included: [
				{ id: a.id, name: a.name },
				{ id: b.id, name: b.name }
			],
			excluded: [{ id: c.id, name: c.name }]
		},
		{
			currency: 'USD',
			supportedMinor: null,
			included: [],
			excluded: [{ id: empty.id, name: empty.name }]
		},
		{
			currency: null,
			supportedMinor: null,
			included: [],
			excluded: [{ id: unknown.id, name: unknown.name }]
		}
	]);
});
