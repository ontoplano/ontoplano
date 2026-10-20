/**
 * Custody, simple debts and reserves are stocks, not bank movements or budgets.
 * A balance is the declared opening plus dated entries in its original currency.
 * Splits and settlements retain their source evidence; nothing here invents money.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import {
	financeCommitments,
	financeCommitmentEntries,
	financeTransactionAllocations,
	financeTransactions,
	ledgers,
	people
} from '$lib/db/schema.js';
import { formatMoney, normaliseCurrency } from '../money.js';
import { localDateOf, type Ctx } from './ctx.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { civilDay, minorAmount, num, oneOf, optionalStr, str } from './validate.js';
import { stamp } from './time.js';
import { splitMovement } from './statements.js';

export const COMMITMENT_KINDS = ['custody', 'payable', 'receivable', 'reserve'] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];
export type Commitment = typeof financeCommitments.$inferSelect & {
	personName: string | null;
	balanceMinor: number;
	lastEntryOn: string | null;
	entryCount: number;
};
export type CommitmentEntry = typeof financeCommitmentEntries.$inferSelect & {
	balanceMinor: number;
};
type CommitmentInput = {
	name?: unknown;
	kind?: unknown;
	currency?: unknown;
	openingMinor?: unknown;
	personId?: unknown;
	notes?: unknown;
};
type EntryInput = {
	commitmentId: unknown;
	occurredOn: unknown;
	amountMinor: unknown;
	transactionId?: unknown;
	note?: unknown;
};
export const MAX_NAME = 200;
export const MAX_NOTE = 2000;

/** One aggregate per stock; closed records only appear when explicitly requested. */
export function listCommitments(
	ctx: Ctx,
	options: { includeArchived?: boolean } = {}
): Commitment[] {
	return db
		.select({
			id: financeCommitments.id,
			userId: financeCommitments.userId,
			kind: financeCommitments.kind,
			name: financeCommitments.name,
			personId: financeCommitments.personId,
			personName: people.name,
			currency: financeCommitments.currency,
			openingMinor: financeCommitments.openingMinor,
			notes: financeCommitments.notes,
			status: financeCommitments.status,
			createdAt: financeCommitments.createdAt,
			updatedAt: financeCommitments.updatedAt,
			balanceMinor: sql<number>`${financeCommitments.openingMinor} + coalesce(sum(${financeCommitmentEntries.amountMinor}), 0)`,
			lastEntryOn: sql<string | null>`max(${financeCommitmentEntries.occurredOn})`,
			entryCount: sql<number>`count(${financeCommitmentEntries.id})`
		})
		.from(financeCommitments)
		.leftJoin(
			people,
			and(eq(people.id, financeCommitments.personId), eq(people.userId, ctx.userId))
		)
		.leftJoin(
			financeCommitmentEntries,
			and(
				eq(financeCommitmentEntries.commitmentId, financeCommitments.id),
				eq(financeCommitmentEntries.userId, ctx.userId)
			)
		)
		.where(
			and(
				eq(financeCommitments.userId, ctx.userId),
				options.includeArchived ? undefined : eq(financeCommitments.status, 'open')
			)
		)
		.groupBy(financeCommitments.id)
		.orderBy(
			financeCommitments.kind,
			financeCommitments.currency,
			financeCommitments.name,
			financeCommitments.id
		)
		.all()
		.map((row) => ({ ...row, balanceMinor: minorAmount(row.balanceMinor, 'commitment balance') }));
}

export function getCommitment(ctx: Ctx, id: number): Commitment {
	const found = listCommitments(ctx, { includeArchived: true }).find((row) => row.id === id);
	if (!found) throw new NotFoundError('commitment');
	return found;
}

