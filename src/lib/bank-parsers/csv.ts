import { type BankParser, type ParsedMovement } from './shape.js';

/**
 * Any bank's CSV, by naming its columns.
 *
 * Every other parser in here is code written for one bank's one export shape,
 * which is the right answer for a bank enough people use to be worth the file
 * — and the wrong answer for the other two hundred. Somebody who banks
 * anywhere else was being told the app could not read their statement, when
 * the truth was that nobody had written eleven lines for it yet.
 *
 * So: read the header, work out which column is the date, which is the
 * description and which is the money, and say so on the screen where it can be
 * corrected. The correcting is the point — a sniffer that is right nine times
 * in ten and silent about the tenth is worse than one that shows its work.
 *
 * What this handles, which is most of what a bank exports:
 *
 *  · commas, semicolons or tabs between the fields;
 *  · quoted fields with the separator inside them;
 *  · one signed amount column, or separate money-in and money-out columns;
 *  · `1.234,56` and `1,234.56` and `1234.56`, with or without a currency
 *    symbol, and `(12.30)` for a negative;
 *  · `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY` and the same with dots or
 *    dashes, two-digit years included.
 *
 * A file with no header row still works — the columns are named by position
 * and pointed at by hand. What it does not do is a statement laid out as a
 * report rather than a table, or one where a line's meaning comes from the
 * line above it. Those are what a written parser is for.
 */

/** The fields a movement needs, and the ones it can do without. */
export type CsvMapping = {
	/** Header names, exactly as they appear in the file. */
	date: string;
	description: string;
	/** One signed column… */
	amount?: string;
	/** …or a pair of columns, one for each direction. */
	moneyIn?: string;
	moneyOut?: string;
	/** The bank's own id, when the file carries one. */
	id?: string;
	/** Which of the first two numbers in a date is the day. */
	dayFirst: boolean;
};

export type CsvSniff = {
	delimiter: string;
	headers: string[];
	/** The first few rows, for showing what the guess did to them. */
	sample: string[][];
	mapping: CsvMapping;
	/** True when the header row looked like data — probably a file with none. */
	headerless: boolean;
};

/** What a column called this is probably for. Lowercased, accents stripped. */
const ALIASES: Record<keyof Omit<CsvMapping, 'dayFirst'>, string[]> = {
	date: [
		'date',
		'data',
		'fecha',
		'datum',
		'posted',
		'posting date',
		'transaction date',
		'booking date',
		'value date',
		'data lancamento',
		'data movimento'
	],
	description: [
		'description',
		'descricao',
		'descripcion',
		'memo',
		'details',
		'detail',
		'narrative',
		'payee',
		'title',
		'titulo',
		'historico',
		'concepto',
		'reference',
		'name',
		'lancamento'
	],
	amount: ['amount', 'valor', 'value', 'importe', 'betrag', 'montant', 'quantia'],
	moneyIn: [
		'credit',
		'credito',
		'money in',
		'paid in',
		'deposit',
		'entrada',
		'receita',
		'haber',
		'inflow'
	],
	moneyOut: [
		'debit',
		'debito',
		'money out',
		'paid out',
		'withdrawal',
		'saida',
		'despesa',
		'debe',
		'outflow'
	],
	id: ['id', 'identificador', 'transaction id', 'reference id', 'fitid', 'uid']
};

/** Lowercase, unaccented, punctuation-free — so `Descrição` meets `descricao`. */
function plain(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9 ]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Which separator this file uses.
 *
 * The one that gives the same field count on the most lines, rather than the
 * one that appears most often: a description full of commas beats a semicolon
 * file on raw count, and loses on consistency, which is what a table has.
 */
function sniffDelimiter(lines: string[]): string {
	let best = ',';
	let bestScore = -1;
	for (const candidate of [',', ';', '\t', '|']) {
		const counts = lines.slice(0, 10).map((l) => splitRow(l, candidate).length);
		const fields = counts[0] ?? 0;
		if (fields < 2) continue;
		const score = counts.filter((n) => n === fields).length * 10 + fields;
		if (score > bestScore) {
			bestScore = score;
			best = candidate;
		}
	}
	return best;
}

