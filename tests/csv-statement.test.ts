import { describe, expect, test } from 'vitest';
import { parseCsv, readDate, readMoney, sniffCsv, splitRow } from '../src/lib/bank-parsers/csv';

/**
 * Reading somebody else's bank, without anybody having written a parser for
 * it.
 *
 * The statements below are the shapes real exports come in — a British bank
 * with money-in and money-out columns, a European one with semicolons and
 * comma decimals, an American one with month-first dates, a file with no
 * header at all. What is being asserted is what the sniffer guesses, because
 * the guess is what somebody sees on the screen and corrects: a wrong guess
 * that is easy to fix is fine, and a wrong guess presented as certainty is
 * not.
 */

describe('splitting a row', () => {
	test('respects quotes around the separator', () => {
		expect(splitRow('2026-01-02,"Shop, the",-12.30', ',')).toEqual([
			'2026-01-02',
			'Shop, the',
			'-12.30'
		]);
	});

	test('and a quote inside a quoted field', () => {
		expect(splitRow('a,"He said ""hi""",b', ',')).toEqual(['a', 'He said "hi"', 'b']);
	});
});

describe('reading money', () => {
	test('either half of the world', () => {
		expect(readMoney('1.234,56')).toBe(123456);
		expect(readMoney('1,234.56')).toBe(123456);
		expect(readMoney('1234.56')).toBe(123456);
		expect(readMoney('1234,56')).toBe(123456);
	});

	test('a lone separator with three digits after it is thousands', () => {
		// 1,234 is a thousand two hundred and thirty-four, not twelve and a bit.
		expect(readMoney('1,234')).toBe(123400);
		expect(readMoney('1.234')).toBe(123400);
	});

	test('currency symbols and spaces', () => {
		expect(readMoney('R$ 1.234,56')).toBe(123456);
		expect(readMoney('-£12.30')).toBe(-1230);
		expect(readMoney('  €0,99 ')).toBe(99);
	});

	test('the three ways of writing a negative', () => {
		expect(readMoney('-12.30')).toBe(-1230);
		expect(readMoney('(12.30)')).toBe(-1230);
		expect(readMoney('12.30-')).toBe(-1230);
	});

	test('and nothing at all', () => {
		expect(readMoney('')).toBeNull();
		expect(readMoney('   ')).toBeNull();
		expect(readMoney('n/a')).toBeNull();
	});
});

describe('reading a date', () => {
	test('the shapes banks write', () => {
		expect(readDate('2026-03-04', true)).toBe('2026-03-04');
		expect(readDate('04/03/2026', true)).toBe('2026-03-04');
		expect(readDate('03/04/2026', false)).toBe('2026-03-04');
		expect(readDate('04.03.2026', true)).toBe('2026-03-04');
	});

	test('two-digit years', () => {
		expect(readDate('04/03/26', true)).toBe('2026-03-04');
		expect(readDate('04/03/99', true)).toBe('1999-03-04');
	});

	test('and refuses what is not one', () => {
		expect(readDate('Description', true)).toBeNull();
		expect(readDate('32/01/2026', true)).toBeNull();
		expect(readDate('04/13/2026', true)).toBeNull();
	});
});

describe('a British statement, money in and money out', () => {
	const file = [
		'Date,Description,Paid out,Paid in,Balance',
		'02/03/2026,TESCO STORES 3421,12.30,,1487.20',
		'05/03/2026,SALARY ACME LTD,,2100.00,3587.20',
		'17/03/2026,"COFFEE, THE SHOP",3.60,,3583.60'
	].join('\n');

	test('is read without being told anything', () => {
		const sniff = sniffCsv(file)!;
		expect(sniff.delimiter).toBe(',');
		expect(sniff.mapping.date).toBe('Date');
		expect(sniff.mapping.description).toBe('Description');
		expect(sniff.mapping.moneyOut).toBe('Paid out');
		expect(sniff.mapping.moneyIn).toBe('Paid in');
		// Two direction columns mean the amount column, if any, is not the one.
		expect(sniff.mapping.amount).toBeUndefined();
	});

	test('and the money goes the right way', () => {
		const rows = parseCsv(file, sniffCsv(file)!.mapping);
		expect(rows).toHaveLength(3);
		expect(rows[0]).toMatchObject({
			occurredOn: '2026-03-02',
			amountCents: -1230,
			description: 'TESCO STORES 3421'
		});
		expect(rows[1].amountCents).toBe(210000);
		expect(rows[2].description).toBe('COFFEE, THE SHOP');
	});
});