function fields(ctx: Ctx, input: CommitmentInput, before?: Commitment) {
	const name =
		input.name === undefined && before ? before.name : str(input.name, 'name', { max: MAX_NAME });
	const kind =
		input.kind === undefined && before
			? before.kind
			: oneOf(input.kind, 'commitment kind', COMMITMENT_KINDS);
	const currency =
		input.currency === undefined && before ? before.currency : normaliseCurrency(input.currency);
	if (!currency) throw new ValidationError('Choose a valid original currency.');
	const openingMinor = minorAmount(
		input.openingMinor === undefined ? (before?.openingMinor ?? 0) : input.openingMinor,
		'opening'
	);
	if (openingMinor < 0) throw new ValidationError('An opening stock cannot be negative.');
	const personId =
		input.personId === undefined
			? (before?.personId ?? null)
			: input.personId === null ||
				  input.personId === '' ||
				  input.personId === 0 ||
				  input.personId === '0'
				? null
				: num(input.personId, 'person', { int: true, min: 1 });
	if (
		personId !== null &&
		!db
			.select({ id: people.id })
			.from(people)
			.where(and(eq(people.userId, ctx.userId), eq(people.id, personId)))
			.get()
	)
		throw new NotFoundError('person');
	const notes =
		input.notes === undefined
			? (before?.notes ?? '')
			: optionalStr(input.notes, 'notes', { max: MAX_NOTE });
	return { name, kind, currency, openingMinor, personId, notes };
}

export function createCommitment(ctx: Ctx, input: CommitmentInput): Commitment {
	return db.transaction((tx) => {
		const row = tx
			.insert(financeCommitments)
			.values({
				userId: ctx.userId,
				...fields(ctx, input),
				status: 'open',
				createdAt: stamp(ctx),
				updatedAt: stamp(ctx)
			})
			.returning({ id: financeCommitments.id })
			.get();
		return getCommitment(ctx, row.id);
	});
}

/** Validate every historical running balance, not just today's residual. */
function assertHistory(ctx: Ctx, id: number, opening: number): void {
	let balance = opening;
	for (const entry of db
		.select({ amount: financeCommitmentEntries.amountMinor })
		.from(financeCommitmentEntries)
		.where(
			and(
				eq(financeCommitmentEntries.userId, ctx.userId),
				eq(financeCommitmentEntries.commitmentId, id)
			)
		)
		.orderBy(asc(financeCommitmentEntries.occurredOn), asc(financeCommitmentEntries.id))
		.all()) {
		balance = minorAmount(balance + entry.amount, 'running balance');
		if (balance < 0)
			throw new ValidationError(
				'The commitment’s running balance cannot become negative. Record an explicit increase before overpaying.'
			);
	}
}

export function updateCommitment(ctx: Ctx, id: number, input: CommitmentInput): void {
	db.transaction((tx) => {
		const before = getCommitment(ctx, id);
		const next = fields(ctx, input, before);
		const allocated = tx
			.select({ id: financeTransactionAllocations.id })
			.from(financeTransactionAllocations)
			.where(
				and(
					eq(financeTransactionAllocations.userId, ctx.userId),
					eq(financeTransactionAllocations.commitmentId, id)
				)
			)
			.get();
		if (
			(before.entryCount || allocated) &&
			(next.kind !== before.kind || next.currency !== before.currency)
		)
			throw new ValidationError(
				'Kind and currency cannot change while history or allocations depend on them.'
			);
		assertHistory(ctx, id, next.openingMinor);
		if (before.status === 'settled' && next.openingMinor !== before.openingMinor)
			throw new ValidationError('Reopen this commitment before correcting its opening.');
		tx.update(financeCommitments)
			.set({ ...next, updatedAt: stamp(ctx) })
			.where(and(eq(financeCommitments.userId, ctx.userId), eq(financeCommitments.id, id)))
			.run();
	});
}

export function archiveCommitment(ctx: Ctx, id: number, archived: boolean): void {
	getCommitment(ctx, id);
	db.update(financeCommitments)
		.set({ status: archived ? 'archived' : 'open', updatedAt: stamp(ctx) })
		.where(and(eq(financeCommitments.userId, ctx.userId), eq(financeCommitments.id, id)))
		.run();
}

export function listCommitmentEntries(ctx: Ctx, id: number): CommitmentEntry[] {
	const stock = getCommitment(ctx, id);
	let balance = stock.openingMinor;
	return db
		.select()
		.from(financeCommitmentEntries)
		.where(
			and(
				eq(financeCommitmentEntries.userId, ctx.userId),
				eq(financeCommitmentEntries.commitmentId, id)
			)
		)
		.orderBy(asc(financeCommitmentEntries.occurredOn), asc(financeCommitmentEntries.id))
		.all()
		.map((row) => ({
			...row,
			balanceMinor: (balance = minorAmount(balance + row.amountMinor, 'running balance'))
		}));
}

