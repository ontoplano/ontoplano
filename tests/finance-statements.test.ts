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
let ledgers: typeof import('../src/lib/services/ledgers');
let parsers: typeof import('../src/lib/bank-parsers/index');
let account: number;
let card: number;
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
	ledgers = await import('../src/lib/services/ledgers');
	parsers = await import('../src/lib/bank-parsers/index');
	ctx = { userId: OWNER, now: new Date('2026-03-20T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	account = ledgers.createLedger(ctx, {
		name: 'Current account',
		defaultParser: 'nubank:conta_corrente'
	}).id;
	card = ledgers.createLedger(ctx, { name: 'Card', kind: 'card' }).id;
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
			ledgerId: card,
			source: 'nubank:credit_card_month',
			text: CREDIT_CARD
		});
		// Two identical Dm *Company charges are two purchases, not one.
		expect(first).toEqual({ added: 3, skipped: 0 });

		const again = statements.importStatement(ctx, {
			ledgerId: card,
			source: 'nubank:credit_card_month',
			text: CREDIT_CARD
		});
		expect(again).toEqual({ added: 0, skipped: 3 });
	});

	test('an export with a bank id dedups on the id', () => {
		expect(
			statements.importStatement(ctx, {
				ledgerId: account,
				source: 'nubank:conta_corrente',
				text: CONTA_CORRENTE
			})
		).toEqual({ added: 2, skipped: 0 });
		expect(
			statements.importStatement(ctx, {
				ledgerId: account,
				source: 'nubank:conta_corrente',
				text: CONTA_CORRENTE
			})
		).toEqual({ added: 0, skipped: 2 });
	});

	test('flip negates every amount', () => {
		const flipped = statements.importStatement(ctx, {
			ledgerId: card,
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
			statements.importStatement(ctx, {
				ledgerId: account,
				source: 'nubank:conta_corrente',
				text: 'hello,world'
			})
		).toThrow(/no lines matched/);
		expect(() =>
			statements.importStatement(ctx, {
				ledgerId: card,
				source: 'unknown:thing',
				text: CREDIT_CARD
			})
		).toThrow(/No parser/);
	});
});