describe('a European statement, semicolons and comma decimals', () => {
	const file = [
		'Buchungstag;Verwendungszweck;Betrag',
		'02.03.2026;REWE Markt;-12,30',
		'05.03.2026;Gehalt;2.100,00'
	].join('\n');

	test('finds its separator and its columns', () => {
		const sniff = sniffCsv(file)!;
		expect(sniff.delimiter).toBe(';');
		expect(sniff.mapping.amount).toBe('Betrag');
	});

	test('and its amounts', () => {
		const rows = parseCsv(file, sniffCsv(file)!.mapping);
		expect(rows.map((r) => r.amountCents)).toEqual([-1230, 210000]);
		expect(rows[0].occurredOn).toBe('2026-03-02');
	});
});

describe('an American statement, month first', () => {
	const file = [
		'Transaction Date,Description,Amount',
		'03/14/2026,WHOLE FOODS,-52.18',
		'03/02/2026,PAYROLL,1500.00'
	].join('\n');

	test('works out that the month comes first', () => {
		// The 14th cannot be a month, which is the only evidence there is.
		const sniff = sniffCsv(file)!;
		expect(sniff.mapping.dayFirst).toBe(false);
		expect(parseCsv(file, sniff.mapping)[0].occurredOn).toBe('2026-03-14');
	});
});

describe('a file whose dates are all ambiguous', () => {
	const file = ['Data,Descrição,Valor', '02/03/2026,Padaria,-12,30'].join('\n');

	test('is read day-first, which is the guess the screen shows', () => {
		// Nothing in the file can settle it: 02/03 is the second of March or the
		// third of February, and the person is the only one who knows. Day-first
		// is the default and the control on the import screen is how it is
		// changed — this pins the default so it cannot drift silently.
		expect(sniffCsv(file)!.mapping.dayFirst).toBe(true);
		expect(parseCsv(file, sniffCsv(file)!.mapping)[0].occurredOn).toBe('2026-03-02');
	});

	test('and reading it the other way is one field', () => {
		const mapping = { ...sniffCsv(file)!.mapping, dayFirst: false };
		expect(parseCsv(file, mapping)[0].occurredOn).toBe('2026-02-03');
	});
});

describe('a file with no header row', () => {
	const file = ['02/03/2026,Padaria,-12.30', '05/03/2026,Salário,2100.00'].join('\n');

	test('keeps every line and names the columns by position', () => {
		const sniff = sniffCsv(file)!;
		expect(sniff.headerless).toBe(true);
		expect(sniff.headers).toEqual(['Column 1', 'Column 2', 'Column 3']);
		// The first row is data, so it must not be eaten as a header.
		expect(parseCsv(file, sniff.mapping)).toHaveLength(2);
	});
});

describe('an id column', () => {
	const file = [
		'Data,Valor,Identificador,Descrição',
		'02/03/2026,-12.30,9f1c2e44-0000-4000-8000-000000000001,Padaria'
	].join('\n');

	test('is carried through, so a second import of the same file adds nothing', () => {
		const rows = parseCsv(file, sniffCsv(file)!.mapping);
		expect(rows[0].externalId).toBe('9f1c2e44-0000-4000-8000-000000000001');
	});
});

describe('what it refuses', () => {
	test('one line is not a statement', () => {
		expect(sniffCsv('Date,Description,Amount')).toBeNull();
	});

	test('and a line it cannot read is skipped rather than guessed at', () => {
		const file = [
			'Date,Description,Amount',
			'02/03/2026,Good,-12.30',
			'Opening balance,,',
			'05/03/2026,Also good,1.00'
		].join('\n');
		expect(parseCsv(file, sniffCsv(file)!.mapping)).toHaveLength(2);
	});
});