export function getCommitmentEntry(ctx: Ctx, id: number) {
	const entry = db
		.select()
		.from(financeCommitmentEntries)
		.where(
			and(eq(financeCommitmentEntries.userId, ctx.userId), eq(financeCommitmentEntries.id, id))
		)
		.get();
	if (!entry) throw new NotFoundError('commitment entry');
	return entry;
}

function payment(ctx: Ctx, id: number) {
	const row = db
		.select({ movement: financeTransactions, currency: ledgers.currency })
		.from(financeTransactions)
		.innerJoin(
			ledgers,
			and(eq(ledgers.id, financeTransactions.ledgerId), eq(ledgers.userId, ctx.userId))
		)
		.where(and(eq(financeTransactions.userId, ctx.userId), eq(financeTransactions.id, id)))
		.get();
	if (!row) throw new NotFoundError('movement');
	return row;
}

export function addCommitmentEntry(ctx: Ctx, input: EntryInput) {
	const id = num(input.commitmentId, 'commitment', { int: true, min: 1 });
	const occurredOn = civilDay(input.occurredOn);
	const amountMinor = minorAmount(input.amountMinor);
	if (!amountMinor)
		throw new ValidationError('An entry must change the stock by a nonzero amount.');
	const transactionId =
		input.transactionId === undefined || input.transactionId === null || input.transactionId === ''
			? null
			: num(input.transactionId, 'movement', { int: true, min: 1 });
	const note = optionalStr(input.note, 'note', { max: MAX_NOTE }) || null;
	return db.transaction((tx) => {
		const stock = getCommitment(ctx, id);
		if (stock.status !== 'open')
			throw new ValidationError('Reopen the commitment before adding entries.');
		if (transactionId !== null) {
			const { movement, currency } = payment(ctx, transactionId);
			if (
				(stock.kind === 'reserve' || stock.kind === 'receivable') &&
				tx
					.select({ id: financeCommitmentEntries.id })
					.from(financeCommitmentEntries)
					.where(
						and(
							eq(financeCommitmentEntries.userId, ctx.userId),
							eq(financeCommitmentEntries.transactionId, transactionId)
						)
					)
					.get()
			)
				throw new ConflictError(
					'This bank movement already changes a stock. Reverse its entry before reusing it.'
				);
			if (!currency || stock.currency !== currency)
				throw new ValidationError('A stock and its payment must share a known currency.');
			if (movement.occurredOn !== occurredOn)
				throw new ValidationError('A linked entry keeps its bank movement’s date.');
			if (
				tx
					.select({ id: financeCommitmentEntries.id })
					.from(financeCommitmentEntries)
					.where(
						and(
							eq(financeCommitmentEntries.userId, ctx.userId),
							eq(financeCommitmentEntries.commitmentId, id),
							eq(financeCommitmentEntries.transactionId, transactionId)
						)
					)
					.get()
			)
				throw new ConflictError('This movement already has an entry in this commitment.');
			const parts = tx
				.select()
				.from(financeTransactionAllocations)
				.where(
					and(
						eq(financeTransactionAllocations.userId, ctx.userId),
						eq(financeTransactionAllocations.transactionId, transactionId)
					)
				)
				.all();
			if (stock.kind === 'custody' || stock.kind === 'payable') {
				const share = parts
					.filter((part) => part.kind === 'custody' && part.commitmentId === id)
					.reduce((sum, part) => minorAmount(sum + part.amountMinor), 0);
				if (share !== amountMinor)
					throw new ValidationError(
						'A custody entry must match its retained allocation exactly. Split the movement first.'
					);
			} else if (stock.kind === 'reserve') {
				const kind = movement.kind ?? (movement.amountCents < 0 ? 'expense' : 'income');
				if (
					!['expense', 'fee'].includes(kind) ||
					parts.some((part) => part.kind === 'custody') ||
					amountMinor !== movement.amountCents ||
					amountMinor >= 0
				)
					throw new ValidationError('A reserve is consumed by one whole personal expense or fee.');
			} else if (
				movement.amountCents <= 0 ||
				amountMinor !== -movement.amountCents ||
				parts.length ||
				movement.groupId ||
				![null, 'income'].includes(movement.kind)
			) {
				throw new ValidationError(
					'A receivable settlement needs one incoming repayment in its original currency.'
				);
			}
		}
		const entry = tx
			.insert(financeCommitmentEntries)
			.values({
				userId: ctx.userId,
				commitmentId: id,
				occurredOn,
				amountMinor,
				transactionId,
				note,
				createdAt: stamp(ctx)
			})
			.returning()
			.get();
		assertHistory(ctx, id, stock.openingMinor);
		tx.update(financeCommitments)
			.set({ updatedAt: stamp(ctx) })
			.where(and(eq(financeCommitments.userId, ctx.userId), eq(financeCommitments.id, id)))
			.run();
		return entry;
	});
}

