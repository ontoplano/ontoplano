/**
 * Statements, and the sorting that makes them readable.
 *
 * A bank export becomes rows exactly once — the same file imported twice adds
 * nothing, while two genuinely identical lines in one file both land. The
 * rules that sort lines are regular expressions applied at read time:
 * categories are a partition where the first match wins, tags overlap
 * freely, and a rule written after an import still sorts it. Income rides
 * the bills table with its flow named, and the month series keep records and
 * statements apart because merging them would count a salary twice.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let statements: typeof import('../src/lib/services/statements');
let bills: typeof import('../src/lib/services/bills');
let parsers: typeof import('../src/lib/bank-parsers/index');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

const CONTA_CORRENTE = [
	'Data,Valor,Identificador,Descrição',
	'02/03/2026,-50.00,69a56b21-aefd-499f-a59f-929256b31ea7,Transferência enviada pelo Pix - Zé Cova - •••.821.910-•• - NU PAGAMENTOS - IP (0260) Agência: 1 Conta: 89023719-0',
	'05/03/2026,1200.00,7b0aa001-0000-4000-8000-000000000001,Transferência recebida pelo Pix - ACME LTDA'
].join('\n');

const CREDIT_CARD = [
	'date,title,amount',
	'2026-03-19,Casa - do caralho,10.00',
	'2026-03-19,Dm *Company,23.90',
	'2026-03-19,Dm *Company,23.90'
].join('\n');

beforeAll(async () => {
	statements = await import('../src/lib/services/statements');
	bills = await import('../src/lib/services/bills');
	parsers = await import('../src/lib/bank-parsers/index');
	ctx = { userId: OWNER, now: new Date('2026-03-20T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('the parsers', () => {
	test('conta corrente keeps the sign, the id, and a description full of punctuation', () => {
		const lines = parsers.parserFor('nubank:conta_corrente')!.parse(CONTA_CORRENTE);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({
			occurredOn: '2026-03-02',
			amountCents: -5000,
			externalId: '69a56b21-aefd-499f-a59f-929256b31ea7'
		});
		expect(lines[0].description).toContain('Agência: 1 Conta: 89023719-0');
		expect(lines[1].amountCents).toBe(120000);
	});

	test('a card charge is money leaving, so its sign flips on the way in', () => {
		const lines = parsers.parserFor('nubank:credit_card_month')!.parse(CREDIT_CARD);
		expect(lines).toHaveLength(3);
		expect(lines[0]).toMatchObject({ occurredOn: '2026-03-19', amountCents: -1000 });
		expect(lines[0].description).toBe('Casa - do caralho');
	});

	test('cents are exact, never a float rounding', () => {
		expect(parsers.decimalToCents('23.90')).toBe(2390);
		expect(parsers.decimalToCents('-50.00')).toBe(-5000);
		expect(parsers.decimalToCents('10.5')).toBe(1050);
		expect(parsers.decimalToCents('not money')).toBeNull();
	});
});

describe('importing', () => {
	test('the same file twice adds nothing, but twin lines in one file both land', () => {
		const first = statements.importStatement(ctx, {
			source: 'nubank:credit_card_month',
			text: CREDIT_CARD
		});
		// Two identical Dm *Company charges are two purchases, not one.
		expect(first).toEqual({ added: 3, skipped: 0 });

		const again = statements.importStatement(ctx, {
			source: 'nubank:credit_card_month',
			text: CREDIT_CARD
		});
		expect(again).toEqual({ added: 0, skipped: 3 });
	});

	test('an export with a bank id dedups on the id', () => {
		expect(
			statements.importStatement(ctx, { source: 'nubank:conta_corrente', text: CONTA_CORRENTE })
		).toEqual({ added: 2, skipped: 0 });
		expect(
			statements.importStatement(ctx, { source: 'nubank:conta_corrente', text: CONTA_CORRENTE })
		).toEqual({ added: 0, skipped: 2 });
	});

	test('flip negates every amount', () => {
		const flipped = statements.importStatement(ctx, {
			source: 'nubank:credit_card_month',
			text: 'date,title,amount\n2026-03-01,Estorno,5.00',
			flip: true
		});
		expect(flipped.added).toBe(1);
		const row = statements.listMovements(ctx).find((m) => m.description === 'Estorno');
		// The parser made a charge -500; flip turns it into +500 arriving.
		expect(row?.amountCents).toBe(500);
	});

	test('text no parser recognises is refused with the parser named', () => {
		expect(() =>
			statements.importStatement(ctx, { source: 'nubank:conta_corrente', text: 'hello,world' })
		).toThrow(/no lines matched/);
		expect(() =>
			statements.importStatement(ctx, { source: 'unknown:thing', text: CREDIT_CARD })
		).toThrow(/No parser/);
	});
});

describe('the rules', () => {
	test('an invalid regular expression is refused before it is stored', () => {
		expect(() => statements.createRule(ctx, { kind: 'tag', name: 'broken', pattern: '(' })).toThrow(
			/regular expression/
		);
	});

	test('categories are a partition — the first match wins, in position order', () => {
		statements.createRule(ctx, { kind: 'category', name: 'Company things', pattern: 'company' });
		statements.createRule(ctx, { kind: 'category', name: 'Everything Dm', pattern: '^dm' });
		const row = statements.listMovements(ctx).find((m) => m.description === 'Dm *Company');
		expect(row?.category).toBe('Company things');

		// Moving the broader rule earlier changes the winner — for every line,
		// past ones included, because rules apply at read time.
		const rules = statements.listRules(ctx);
		const dm = rules.find((r) => r.name === 'Everything Dm')!;
		statements.updateRule(ctx, dm.id, { position: 0 });
		const after = statements.listMovements(ctx).find((m) => m.description === 'Dm *Company');
		expect(after?.category).toBe('Everything Dm');
	});

	test('tags overlap freely', () => {
		statements.createRule(ctx, { kind: 'tag', name: 'pix', pattern: 'pix' });
		statements.createRule(ctx, { kind: 'tag', name: 'sent', pattern: 'enviad' });
		const row = statements.listMovements(ctx).find((m) => m.description.includes('Zé Cova'));
		expect(row?.tags.sort()).toEqual(['pix', 'sent']);
	});

	test('a stranger sees none of it', () => {
		expect(statements.listMovements(theirs)).toHaveLength(0);
		expect(statements.listRules(theirs)).toHaveLength(0);
		const mine = statements.listRules(ctx)[0];
		expect(() => statements.deleteRule(theirs, mine.id)).toThrow();
	});
});

describe('the month series', () => {
	test('statements aggregate by month, and the categories add up', () => {
		const series = statements.statementSeries(ctx);
		const march = series.find((m) => m.month === '2026-03')!;
		// In: 1200.00 received + 5.00 flipped refund. Out: 50 + 10 + 23.90 + 23.90.
		expect(march.inCents).toBe(120500);
		expect(march.outCents).toBe(10780);
		expect(march.netCents).toBe(march.inCents - march.outCents);
		const summed = march.byCategory.reduce((sum, c) => sum + c.outCents, 0);
		expect(summed).toBe(march.outCents);
	});

	test('records keep income and bills apart, and both out of the statements', () => {
		const salary = bills.createBill(ctx, { name: 'Salary', amountExpected: 500000, flow: 'in' });
		const rent = bills.createBill(ctx, { name: 'Rent', amountExpected: 120000 });
		bills.markPaid(ctx, salary.id, { period: '2026-03' });
		bills.markPaid(ctx, rent.id, { period: '2026-03', amountPaid: 121000 });

		const march = statements.recordsSeries(ctx).find((m) => m.month === '2026-03')!;
		expect(march.incomeCents).toBe(500000);
		expect(march.billsCents).toBe(121000);
		expect(march.netCents).toBe(379000);

		// The statement series did not move: records are not statements.
		expect(statements.statementSeries(ctx).find((m) => m.month === '2026-03')!.inCents).toBe(
			120500
		);
	});

	test('income stays out of the bills list, the bills summary, and the planner', () => {
		expect(bills.listBills(ctx).map((b) => b.name)).not.toContain('Salary');
		expect(bills.listBills(ctx, { flow: 'in' }).map((b) => b.name)).toContain('Salary');
		expect(bills.monthSummary(ctx, '2026-03').paid).toBe(121000);
		expect(bills.monthSummary(ctx, '2026-03', 'in').paid).toBe(500000);
		expect(bills.billsDueBetween(ctx, '2026-03-01', '2026-03-31').map((d) => d.name)).not.toContain(
			'Salary'
		);
	});
});
