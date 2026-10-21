/**
 * What a line meant, when somebody says so.
 *
 * The bank says date, amount and description; it does not say whether money
 * moving between two of my own accounts was spending. These tests hold the
 * four rules that decision rests on: a kind is an override that can be
 * cleared, a transfer is one group of legs that conserves, a refund reverses
 * exactly one expense, and none of it may be edited out from under the other.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';
import { refusal } from './helpers/refusal';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let statements: typeof import('../src/lib/services/statements');
let ledgers: typeof import('../src/lib/services/ledgers');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let account: number;
let card: number;
let wallet: number;

beforeAll(async () => {
	statements = await import('../src/lib/services/statements');
	ledgers = await import('../src/lib/services/ledgers');
	ctx = { userId: OWNER, now: new Date('2026-10-18T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	account = ledgers.createLedger(ctx, { name: 'Account', currency: 'KES' }).id;
	card = ledgers.createLedger(ctx, { name: 'Card', kind: 'card', currency: 'KES' }).id;
	wallet = ledgers.createLedger(ctx, { name: 'Wallet', kind: 'cash', currency: 'USD' }).id;
});

let counter = 0;
function movement(ledgerId: number, amountCents: number, description = 'A line') {
	counter += 1;
	return statements.recordMovement(ctx, {
		ledgerId,
		occurredOn: '2026-10-02',
		amountCents,
		description: `${description} ${counter}`
	}).id;
}

function row(id: number) {
	return statements.listMovements(ctx, { limit: 100_000 }).find((m) => m.id === id)!;
}

describe('a kind is an override', () => {
	test('a negative line is an assumed expense until somebody says otherwise', () => {
		const id = movement(account, -5000);
		expect(row(id).kind).toBeNull();
		expect(row(id).amountCents).toBeLessThan(0);
	});

	test('a stated kind is stored, listed, and can be taken back', () => {
		const id = movement(account, -2000);
		statements.updateMovement(ctx, id, { kind: 'cash' });
		expect(row(id).kind).toBe('cash');
		statements.updateMovement(ctx, id, { kind: '' });
		expect(row(id).kind).toBeNull();
	});

	test('a kind nobody has heard of is refused', () => {
		const id = movement(account, -100);
		expect(refusal(() => statements.updateMovement(ctx, id, { kind: 'holiday' }))).toMatch(/kind/i);
	});

	test('another account’s line is a missing line', () => {
		const id = movement(account, -100);
		expect(refusal(() => statements.updateMovement(theirs, id, { kind: 'fee' }))).toMatch(
			/not found|could not find|missing/i
		);
	});

	test('bulk classification writes once and reports the count', () => {
		const ids = Array.from({ length: 12 }, () => movement(account, -300));
		expect(statements.classifyMovements(ctx, { ids, kind: 'cash' })).toEqual({ updated: 12 });
		expect(ids.every((id) => row(id).kind === 'cash')).toBe(true);
	});

	test('one foreign id refuses the batch rather than half-applying it', () => {
		const mine = movement(account, -300);
		const foreign = statements.recordMovement(theirs, {
			ledgerId: ledgers.createLedger(theirs, { name: 'Theirs', currency: 'KES' }).id,
			occurredOn: '2026-10-02',
			amountCents: -300,
			description: 'Not mine'
		}).id;
		expect(
			refusal(() => statements.classifyMovements(ctx, { ids: [mine, foreign], kind: 'fee' }))
		).toMatch(/not found|could not find|missing/i);
		expect(row(mine).kind).toBeNull();
	});
});

describe('a transfer is one group of legs', () => {
	test('two lines in different ledgers pair and keep their balances', () => {
		const out = movement(account, -25000);
		const into = movement(card, 25000);
		const { groupId } = statements.linkTransfer(ctx, { id: out, counterpartId: into });
		expect(row(out)).toMatchObject({ kind: 'transfer', groupId, counterpartPending: false });
		expect(row(into)).toMatchObject({ kind: 'transfer', groupId });
		expect(ledgers.getLedger(ctx, account).balanceCents).toBeLessThan(0);
	});

	test('same currency, not adding up to nothing: refused, naming both', () => {
		const out = movement(account, -10000);
		const into = movement(card, 9000);
		expect(refusal(() => statements.linkTransfer(ctx, { id: out, counterpartId: into }))).toMatch(
			/do not add up/
		);
		expect(row(out).groupId).toBeNull();
	});

	test('a line marked as a transfer with no pair says its counterpart is pending', () => {
		const alone = movement(account, -1000);
		statements.updateMovement(ctx, alone, { kind: 'transfer' });
		expect(row(alone).counterpartPending).toBe(true);
	});

	test('an unlabelled ledger is not a different currency — the pair is refused', () => {
		const unlabelled = ledgers.createLedger(ctx, { name: 'No currency' }).id;
		const out = movement(account, -5000);
		const into = movement(unlabelled, 5000);
		expect(refusal(() => statements.linkTransfer(ctx, { id: out, counterpartId: into }))).toMatch(
			/currency/i
		);
	});

	test('two legs in one ledger are refused', () => {
		const a = movement(account, -4000);
		const b = movement(account, 4000);
		expect(refusal(() => statements.linkTransfer(ctx, { id: a, counterpartId: b }))).toMatch(
			/same ledger/
		);
	});

	test('different currencies pair without a combined total', () => {
		const out = movement(account, -10000);
		const into = movement(wallet, 2700);
		statements.linkTransfer(ctx, { id: out, counterpartId: into });
		expect(row(out).kind).toBe('transfer');
		expect(row(into).kind).toBe('transfer');
	});

	test('a leg cannot be re-kinded or classified out of its group', () => {
		const out = movement(account, -7000);
		const into = movement(card, 7000);
		statements.linkTransfer(ctx, { id: out, counterpartId: into });
		expect(refusal(() => statements.updateMovement(ctx, out, { kind: 'expense' }))).toMatch(
			/unlink/i
		);
		expect(refusal(() => statements.classifyMovements(ctx, { ids: [out], kind: 'cash' }))).toMatch(
			/unlink/i
		);
	});

	test('a grouped leg\u2019s amount cannot be edited out of the sum', () => {
		const out = movement(account, -2000);
		const into = movement(card, 2000);
		statements.linkTransfer(ctx, { id: out, counterpartId: into });
		expect(refusal(() => statements.updateMovement(ctx, out, { amountCents: -1 }))).toMatch(
			/unlink/i
		);
		expect(row(out).amountCents).toBe(-2000);
	});

	test('a leg cannot be deleted while the pair stands', () => {
		const out = movement(account, -6000);
		const into = movement(card, 6000);
		statements.linkTransfer(ctx, { id: out, counterpartId: into });
		expect(refusal(() => statements.deleteMovement(ctx, out))).toMatch(/unlink/i);
	});

	test('unlinking returns both legs to the sign’s guess', () => {
		const out = movement(account, -3000);
		const into = movement(card, 3000);
		statements.linkTransfer(ctx, { id: out, counterpartId: into });
		statements.unlinkTransfer(ctx, into);
		expect(row(out)).toMatchObject({ kind: null, groupId: null });
		expect(row(out).amountCents).toBeLessThan(0);
		expect(row(into)).toMatchObject({ kind: null, groupId: null });
		expect(row(into).amountCents).toBeGreaterThan(0);
	});

	test('a refund attached to a leg blocks the unlink', () => {
		const out = movement(account, -8000);
		const into = movement(card, 8000);
		statements.linkTransfer(ctx, { id: out, counterpartId: into });
		const credit = movement(card, 500);
		statements.linkMovement(ctx, { id: credit, parentId: out, relation: 'refund' });
		expect(refusal(() => statements.unlinkTransfer(ctx, out))).toMatch(/refund/i);
	});
});

describe('a refund reverses one expense', () => {
	test('the refund carries the parent and its own amount and date', () => {
		const expense = movement(account, -1200);
		const credit = movement(card, 400);
		statements.linkMovement(ctx, { id: credit, parentId: expense, relation: 'refund' });
		expect(row(credit)).toMatchObject({ kind: 'refund', parentId: expense, amountCents: 400 });
		expect(row(expense).amountCents).toBe(-1200);
	});

	test('a second parent is refused', () => {
		const first = movement(account, -1200);
		const second = movement(account, -1200);
		const credit = movement(card, 400);
		statements.linkMovement(ctx, { id: credit, parentId: first, relation: 'refund' });
		expect(
			refusal(() =>
				statements.linkMovement(ctx, { id: credit, parentId: second, relation: 'refund' })
			)
		).toMatch(/already the refund/);
	});

	test('two partial refunds may attach to one expense', () => {
		const expense = movement(account, -5000);
		const one = movement(card, 1000);
		const two = movement(card, 1500);
		statements.linkMovement(ctx, { id: one, parentId: expense, relation: 'refund' });
		statements.linkMovement(ctx, { id: two, parentId: expense, relation: 'refund' });
		expect(row(expense).amountCents).toBe(-5000);
	});

	test('unlike currencies are refused, naming both', () => {
		const expense = movement(account, -5000);
		const credit = movement(wallet, 1000);
		expect(
			refusal(() =>
				statements.linkMovement(ctx, { id: credit, parentId: expense, relation: 'refund' })
			)
		).toMatch(/KES/);
	});

	test('a refund cannot become a transfer leg', () => {
		const expense = movement(account, -4000);
		const credit = movement(card, 1000);
		statements.linkMovement(ctx, { id: credit, parentId: expense, relation: 'refund' });
		const other = movement(wallet, 1000);
		expect(
			refusal(() => statements.linkTransfer(ctx, { id: credit, counterpartId: other }))
		).toMatch(/refund|fee/i);
	});

	test('deleting the parent leaves the refund as an unmatched credit', () => {
		const expense = movement(account, -2000);
		const credit = movement(card, 800);
		statements.linkMovement(ctx, { id: credit, parentId: expense, relation: 'refund' });
		statements.deleteMovement(ctx, expense);
		expect(row(credit)).toMatchObject({ parentId: null, amountCents: 800 });
	});

	test('a detach leaves the line standing alone', () => {
		const expense = movement(account, -2000);
		const credit = movement(card, 800);
		statements.linkMovement(ctx, { id: credit, parentId: expense, relation: 'refund' });
		statements.detachMovement(ctx, credit);
		expect(row(credit)).toMatchObject({ parentId: null, kind: null });
	});
});

describe('a fee belongs to the payment', () => {
	test('the fee is named and the payment keeps its amount', () => {
		const payment = movement(account, -10000);
		const fee = movement(account, -250);
		statements.linkMovement(ctx, { id: fee, parentId: payment, relation: 'fee' });
		expect(row(fee)).toMatchObject({ kind: 'fee', parentId: payment, amountCents: -250 });
		expect(row(payment).amountCents).toBe(-10000);
	});

	test('a line cannot be its own parent', () => {
		const line = movement(account, -100);
		expect(
			refusal(() => statements.linkMovement(ctx, { id: line, parentId: line, relation: 'fee' }))
		).toMatch(/itself/);
	});

	test('a transfer leg cannot itself become a refund or a fee', () => {
		const out = movement(account, -9000);
		const into = movement(card, 9000);
		statements.linkTransfer(ctx, { id: out, counterpartId: into });
		expect(
			refusal(() => statements.linkMovement(ctx, { id: out, parentId: into, relation: 'fee' }))
		).toMatch(/transfer/i);
	});
});