export function deleteCommitmentEntry(ctx: Ctx, id: number): void {
	db.transaction((tx) => {
		const entry = getCommitmentEntry(ctx, id);
		const stock = getCommitment(ctx, entry.commitmentId);
		tx.delete(financeCommitmentEntries)
			.where(
				and(eq(financeCommitmentEntries.userId, ctx.userId), eq(financeCommitmentEntries.id, id))
			)
			.run();
		assertHistory(ctx, stock.id, stock.openingMinor);
		// Editing history reopens the record, whether it was settled or archived:
		// the assistant log's "Put it back" adds an entry through the same
		// service, and that is refused while the stock is not open.
		tx.update(financeCommitments)
			.set({ status: 'open', updatedAt: stamp(ctx) })
			.where(and(eq(financeCommitments.userId, ctx.userId), eq(financeCommitments.id, stock.id)))
			.run();
	});
}

export function closeCommitment(
	ctx: Ctx,
	id: number,
	input: { writeOffNote?: unknown } = {}
): void {
	db.transaction((tx) => {
		const stock = getCommitment(ctx, id);
		if (stock.status !== 'open')
			throw new ValidationError('Reopen the commitment before closing it.');
		if (stock.balanceMinor) {
			const note = optionalStr(input.writeOffNote, 'write-off note', { max: MAX_NOTE });
			if (!note)
				throw new ValidationError(
					`The outstanding balance is ${formatMoney(stock.balanceMinor, stock.currency)}. An explicit write-off note is required.`
				);
			addCommitmentEntry(ctx, {
				commitmentId: id,
				occurredOn:
					stock.lastEntryOn && stock.lastEntryOn > localDateOf(ctx.now, ctx.tz)
						? stock.lastEntryOn
						: localDateOf(ctx.now, ctx.tz),
				amountMinor: -stock.balanceMinor,
				note
			});
		}
		tx.update(financeCommitments)
			.set({ status: 'settled', updatedAt: stamp(ctx) })
			.where(and(eq(financeCommitments.userId, ctx.userId), eq(financeCommitments.id, id)))
			.run();
	});
}

export function deleteCommitment(
	ctx: Ctx,
	id: number,
	options: { permanent?: boolean } = {}
): void {
	db.transaction((tx) => {
		const stock = getCommitment(ctx, id);
		const linked = tx
			.select({ id: financeTransactionAllocations.id })
			.from(financeTransactionAllocations)
			.where(
				and(
					eq(financeTransactionAllocations.userId, ctx.userId),
					eq(financeTransactionAllocations.commitmentId, id)
				)
			)
			.get();
		// Ordinary delete always puts the record away first, with or without
		// history; permanent deletion is the explicit archived-view action the
		// dialog describes. A no-history stock used to vanish from this button
		// while the copy promised the archived view.
		if (!options.permanent) {
			archiveCommitment(ctx, id, true);
			return;
		}
		if (stock.status !== 'archived')
			throw new ValidationError('Archive this commitment before permanently deleting it.');
		if (
			linked ||
			tx
				.select({ id: financeCommitmentEntries.id })
				.from(financeCommitmentEntries)
				.where(
					and(
						eq(financeCommitmentEntries.userId, ctx.userId),
						eq(financeCommitmentEntries.commitmentId, id),
						sql`${financeCommitmentEntries.transactionId} is not null`
					)
				)
				.get()
		)
			throw new ValidationError(
				'Unlink the movement evidence before permanently deleting this commitment.'
			);
		tx.delete(financeCommitments)
			.where(and(eq(financeCommitments.userId, ctx.userId), eq(financeCommitments.id, id)))
			.run();
	});
}