describe('the rules', () => {
	test('an invalid regular expression is refused before it is stored', () => {
		expect(() => statements.createRule(ctx, { kind: 'tag', name: 'broken', pattern: '(' })).toThrow(
			/regular expression/
		);
	});

	/*
	 * A pattern is run against every line, on the server, every time a page
	 * is drawn — and the engine cannot be interrupted mid-match. A pattern
	 * that backtracks exponentially therefore holds the whole process, so it
	 * is refused on the way in and, for anything already stored, on the way
	 * out.
	 */
	test('a pattern that could never finish is refused', () => {
		expect(() =>
			statements.createRule(ctx, { kind: 'tag', name: 'slow', pattern: '(a+)+$' })
		).toThrow(/repetition inside a repetition/i);
		expect(statements.listRules(ctx).some((r) => r.name === 'slow')).toBe(false);
	});

	test('a stored pattern that is not run says so', () => {
		const rule = statements.createRule(ctx, { kind: 'tag', name: 'later', pattern: 'harmless' });
		// Straight into the table, the way a rule written before the check was
		// there would already be sitting.
		database.exec(`update finance_rules set pattern = '(x+x+)+y' where id = ${rule.id}`);
		const stored = statements.listRules(ctx).find((r) => r.id === rule.id)!;
		expect(stored.problem).toMatch(/exponential/i);
		expect(stored.matches).toBe(0);
		statements.deleteRule(ctx, rule.id);
	});

	test('categories are a partition — the first match wins, in position order', () => {
		statements.createRule(ctx, { kind: 'category', name: 'Company things', pattern: 'company' });
		statements.createRule(ctx, { kind: 'category', name: 'Everything Dm', pattern: '^dm' });
		const row = statements.listMovements(ctx).find((m) => m.description === 'Dm *Company');
		expect(row?.category).toBe('Company things');

		// Moving the broader rule up changes the winner — for every line, past
		// ones included, because rules apply at read time.
		const dm = statements.listRules(ctx).find((r) => r.name === 'Everything Dm')!;
		statements.moveRule(ctx, dm.id, -1);
		const after = statements.listMovements(ctx).find((m) => m.description === 'Dm *Company');
		expect(after?.category).toBe('Everything Dm');

		// And back down again: a move is a move both ways.
		statements.moveRule(ctx, dm.id, 1);
		expect(
			statements.listMovements(ctx).find((m) => m.description === 'Dm *Company')?.category
		).toBe('Company things');
	});

	test('a rule can be rewritten, and the rewrite re-sorts what is already there', () => {
		const rule = statements.createRule(ctx, { kind: 'tag', name: 'bakery', pattern: 'padaria' });
		expect(rule.color).toMatch(/^#[0-9a-f]{6}$/i);
		// Nothing in these statements is a bakery.
		expect(rule.matches).toBe(0);

		const changed = statements.updateRule(ctx, rule.id, {
			name: 'eating-out',
			pattern: 'padaria|dm',
			color: '#123456'
		});
		expect(changed.name).toBe('eating-out');
		expect(changed.color).toBe('#123456');
		// It now claims lines that existed long before the rule did.
		expect(changed.matches).toBeGreaterThan(0);
		statements.deleteRule(ctx, rule.id);
	});

	test('a category added later claims nothing an earlier one already took', () => {
		const late = statements.createRule(ctx, { kind: 'category', name: 'Also Dm', pattern: '^dm' });
		// The partition, working: the line is already Company things', and a
		// line belongs to exactly one category.
		expect(late.matches).toBe(0);
		statements.moveRule(ctx, late.id, -10);
		expect(statements.listRules(ctx).find((r) => r.id === late.id)!.matches).toBeGreaterThan(0);
		statements.deleteRule(ctx, late.id);
	});

	test('a broken pattern is refused with the engine\u2019s own complaint', () => {
		expect(() =>
			statements.updateRule(ctx, statements.listRules(ctx)[0].id, { pattern: 'a(' })
		).toThrow(/not a valid expression/);
	});

	test('tags overlap freely', () => {
		statements.createRule(ctx, { kind: 'tag', name: 'pix', pattern: 'pix' });
		statements.createRule(ctx, { kind: 'tag', name: 'sent', pattern: 'enviad' });
		const row = statements.listMovements(ctx).find((m) => m.description.includes('Zé Cova'));
		expect(row?.tags.map((t) => t.name).sort()).toEqual(['pix', 'sent']);
	});

	test('a stranger sees none of it', () => {
		expect(statements.listMovements(theirs)).toHaveLength(0);
		expect(statements.listRules(theirs)).toHaveLength(0);
		const mine = statements.listRules(ctx)[0];
		expect(() => statements.deleteRule(theirs, mine.id)).toThrow();
	});
});

describe('the ledgers', () => {
	test('each holds its own lines, and its balance is their sum', () => {
		const all = ledgers.listLedgers(ctx);
		const theAccount = all.find((l) => l.id === account)!;
		const theCard = all.find((l) => l.id === card)!;
		expect(theAccount.count).toBe(2);
		expect(theAccount.balanceCents).toBe(120000 - 5000);
		expect(theCard.count).toBe(4);
		expect(theCard.lastOn).toBe('2026-03-19');
	});

	test('the same file in two ledgers is two sets of lines, not a duplicate', () => {
		const second = ledgers.createLedger(ctx, { name: 'Second card', kind: 'card' }).id;
		expect(
			statements.importStatement(ctx, {
				ledgerId: second,
				source: 'nubank:credit_card_month',
				text: CREDIT_CARD
			})
		).toEqual({ added: 3, skipped: 0 });
		expect(statements.listMovements(ctx, { ledgerId: second })).toHaveLength(3);
		ledgers.deleteLedger(ctx, second);
		// Deleting the ledger took its lines with it, and nobody else's.
		expect(statements.listMovements(ctx, { ledgerId: card })).toHaveLength(4);
	});

	test('a plugin can push one line, and pushing it twice changes nothing', () => {
		const first = statements.recordMovement(ctx, {
			ledgerId: account,
			occurredOn: '2026-03-21',
			amountCents: -1234,
			description: 'Pushed by a plugin',
			source: 'plugin',
			externalId: 'plugin-1'
		});
		expect(first.added).toBe(true);
		const again = statements.recordMovement(ctx, {
			ledgerId: account,
			occurredOn: '2026-03-21',
			amountCents: -1234,
			description: 'Pushed by a plugin',
			source: 'plugin',
			externalId: 'plugin-1'
		});
		expect(again).toEqual({ id: first.id, added: false });
		statements.deleteMovement(ctx, first.id);
	});

	test('a line can be corrected, moved to another ledger, and dropped', () => {
		const line = statements.recordMovement(ctx, {
			ledgerId: account,
			occurredOn: '2026-03-22',
			amountCents: -500,
			description: 'Typo'
		});
		statements.updateMovement(ctx, line.id, {
			description: 'Mercado Bom Preço',
			ledgerId: card,
			amountCents: -600
		});
		const moved = statements.listMovements(ctx, { ledgerId: card }).find((m) => m.id === line.id)!;
		expect(moved.amountCents).toBe(-600);
		// Rewriting the description re-sorts it, because the rules read that.
		statements.createRule(ctx, { kind: 'category', name: 'Groceries', pattern: 'mercado' });
		expect(
			statements.listMovements(ctx, { ledgerId: card }).find((m) => m.id === line.id)!.category
		).toBe('Groceries');
		statements.deleteMovement(ctx, line.id);
	});

	test('a stranger cannot reach a ledger or import into one', () => {
		expect(ledgers.listLedgers(theirs)).toHaveLength(0);
		expect(() => ledgers.getLedger(theirs, account)).toThrow();
		expect(() =>
			statements.importStatement(theirs, {
				ledgerId: account,
				source: 'nubank:conta_corrente',
				text: CONTA_CORRENTE
			})
		).toThrow();
	});
});

describe('the month series', () => {
	test('statements aggregate by month, and the categories add up', () => {
		const march = statements.monthlyTotals(ctx, 12).find((m) => m.month === '2026-03')!;
		// In: 1200.00 received + 5.00 flipped refund. Out: the account's 50.00
		// and the card's 10.00 + 23.90 + 23.90. The lines the editing tests
		// made were dropped again, so they are not in here.
		expect(march.inCents).toBe(120500);
		expect(march.outCents).toBe(10780);
		expect(march.netCents).toBe(march.inCents - march.outCents);

		const slices = statements.categorySlices(ctx, { month: '2026-03' });
		expect(slices.reduce((sum, c) => sum + c.outCents, 0)).toBe(march.outCents);
		expect(Math.round(slices.reduce((sum, c) => sum + c.share, 0))).toBe(1);
	});

	test('one ledger at a time, when asked', () => {
		const cardMonth = statements
			.monthlyTotals(ctx, 12, { ledgerId: card })
			.find((m) => m.month === '2026-03')!;
		expect(cardMonth.inCents).toBe(500);
		expect(cardMonth.outCents).toBe(5780);
	});

	test('a tag is measured on its own, with the average of the months it appeared in', () => {
		// 'sent' is already on the one outgoing Pix, and on nothing else.
		const series = statements.tagMonths(ctx, 'sent', 12);
		expect(series.activeMonths).toBe(1);
		expect(series.totalCents).toBe(5000);
		expect(series.averageCents).toBe(5000);
		// Money arriving is not a cost: the received Pix carries 'pix' too and
		// stays out of the total.
		expect(statements.tagMonths(ctx, 'pix', 12).totalCents).toBe(5000);
	});

	test('the categories-by-month table matches the months it is drawn from', () => {
		const table = statements.categoryMonths(ctx, 12);
		const index = table.months.indexOf('2026-03');
		const stacked = table.categories.reduce((sum, c) => sum + c.byMonth[index], 0);
		expect(stacked).toBe(
			statements.monthlyTotals(ctx, 12).find((m) => m.month === '2026-03')!.outCents
		);
	});
});