/** One CSV row into its fields, respecting `"quotes, like this"`. */
export function splitRow(line: string, delimiter: string): string[] {
	const out: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quoted) {
			if (c === '"') {
				if (line[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += c;
			continue;
		}
		if (c === '"') quoted = true;
		else if (c === delimiter) {
			out.push(field.trim());
			field = '';
		} else field += c;
	}
	out.push(field.trim());
	return out;
}

/** A date in any of the shapes a bank writes, or null. */
export function readDate(raw: string, dayFirst: boolean): string | null {
	const m = raw.trim().match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
	if (!m) return null;
	let year: number, month: number, day: number;
	if (m[1].length === 4) {
		[year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
	} else {
		year = Number(m[3]);
		if (m[3].length <= 2) year += year < 70 ? 2000 : 1900;
		[day, month] = dayFirst ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
	}
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Money, in whatever way the file writes it, as signed minor units.
 *
 * Which of `.` and `,` is the decimal point is decided per value by which one
 * comes last — `1.234,56` and `1,234.56` are the same amount written by two
 * halves of the world, and the separator nearer the end is the one splitting
 * off the pennies. A lone separator with exactly two digits after it is a
 * decimal; with three it is thousands, because `1,234` is not twelve reais.
 */
export function readMoney(raw: string): number | null {
	let text = raw.trim();
	if (!text) return null;

	let negative = false;
	// `(12.30)` is accounting for -12.30, and a trailing `-` is some exports'
	// way of saying the same thing.
	if (/^\(.*\)$/.test(text)) {
		negative = true;
		text = text.slice(1, -1);
	}
	if (text.endsWith('-')) {
		negative = true;
		text = text.slice(0, -1);
	}
	text = text.replace(/[^\d,.-]/g, '');
	if (text.startsWith('-')) {
		negative = !negative;
		text = text.slice(1);
	}
	if (!/\d/.test(text)) return null;

	const lastComma = text.lastIndexOf(',');
	const lastDot = text.lastIndexOf('.');
	let decimalAt = -1;
	if (lastComma >= 0 || lastDot >= 0) {
		const candidate = Math.max(lastComma, lastDot);
		const after = text.length - candidate - 1;
		if (after === 1 || after === 2) decimalAt = candidate;
	}

	const whole = (decimalAt < 0 ? text : text.slice(0, decimalAt)).replace(/[^\d]/g, '');
	const frac = decimalAt < 0 ? '' : text.slice(decimalAt + 1).replace(/[^\d]/g, '');
	if (!whole && !frac) return null;

	const cents = Number(whole || '0') * 100 + Number((frac || '0').padEnd(2, '0').slice(0, 2));
	return negative ? -cents : cents;
}

/** The header this column is, by name; -1 for none of them. */
function guessColumn(headers: string[], field: keyof typeof ALIASES): string | undefined {
	const wanted = ALIASES[field];
	const named = headers.map(plain);
	// Exact first, then contains — `Data` beats `Data de compensação` for the
	// date, and `Valor (R$)` still finds `valor`.
	const exact = named.findIndex((h) => wanted.includes(h));
	if (exact >= 0) return headers[exact];
	const partial = named.findIndex((h) => wanted.some((w) => h.includes(w)));
	return partial >= 0 ? headers[partial] : undefined;
}

/**
 * Read the file far enough to say what its columns are.
 *
 * Everything here is a guess the person can overrule, including whether the
 * first row is a header at all.
 */
export function sniffCsv(text: string): CsvSniff | null {
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	if (lines.length < 2) return null;

	const delimiter = sniffDelimiter(lines);
	const headers = splitRow(lines[0], delimiter);
	if (headers.length < 2) return null;

	// A header row is one whose cells are not dates and not money. A file that
	// starts straight into its data gets columns named by position, which the
	// person can then point at.
	const headerless = headers.some((h) => readDate(h, true) !== null);
	const names = headerless ? headers.map((_, i) => `Column ${i + 1}`) : headers;
	const rows = lines.slice(headerless ? 0 : 1).map((l) => splitRow(l, delimiter));

	const mapping: CsvMapping = {
		date: guessColumn(names, 'date') ?? names[0],
		description: guessColumn(names, 'description') ?? names[1],
		amount: guessColumn(names, 'amount'),
		moneyIn: guessColumn(names, 'moneyIn'),
		moneyOut: guessColumn(names, 'moneyOut'),
		id: guessColumn(names, 'id'),
		dayFirst: true
	};

	/*
	 * A pair of direction columns wins over a single amount, when both look
	 * present: a file with `Debit` and `Credit` beside an `Amount` is one where
	 * the amount is unsigned and the direction lives in which column it sits.
	 */
	if (mapping.moneyIn && mapping.moneyOut) mapping.amount = undefined;
	else {
		mapping.moneyIn = undefined;
		mapping.moneyOut = undefined;
		mapping.amount ??= names.find((n) => n !== mapping.date && n !== mapping.description);
	}

	/*
	 * Day first, unless the file proves otherwise.
	 *
	 * A column of dates where something past the twelfth sits in the first
	 * position can only be day-first, and one where it sits in the second can
	 * only be month-first. Where every day of the month is twelve or under the
	 * file is genuinely ambiguous and the screen says so.
	 */
	const at = names.indexOf(mapping.date);
	const firsts = rows
		.map((r) => r[at]?.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]/))
		.filter((m): m is RegExpMatchArray => Boolean(m));
	if (firsts.some((m) => Number(m[1]) > 12)) mapping.dayFirst = true;
	else if (firsts.some((m) => Number(m[2]) > 12)) mapping.dayFirst = false;

	return { delimiter, headers: names, sample: rows.slice(0, 5), mapping, headerless };
}

/** The file, read through a mapping. Lines it cannot read are skipped. */
export function parseCsv(text: string, mapping: CsvMapping): ParsedMovement[] {
	const sniffed = sniffCsv(text);
	if (!sniffed) return [];

	const at = (name: string | undefined) =>
		name === undefined ? -1 : sniffed.headers.indexOf(name);
	const dateAt = at(mapping.date);
	const descAt = at(mapping.description);
	const amountAt = at(mapping.amount);
	const inAt = at(mapping.moneyIn);
	const outAt = at(mapping.moneyOut);
	const idAt = at(mapping.id);
	if (dateAt < 0) return [];

	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	const rows = lines.slice(sniffed.headerless ? 0 : 1).map((l) => splitRow(l, sniffed.delimiter));

	const out: ParsedMovement[] = [];
	for (const row of rows) {
		const occurredOn = readDate(row[dateAt] ?? '', mapping.dayFirst);
		if (!occurredOn) continue;

		let amountCents: number | null = null;
		if (amountAt >= 0) amountCents = readMoney(row[amountAt] ?? '');
		else {
			// Money out is money leaving, whichever sign the file wrote it with:
			// plenty of exports put both columns positive and mean the direction
			// by which one is filled.
			const paidIn = inAt >= 0 ? readMoney(row[inAt] ?? '') : null;
			const paidOut = outAt >= 0 ? readMoney(row[outAt] ?? '') : null;
			if (paidOut !== null && paidOut !== 0) amountCents = -Math.abs(paidOut);
			else if (paidIn !== null && paidIn !== 0) amountCents = Math.abs(paidIn);
		}
		if (amountCents === null) continue;

		const externalId = idAt >= 0 ? (row[idAt] ?? '').trim() : '';
		out.push({
			occurredOn,
			amountCents,
			description: (descAt >= 0 ? (row[descAt] ?? '') : '').trim(),
			...(externalId ? { externalId } : {})
		});
	}
	return out;
}

/**
 * The registry entry, which parses with whatever the sniffer guessed.
 *
 * Choosing "Any CSV" and pressing Import with nothing else touched has to
 * work, because that is the case this exists for. The mapping controls on the
 * screen are for when the guess is wrong, and they reach the importer as their
 * own field rather than through here.
 */
export const csvColumns: BankParser = {
	bank: 'csv',
	slug: 'columns',
	name: 'Any CSV — name the columns',
	parse(text) {
		const sniffed = sniffCsv(text);
		return sniffed ? parseCsv(text, sniffed.mapping) : [];
	}
};
