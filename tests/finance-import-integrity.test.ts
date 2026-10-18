import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';
import { refusal } from './helpers/refusal';
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const ledgers = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-02T10:00:00Z') };
let serial = 0;
const ledger = (fields = {}) =>
	ledgers.createLedger(ctx, { name: `Import ${++serial}`, ...fields }).id;
const run = (id: number, text: string, source = 'csv:columns') =>
	statements.importStatement(ctx, { ledgerId: id, source, text });
const good = 'Date,Description,Amount\n2026-09-02,Synthetic purchase,-50.00';

test('unknown opening is explicit and replay preserves complete stored rows and fingerprints', () => {
	const id = ledger();
	expect(run(id, good)).toEqual({ added: 1, skipped: 0, recordedOnly: true });
	const before = database.all('select * from finance_transactions where ledger_id = ?', id);
	expect(run(id, good)).toEqual({ added: 0, skipped: 1, recordedOnly: true });
	expect(database.all('select * from finance_transactions where ledger_id = ?', id)).toEqual(
		before
	);
});
test('pre-opening import refuses every row and names earliest offending date', () => {
	const id = ledger({ currency: 'KES', openingMinor: 13262, openingOn: '2026-09-01' });
	expect(
		refusal(() => run(id, good + '\n2026-08-31,Older,-1.00\n2026-08-20,Earliest,-2.00'))
	).toContain('2026-08-20');
	expect(statements.listMovements(ctx, { ledgerId: id })).toEqual([]);
	expect(run(id, good)).toEqual({ added: 1, skipped: 0, recordedOnly: false });
});
test('unreadable lines, multiline CSV and row validation failures have distinct physical line diagnostics', () => {
	const id = ledger();
	expect(refusal(() => run(id, good + '\nnot-a-date,Bad,12'))).toMatch(/Could not read line 3/);
	expect(refusal(() => run(id, good + '\n2026-09-03,"Unclosed,12'))).toMatch(
		/Could not read line 3/
	);
	const multi = 'Date,Description,Amount\n2026-09-02,"Two\nlines",-50\n2026-02-30,Impossible,1';
	expect(refusal(() => run(id, multi))).toMatch(/Line 4 was rejected: invalid/);
	expect(refusal(() => run(id, good + '\n2026-09-03,Too large,900719925474099100.00'))).toMatch(
		/Line 3 was rejected/
	);
	expect(statements.listMovements(ctx, { ledgerId: id })).toEqual([]);
	expect(run(id, 'Date,Description,Amount\n2026-09-02,"Two\nlines",-50').added).toBe(1);
});
test('leading blank lines retain physical source line numbers', () => {
	const id = ledger();
	expect(refusal(() => run(id, '\n\n' + good + '\nnot-a-date,Bad,12'))).toMatch(
		/Could not read line 5/
	);
	expect(statements.listMovements(ctx, { ledgerId: id })).toEqual([]);
});

test('both bank parsers refuse malformed data rather than dropping it', () => {
	for (const [source, text] of [
		[
			'nubank:conta_corrente',
			'Data,Valor,Identificador,Descrição\n02/09/2026,-50.00,69a56b21-aefd-499f-a59f-929256b31ea7,Purchase\ninvalid'
		],
		['nubank:credit_card_month', 'date,title,amount\n2026-09-02,Purchase,50.00\ninvalid']
	]) {
		const id = ledger();
		expect(refusal(() => run(id, text, source))).toMatch(/Could not read line 3/);
		expect(statements.listMovements(ctx, { ledgerId: id })).toEqual([]);
	}
});
test('insert-time rejection rolls back prior inserts from the same file', () => {
	const id = ledger();
	database.exec(
		"create trigger reject_import before insert on finance_transactions when NEW.description = 'Reject row' begin select raise(ABORT, 'synthetic rejection'); end"
	);
	try {
		expect(refusal(() => run(id, good + '\n2026-09-03,Reject row,-10.00'))).toMatch(
			/Line 3 was rejected while saving/
		);
		expect(statements.listMovements(ctx, { ledgerId: id })).toEqual([]);
	} finally {
		database.exec('drop trigger reject_import');
	}
});
test('generic CSV respects original-currency precision without changing legacy replay identities', () => {
	const id = ledger();
	run(id, good);
	const before = database.all('select * from finance_transactions where ledger_id=?', id);
	ledgers.updateLedger(ctx, id, { currency: 'JPY' });
	expect(run(id, good)).toEqual({ added: 0, skipped: 1, recordedOnly: true });
	expect(database.all('select * from finance_transactions where ledger_id=?', id)).toEqual(before);
	const yen = ledger({ currency: 'JPY' });
	run(yen, 'Date,Description,Amount\n2026-09-02,Yen purchase,-50');
	expect(statements.listMovements(ctx, { ledgerId: yen })[0].amountCents).toBe(-50);
	expect(
		refusal(() => run(yen, 'Date,Description,Amount\n2026-09-03,Fractional yen,-50.50'))
	).toMatch(/Could not read line 2/);
	expect(
		refusal(() =>
			run(yen, 'date,title,amount\n2026-09-03,Purchase,50.00', 'nubank:credit_card_month')
		)
	).toMatch(/uses two decimal places/);
	expect(statements.listMovements(ctx, { ledgerId: yen })).toHaveLength(1);
	const dinar = ledger({ currency: 'KWD' });
	const csv = 'Date,Description,Amount\n2026-09-02,Dinar purchase,-1.234';
	run(dinar, csv);
	expect(statements.listMovements(ctx, { ledgerId: dinar })[0].amountCents).toBe(-1234);
	expect(run(dinar, csv).added).toBe(0);
});

test('another owner and missing ledger receive identical refusals', () => {
	const id = ledger();
	const stranger = { ...ctx, userId: STRANGER };
	const importAs = (ledgerId: number) =>
		statements.importStatement(stranger, { ledgerId, source: 'csv:columns', text: good });
	expect(refusal(() => importAs(id))).toEqual(refusal(() => importAs(999999)));
});
