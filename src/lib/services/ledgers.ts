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
import { and, asc, desc, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { financeBalanceChecks, financeTransactions, ledgers } from '$lib/db/schema.js';
import { normaliseCurrency } from '../money.js';
import { parserFor } from '../bank-parsers/index.js';
import { localDateOf, type Ctx } from './ctx.js';
import { stamp, stamps } from './time.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { notebookPatch } from './notebooks.js';
import { civilDay, minorAmount, num, oneOf, str } from './validate.js';

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
	openingMinor: number;
	openingOn: string | null;
	asOf: string;
	recordedMinor: number;
	supportedMinor: number | null;
	outsideCoveredPeriod: number;
	balanceStatus: 'verified' | 'supported' | 'recorded';
	latestCheck: BalanceCheck | null;
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
	openingMinor?: unknown;
	openingOn?: unknown;
	/** The subject it belongs to, when it is part of one. */
	notebookId?: unknown;
};

function fields(ctx: Ctx, input: LedgerInput, fallback?: Ledger) {
	// Left out, the one it had: a change that names one field keeps the rest.
	const parser =
		input.defaultParser === undefined
			? (fallback?.defaultParser ?? null)
			: input.defaultParser === null || input.defaultParser === ''
				? null
				: str(input.defaultParser, 'parser', { max: 100 });
	if (parser && !parserFor(parser))
		throw new ValidationError({ key: 'errors.ledgers.noParserKnowsThatExport' });
	const currency =
		input.currency === undefined
			? (fallback?.currency ?? null)
			: input.currency === null || input.currency === ''
				? null
				: normaliseCurrency(input.currency);
	if (input.currency !== undefined && input.currency !== null && input.currency !== '' && !currency)
		throw new ValidationError('Choose a valid currency code.');
	if (fallback?.currency && currency !== fallback.currency) {
		const check = db
			.select({ id: financeBalanceChecks.id })
			.from(financeBalanceChecks)
			.where(
				and(
					eq(financeBalanceChecks.userId, ctx.userId),
					eq(financeBalanceChecks.ledgerId, fallback.id)
				)
			)
			.get();
		if (fallback.count > 0 || fallback.openingOn || check)
			throw new ValidationError(
				'Currency cannot change while this ledger holds movements, a declared opening or statement checks. No conversion is performed.'
			);
	}
	return {
		name: str(input.name ?? fallback?.name, 'name', { max: MAX_LEDGER_NAME_LENGTH }),
		kind: oneOf(input.kind ?? fallback?.kind ?? 'bank', 'kind', LEDGER_KINDS),
		defaultParser: parser,
		currency,
		openingMinor:
			input.openingMinor === undefined
				? (fallback?.openingMinor ?? 0)
				: minorAmount(input.openingMinor, 'opening'),
		openingOn:
			input.openingOn === undefined
				? (fallback?.openingOn ?? null)
				: input.openingOn === null || input.openingOn === ''
					? null
					: civilDay(input.openingOn, 'opening date'),
		// Only when the caller mentioned it — see `notebookPatch`.
		...notebookPatch(ctx, input, 'ledgers', fallback && { table: ledgers, id: fallback.id })
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
	opts: { includeArchived?: boolean; notebookId?: number; asOf?: string } = {}
): Ledger[] {
	const asOf = opts.asOf === undefined ? localDateOf(ctx.now, ctx.tz) : civilDay(opts.asOf);
	const rows = balanceRows(ctx, asOf, opts).all();
	const checks = checksQuery(ctx, undefined, asOf).all().map(evaluateCheck);
	const latest = new Map<number, BalanceCheck>();
	for (const check of checks) if (!latest.has(check.ledgerId)) latest.set(check.ledgerId, check);
	return rows.map((row) => {
		const supportedMinor = row.supportedMinor === null ? null : minorAmount(row.supportedMinor);
		const recordedMinor = minorAmount(row.recordedMinor);
		const latestCheck = latest.get(row.id) ?? null;
		return {
			...row,
			kind: row.kind as LedgerKind,
			asOf,
			recordedMinor,
			// Kept for old API consumers; this is a recorded subtotal, never a bank balance.
			balanceCents: recordedMinor,
			supportedMinor,
			latestCheck,
			balanceStatus:
				supportedMinor === null
					? 'recorded'
					: latestCheck?.status === 'matched'
						? 'verified'
						: 'supported'
		};
	});
}

/** The same inclusive coverage formula owns row, check and overview arithmetic. */
function coveredBalance(asOf: SQL | string) {
	return sql<number | null>`case when ${ledgers.openingOn} is null or ${ledgers.openingOn} > ${asOf}
		then null else ${ledgers.openingMinor} + coalesce(sum(case
		when ${financeTransactions.occurredOn} >= ${ledgers.openingOn}
		and ${financeTransactions.occurredOn} <= ${asOf} then ${financeTransactions.amountCents} else 0 end), 0) end`;
}

function balanceRows(
	ctx: Ctx,
	asOf: string,
	opts: { includeArchived?: boolean; notebookId?: number } = {}
) {
	// One pass over the lines rather than a query per ledger: a person has a
	// handful of ledgers and the totals are wanted for all of them at once.
	return db
		.select({
			...getTableColumns(ledgers),
			count: sql<number>`count(${financeTransactions.id})`.as('movement_count'),
			recordedMinor: sql<number>`coalesce(sum(${financeTransactions.amountCents}), 0)`.as(
				'recorded_minor'
			),
			supportedMinor: coveredBalance(asOf).as('supported_minor'),
			outsideCoveredPeriod:
				sql<number>`count(case when ${financeTransactions.occurredOn} < ${ledgers.openingOn} then 1 end)`.as(
					'outside_covered_period'
				),
			lastOn: sql<string | null>`max(${financeTransactions.occurredOn})`.as('last_on')
		})
		.from(ledgers)
		.leftJoin(
			financeTransactions,
			and(eq(financeTransactions.ledgerId, ledgers.id), eq(financeTransactions.userId, ctx.userId))
		)
		.where(
			and(
				eq(ledgers.userId, ctx.userId),
				opts.includeArchived ? undefined : eq(ledgers.archived, false),
				opts.notebookId === undefined ? undefined : eq(ledgers.notebookId, opts.notebookId)
			)
		)
		.groupBy(ledgers.id)
		.orderBy(asc(ledgers.sortOrder), asc(ledgers.id));
}

export type CurrencyFunds = {
	currency: string | null;
	supportedMinor: number | null;
	included: { id: number; name: string }[];
	excluded: { id: number; name: string }[];
};

/** Active covered ledgers only. Unknown currency is an exclusion, not an FX guess. */
export function supported(ctx: Ctx, asOf = localDateOf(ctx.now, ctx.tz)): CurrencyFunds[] {
	civilDay(asOf);
	const balances = balanceRows(ctx, asOf).as('ledger_balances');
	const totals = db
		.select({
			currency: balances.currency,
			supportedMinor: sql<
				number | null
			>`case when ${balances.currency} is null then null else sum(${balances.supportedMinor}) end`
		})
		.from(balances)
		.groupBy(balances.currency)
		.all();
	const rows = db
		.select({
			id: balances.id,
			name: balances.name,
			currency: balances.currency,
			amount: balances.supportedMinor
		})
		.from(balances)
		.all();
	for (const row of rows) if (row.amount !== null) minorAmount(row.amount);
	return totals
		.map((total) => ({
			currency: total.currency,
			supportedMinor: total.supportedMinor === null ? null : minorAmount(total.supportedMinor),
			included: rows
				.filter((l) => l.currency === total.currency && l.currency !== null && l.amount !== null)
				.map(({ id, name }) => ({ id, name })),
			excluded: rows
				.filter((l) => l.currency === total.currency && (l.currency === null || l.amount === null))
				.map(({ id, name }) => ({ id, name }))
		}))
		.sort((a, b) =>
			a.currency === null ? 1 : b.currency === null ? -1 : a.currency.localeCompare(b.currency)
		);
}

export type BalanceCheck = {
	id: number;
	ledgerId: number;
	asOf: string;
	observedMinor: number;
	note: string | null;
	createdAt: string;
	computedMinor: number | null;
	differenceMinor: number | null;
	status: 'matched' | 'different' | 'unverified';
};

function checksQuery(ctx: Ctx, ledgerId?: number, through?: string) {
	return db
		.select({
			id: financeBalanceChecks.id,
			ledgerId: financeBalanceChecks.ledgerId,
			asOf: financeBalanceChecks.asOf,
			observedMinor: financeBalanceChecks.observedMinor,
			note: financeBalanceChecks.note,
			createdAt: financeBalanceChecks.createdAt,
			computedMinor: coveredBalance(sql`${financeBalanceChecks.asOf}`)
		})
		.from(financeBalanceChecks)
		.innerJoin(
			ledgers,
			and(eq(ledgers.id, financeBalanceChecks.ledgerId), eq(ledgers.userId, ctx.userId))
		)
		.leftJoin(
			financeTransactions,
			and(eq(financeTransactions.ledgerId, ledgers.id), eq(financeTransactions.userId, ctx.userId))
		)
		.where(
			and(
				eq(financeBalanceChecks.userId, ctx.userId),
				ledgerId === undefined ? undefined : eq(financeBalanceChecks.ledgerId, ledgerId),
				through === undefined
					? undefined
					: sql`${financeBalanceChecks.asOf} = (
			select max(latest.as_of) from finance_balance_checks latest
			where latest.user_id = ${ctx.userId} and latest.ledger_id = ${financeBalanceChecks.ledgerId}
			and latest.as_of <= ${through})`
			)
		)
		.groupBy(financeBalanceChecks.id)
		.orderBy(desc(financeBalanceChecks.asOf), desc(financeBalanceChecks.id));
}

function evaluateCheck(row: Omit<BalanceCheck, 'differenceMinor' | 'status'>): BalanceCheck {
	const observedMinor = minorAmount(row.observedMinor);
	const computedMinor = row.computedMinor === null ? null : minorAmount(row.computedMinor);
	const differenceMinor =
		computedMinor === null ? null : minorAmount(observedMinor - computedMinor);
	return {
		...row,
		observedMinor,
		computedMinor,
		differenceMinor,
		status:
			differenceMinor === null ? 'unverified' : differenceMinor === 0 ? 'matched' : 'different'
	};
}

/** Observations remain evidence even when there is not yet an opening to check them against. */
export function listBalanceChecks(ctx: Ctx, ledgerId: number): BalanceCheck[] {
	getLedger(ctx, ledgerId);
	return checksQuery(ctx, ledgerId).all().map(evaluateCheck);
}

export function recordBalanceCheck(
	ctx: Ctx,
	input: { ledgerId: unknown; asOf: unknown; observedMinor: unknown; note?: unknown }
): BalanceCheck {
	const ledgerId = num(input.ledgerId, 'ledger', { int: true, min: 1 });
	getLedger(ctx, ledgerId);
	const asOf = civilDay(input.asOf);
	const observedMinor = minorAmount(input.observedMinor);
	const note =
		input.note === undefined || input.note === null || input.note === ''
			? null
			: str(input.note, 'note', { max: 1000 });
	return db.transaction((tx) => {
		const made = tx
			.insert(financeBalanceChecks)
			.values({ userId: ctx.userId, ledgerId, asOf, observedMinor, note, createdAt: stamp(ctx) })
			.onConflictDoNothing({
				target: [
					financeBalanceChecks.userId,
					financeBalanceChecks.ledgerId,
					financeBalanceChecks.asOf
				]
			})
			.returning({ id: financeBalanceChecks.id })
			.get();
		if (!made)
			throw new ConflictError(
				'A balance check already exists for this ledger and date. Delete it explicitly before recording a correction.'
			);
		return listBalanceChecks(ctx, ledgerId).find((check) => check.id === made.id)!;
	});
}

export function getBalanceCheck(ctx: Ctx, id: number): BalanceCheck | null {
	const check = db
		.select({ ledgerId: financeBalanceChecks.ledgerId })
		.from(financeBalanceChecks)
		.where(and(eq(financeBalanceChecks.id, id), eq(financeBalanceChecks.userId, ctx.userId)))
		.get();
	return check
		? (listBalanceChecks(ctx, check.ledgerId).find((one) => one.id === id) ?? null)
		: null;
}

export function deleteBalanceCheck(ctx: Ctx, id: number): void {
	const removed = db
		.delete(financeBalanceChecks)
		.where(and(eq(financeBalanceChecks.id, id), eq(financeBalanceChecks.userId, ctx.userId)))
		.run();
	if (!removed.changes) throw new NotFoundError('balance check');
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
	return db.transaction(() => {
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
	});
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
	db.transaction((tx) => {
		const linked = tx.all<{ id: number }>(sql`
			select t.id from finance_transactions t
			where t.user_id = ${ctx.userId} and t.ledger_id = ${id} and (
				exists (select 1 from finance_transaction_allocations a where a.user_id = ${ctx.userId} and a.transaction_id = t.id)
				or exists (select 1 from finance_commitment_entries e where e.user_id = ${ctx.userId} and e.transaction_id = t.id)
			)`);
		if (linked.length)
			throw new ValidationError(
				`Reverse linked entries and unsplit movements ${linked.map((row) => row.id).join(', ')} before deleting this ledger.`
			);
		tx.delete(financeTransactions)
			.where(and(eq(financeTransactions.ledgerId, id), eq(financeTransactions.userId, ctx.userId)))
			.run();
		tx.delete(ledgers)
			.where(and(eq(ledgers.id, id), eq(ledgers.userId, ctx.userId)))
			.run();
	});
}

/** A move is a reinsertion: every ledger is resequenced around the one moved. */
export function moveLedger(ctx: Ctx, id: number, delta: number): void {
	const from = listLedgers(ctx, { includeArchived: true }).findIndex((l) => l.id === id);
	if (from === -1) throw new NotFoundError('ledger');
	placeLedger(ctx, id, from + delta);
}

/**
 * Put a ledger at a place in the order `listLedgers` gives, counting from 0.
 * A place past either end is the end.
 */
export function placeLedger(ctx: Ctx, id: number, position: number): void {
	const all = listLedgers(ctx, { includeArchived: true });
	const from = all.findIndex((l) => l.id === id);
	if (from === -1) throw new NotFoundError('ledger');
	const to = Math.min(Math.max(Math.trunc(position), 0), all.length - 1);
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
