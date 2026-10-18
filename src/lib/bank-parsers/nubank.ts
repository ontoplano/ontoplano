/**
 * Nubank's two CSV shapes.
 *
 * Conta corrente: `Data,Valor,Identificador,Descrição` — dates DD/MM/YYYY,
 * amounts already signed (negative left the account), and a UUID per
 * movement that makes re-importing the same file a perfect no-op.
 *
 * Credit card (the monthly export): `date,title,amount` — dates YYYY-MM-DD,
 * amounts positive for charges. A charge is money leaving, so the parser
 * flips the sign: a card export never says money arrived unless the line is
 * a payment or refund, which Nubank writes negative and therefore comes out
 * positive here. No id in this export; the fingerprinting that keeps two
 * identical espressos apart lives with the importer, which sees the whole
 * file.
 */
import {
	decimalToCents,
	StatementParseError,
	type BankParser,
	type ParsedMovement
} from './shape.js';

/** Non-empty data lines, the header dropped by matching, not by position. */
function dataLines(text: string, header: RegExp): { line: string; number: number }[] {
	return text
		.split(/\r?\n/)
		.map((line, index) => ({ line: line.trim(), number: index + 1 }))
		.filter(({ line }) => line && !header.test(line));
}

export const nubankContaCorrente: BankParser = {
	bank: 'nubank',
	slug: 'conta_corrente',
	name: 'Nubank — conta corrente',
	parse(text, options) {
		const out: ParsedMovement[] = [];
		for (const { line, number } of dataLines(text, /^Data,Valor,Identificador/i)) {
			// The description is free text and may hold commas, so the line is
			// split into its three fixed fields and the rest.
			const m = line.match(/^(\d{2})\/(\d{2})\/(\d{4}),(-?[\d.]+),([0-9a-fA-F-]{8,}),(.*)$/);
			if (!m) {
				if (options?.strict) throw new StatementParseError(number);
				continue;
			}
			const cents = decimalToCents(m[4]);
			if (cents === null) {
				if (options?.strict) throw new StatementParseError(number);
				continue;
			}
			out.push({
				...(options?.strict ? { line: number } : {}),
				occurredOn: `${m[3]}-${m[2]}-${m[1]}`,
				amountCents: cents,
				description: m[6].trim(),
				externalId: m[5]
			});
		}
		return out;
	}
};

export const nubankCreditCardMonth: BankParser = {
	bank: 'nubank',
	slug: 'credit_card_month',
	name: 'Nubank — cartão, fatura do mês',
	parse(text, options) {
		const out: ParsedMovement[] = [];
		for (const { line, number } of dataLines(text, /^date,title,amount/i)) {
			// The amount is the last field; the title keeps any commas of its own.
			const m = line.match(/^(\d{4})-(\d{2})-(\d{2}),(.*),(-?[\d.]+)$/);
			if (!m) {
				if (options?.strict) throw new StatementParseError(number);
				continue;
			}
			const cents = decimalToCents(m[5]);
			if (cents === null) {
				if (options?.strict) throw new StatementParseError(number);
				continue;
			}
			// A charge is money leaving: the sign flips.
			out.push({
				...(options?.strict ? { line: number } : {}),
				occurredOn: `${m[1]}-${m[2]}-${m[3]}`,
				amountCents: -cents,
				description: m[4].trim()
			});
		}
		return out;
	}
};