/** Each kind/currency stays a stock of its own; debts are never netted into funds. */
export function commitmentTotals(ctx: Ctx) {
	return db
		.all<{ kind: CommitmentKind; currency: string; balanceMinor: number; count: number }>(
			sql`
		select c.kind, c.currency, sum(c.opening_minor + coalesce(e.amount, 0)) as balanceMinor, count(*) as count
		from finance_commitments c left join (
			select commitment_id, sum(amount_minor) as amount from finance_commitment_entries
			where user_id = ${ctx.userId} group by commitment_id
		) e on e.commitment_id = c.id
		where c.user_id = ${ctx.userId} and c.status = 'open' group by c.kind, c.currency order by c.kind, c.currency
	`
		)
		.map((row) => ({ ...row, balanceMinor: minorAmount(row.balanceMinor, 'commitment total') }));
}

export function settleCommitment(
	ctx: Ctx,
	input: { commitmentId: unknown; transactionId: unknown; note?: unknown }
) {
	return db.transaction(() => {
		const id = num(input.commitmentId, 'commitment', { int: true, min: 1 });
		const transactionId = num(input.transactionId, 'movement', { int: true, min: 1 });
		const stock = getCommitment(ctx, id);
		const { movement } = payment(ctx, transactionId);
		if (stock.kind === 'reserve')
			throw new ValidationError('Use reserve consumption for an earmark.');
		if (
			db
				.select({ id: financeCommitmentEntries.id })
				.from(financeCommitmentEntries)
				.where(
					and(
						eq(financeCommitmentEntries.userId, ctx.userId),
						eq(financeCommitmentEntries.transactionId, transactionId)
					)
				)
				.get()
		)
			throw new ConflictError('This movement already settles a stock.');
		if (Math.abs(movement.amountCents) > stock.balanceMinor)
			throw new ValidationError(
				`The outstanding balance is ${formatMoney(stock.balanceMinor, stock.currency)}. Record an explicit increase before overpaying.`
			);
		if (stock.kind === 'receivable') {
			return addCommitmentEntry(ctx, {
				commitmentId: id,
				transactionId,
				occurredOn: movement.occurredOn,
				amountMinor: -movement.amountCents,
				note: input.note
			});
		}
		if (movement.amountCents >= 0)
			throw new ValidationError(
				'A settlement uses an outgoing payment. Use a custody split to record received funds.'
			);
		splitMovement(ctx, {
			id: transactionId,
			allocations: [
				{ kind: 'custody', amountMinor: movement.amountCents, commitmentId: id, note: input.note }
			]
		});
		return listCommitmentEntries(ctx, id).find((entry) => entry.transactionId === transactionId)!;
	});
}

export function consumeReserve(
	ctx: Ctx,
	input: { commitmentId: unknown; transactionId: unknown; note?: unknown }
) {
	return db.transaction(() => {
		const id = num(input.commitmentId, 'commitment', { int: true, min: 1 });
		const transactionId = num(input.transactionId, 'movement', { int: true, min: 1 });
		if (getCommitment(ctx, id).kind !== 'reserve')
			throw new ValidationError('Choose a reserve to consume.');
		const { movement } = payment(ctx, transactionId);
		if (
			db
				.select({ id: financeCommitmentEntries.id })
				.from(financeCommitmentEntries)
				.where(
					and(
						eq(financeCommitmentEntries.userId, ctx.userId),
						eq(financeCommitmentEntries.transactionId, transactionId)
					)
				)
				.get()
		)
			throw new ConflictError('This expense already consumes a stock.');
		return addCommitmentEntry(ctx, {
			commitmentId: id,
			transactionId,
			occurredOn: movement.occurredOn,
			amountMinor: movement.amountCents,
			note: input.note
		});
	});
}
