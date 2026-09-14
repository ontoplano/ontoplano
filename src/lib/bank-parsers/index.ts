/**
 * The bank-export parsers, and the registry that names them.
 *
 * A parser is code, so it arrives the way code does: written in this
 * directory, registered here, reviewed and approved by whoever merges it —
 * never configured at runtime. The key is `bank:export` ('nubank:conta_corrente'),
 * because one bank ships several export shapes and the pair is what a person
 * actually holds in their hand. The friendly name is what the import screen
 * shows.
 *
 * A parser's one promise: signed minor units, negative when money left.
 * Whatever the bank's own sign convention, the parser translates it — the
 * "flip amounts" switch on the import screen exists for the person, not to
 * paper over a parser that got its own bank wrong.
 */
import { csvColumns } from './csv.js';
import { nubankContaCorrente, nubankCreditCardMonth } from './nubank.js';

export { decimalToCents } from './shape.js';
export type { BankParser, ParsedMovement } from './shape.js';
import type { BankParser } from './shape.js';

/**
 * The generic one leads, because it is the answer for most people.
 *
 * A list that opened with two shapes of one Brazilian bank told everybody else
 * the app could not read their statement. It can read most of them; it just
 * has to be shown which column is which, and that is the first entry now.
 */
export const BANK_PARSERS: readonly BankParser[] = [
	csvColumns,
	nubankContaCorrente,
	nubankCreditCardMonth
];

export { parseCsv, sniffCsv, type CsvMapping, type CsvSniff } from './csv.js';
export const CSV_PARSER_KEY = 'csv:columns';

export function parserKey(p: BankParser): string {
	return `${p.bank}:${p.slug}`;
}

export function parserFor(key: string): BankParser | null {
	return BANK_PARSERS.find((p) => parserKey(p) === key) ?? null;
}
