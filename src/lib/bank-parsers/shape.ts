/**
 * What a parser is, and the one piece of arithmetic they all need.
 *
 * Its own module because the registry in `index.ts` lists the parsers and
 * every parser needs these: with them in the registry the two files import
 * each other, which is a cycle — harmless under a bundler, fatal the moment
 * something loads a parser directly, as the dev seed does.
 */

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
