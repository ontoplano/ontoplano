import type { PlainKey } from '../i18n/keys.js';
/**
 * Ledgers: the places money moves through.
 *
 * A current account is one, a credit card is another, and keeping them
 * apart is what makes "what did the card cost this month" answerable at
 * all. Everything imported belongs to exactly one, and a ledger carries the
 * export format it usually receives so importing into it is one gesture
 * rather than two choices.
 */
import { and, asc, eq } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { financeTransactions, ledgers } from '$lib/db/schema.js';
import { parserFor } from '../bank-parsers/index.js';
import type { Ctx } from './ctx.js';
import { stamp, stamps } from './time.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { notebookPatch } from './notebooks.js';
import { oneOf, str } from './validate.js';

export const LEDGER_KINDS = ['bank', 'card', 'cash', 'other'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_LABELS: Record<LedgerKind, PlainKey> = {
	bank: 'tour.account',
	card: 'ledgers.card',
	cash: 'ledgers.cash',
	other: 'people.other'
};

export const MAX_LEDGER_NAME_LENGTH = 120;

export type Ledger = {
	id: number;
	name: string;
	kind: LedgerKind;
	defaultParser: string | null;
	currency: string | null;
	archived: boolean;
	sortOrder: number;
	/** The subject it belongs to, if any. */
	notebookId: number | null;
	/** How many lines it holds, and what they add up to. */
	count: number;
	balanceCents: number;
	/** The most recent line's date, or null while it is empty. */
	lastOn: string | null;
};

type LedgerInput = {
	name?: unknown;
	kind?: unknown;
	defaultParser?: unknown;
	currency?: unknown;
	/** The subject it belongs to, when it is part of one. */
	notebookId?: unknown;
};

function fields(ctx: Ctx, input: LedgerInput, fallback?: Ledger) {
	const parser =
		input.defaultParser === undefined || input.defaultParser === null || input.defaultParser === ''
			? null
			: str(input.defaultParser, 'parser', { max: 100 });
	if (parser && !parserFor(parser))
		throw new ValidationError({ key: 'errors.ledgers.noParserKnowsThatExport' });
	return {
		name: str(input.name ?? fallback?.name, 'name', { max: MAX_LEDGER_NAME_LENGTH }),
		kind: oneOf(input.kind ?? fallback?.kind ?? 'bank', 'kind', LEDGER_KINDS),
		defaultParser: parser,
		currency:
			input.currency === undefined || input.currency === null || input.currency === ''
				? (fallback?.currency ?? null)
				: str(input.currency, 'currency', { max: 8 }),
		// Only when the caller mentioned it — see `notebookPatch`.
		...notebookPatch(ctx, input)
	};
}

/**
 * The ledgers, all of them or one subject's.
 *
 * `notebookId` narrows rather than changing the shape: a notebook's Ledgers
 * tab is this room looking at one subject and draws the rows with the same
 * component, so it needs exactly what the room needs.
 */
export function listLedgers(
	ctx: Ctx,
	opts: { includeArchived?: boolean; notebookId?: number } = {}
): Ledger[] {
	const rows = db
		.select()
		.from(ledgers)
		.where(
			and(
				eq(ledgers.userId, ctx.userId),
				opts.includeArchived ? undefined : eq(ledgers.archived, false),
				opts.notebookId === undefined ? undefined : eq(ledgers.notebookId, opts.notebookId)
			)
		)
		.orderBy(asc(ledgers.sortOrder), asc(ledgers.id))
		.all();

	// One pass over the lines rather than a query per ledger: a person has a
	// handful of ledgers and the totals are wanted for all of them at once.
	const lines = db
		.select({
			ledgerId: financeTransactions.ledgerId,
			amountCents: financeTransactions.amountCents,
			occurredOn: financeTransactions.occurredOn
		})
		.from(financeTransactions)
		.where(eq(financeTransactions.userId, ctx.userId))
		.all();

	return rows.map((l) => {
		const mine = lines.filter((t) => t.ledgerId === l.id);
		return {
			id: l.id,
			name: l.name,
			kind: l.kind as LedgerKind,
			defaultParser: l.defaultParser,
			currency: l.currency,
			archived: l.archived,
			sortOrder: l.sortOrder,
			notebookId: l.notebookId,
			count: mine.length,
			balanceCents: mine.reduce((sum, t) => sum + t.amountCents, 0),
			lastOn: mine.reduce<string | null>(
				(latest, t) => (latest === null || t.occurredOn > latest ? t.occurredOn : latest),
				null
			)
		};
	});
}

export function getLedger(ctx: Ctx, id: number): Ledger {
	const found = listLedgers(ctx, { includeArchived: true }).find((l) => l.id === id);
	if (!found) throw new NotFoundError('ledger');
	return found;
}

export function createLedger(ctx: Ctx, input: LedgerInput): Ledger {
	const f = fields(ctx, input);
	const existing = listLedgers(ctx, { includeArchived: true });
	if (existing.some((l) => l.name === f.name))
		throw new ConflictError({ key: 'errors.ledgers.aLedgerByThatName' });
	const inserted = db
		.insert(ledgers)
		.values({ userId: ctx.userId, ...f, sortOrder: existing.length, ...stamps(ctx) })
		.returning({ id: ledgers.id })
		.get();
	return getLedger(ctx, inserted.id);
}

export function updateLedger(ctx: Ctx, id: number, input: LedgerInput): Ledger {
	const before = getLedger(ctx, id);
	const f = fields(ctx, input, before);
	if (
		f.name !== before.name &&
		listLedgers(ctx, { includeArchived: true }).some((l) => l.name === f.name)
	)
		throw new ConflictError({ key: 'errors.ledgers.aLedgerByThatName' });
	db.update(ledgers)
		.set({ ...f, updatedAt: stamp(ctx) })
		.where(and(eq(ledgers.id, id), eq(ledgers.userId, ctx.userId)))
		.run();
	return getLedger(ctx, id);
}

/** Put away without losing anything: its lines stay, and its totals with them. */
export function setLedgerArchived(ctx: Ctx, id: number, archived: boolean): void {
	getLedger(ctx, id);
	db.update(ledgers)
		.set({ archived, updatedAt: stamp(ctx) })
		.where(and(eq(ledgers.id, id), eq(ledgers.userId, ctx.userId)))
		.run();
}

/**
 * Gone, and its lines with it.
 *
 * The lines go first and explicitly: SQLite cannot attach an `ON DELETE` to
 * a column added by `ALTER TABLE`, so the cascade would have been a promise
 * the migration could not keep. Doing it here is also where it belongs —
 * beside the confirmation that says how many lines are about to go.
 */
export function deleteLedger(ctx: Ctx, id: number): void {
	getLedger(ctx, id);
	db.delete(financeTransactions)
		.where(and(eq(financeTransactions.ledgerId, id), eq(financeTransactions.userId, ctx.userId)))
		.run();
	db.delete(ledgers)
		.where(and(eq(ledgers.id, id), eq(ledgers.userId, ctx.userId)))
		.run();
}

/** A move is a reinsertion: every ledger is resequenced around the one moved. */
export function moveLedger(ctx: Ctx, id: number, delta: number): void {
	const all = listLedgers(ctx, { includeArchived: true });
	const from = all.findIndex((l) => l.id === id);
	if (from === -1) throw new NotFoundError('ledger');
	const to = Math.min(Math.max(from + delta, 0), all.length - 1);
	if (to === from) return;
	const [moved] = all.splice(from, 1);
	all.splice(to, 0, moved);
	all.forEach((l, index) => {
		db.update(ledgers)
			.set({ sortOrder: index })
			.where(and(eq(ledgers.id, l.id), eq(ledgers.userId, ctx.userId)))
			.run();
	});
}
