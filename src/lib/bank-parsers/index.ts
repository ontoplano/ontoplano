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
import { nubankContaCorrente, nubankCreditCardMonth } from './nubank.js';

export { decimalToCents } from './shape.js';
export type { BankParser, ParsedMovement } from './shape.js';
import type { BankParser } from './shape.js';

export const BANK_PARSERS: readonly BankParser[] = [nubankContaCorrente, nubankCreditCardMonth];

export function parserKey(p: BankParser): string {
	return `${p.bank}:${p.slug}`;
}

export function parserFor(key: string): BankParser | null {
	return BANK_PARSERS.find((p) => parserKey(p) === key) ?? null;
}
