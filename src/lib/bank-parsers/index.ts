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

export type ParsedMovement = {
	/** The civil date the bank reports, YYYY-MM-DD. */
	occurredOn: string;
	/** Signed minor units: negative left the account. */
	amountCents: number;
	description: string;
	/** The bank's own id for the movement, when the export carries one. */
	externalId?: string;
};

export type BankParser = {
	bank: string;
	slug: string;
	/** What the import screen shows: "Nubank — conta corrente". */
	name: string;
	parse(text: string): ParsedMovement[];
};

export const BANK_PARSERS: readonly BankParser[] = [nubankContaCorrente, nubankCreditCardMonth];

export function parserKey(p: BankParser): string {
	return `${p.bank}:${p.slug}`;
}

export function parserFor(key: string): BankParser | null {
	return BANK_PARSERS.find((p) => parserKey(p) === key) ?? null;
}

/**
 * A decimal money string to signed cents, without passing through a float.
 * "-50.00" → -5000; "10.5" → 1050; "23.90" → 2390.
 */
export function decimalToCents(raw: string): number | null {
	const m = raw.trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
	if (!m) return null;
	const cents = Number(m[2]) * 100 + Number((m[3] ?? '0').padEnd(2, '0'));
	return m[1] === '-' ? -cents : cents;
}
