/**
 * What moved through a ledger, and the rules that make sense of it.
 *
 * Lines are kept as the bank said them — see the schema note on
 * `finance_transactions` — and the sorting happens at read time: a category
 * is the first rule whose pattern matches, in position order, so the
 * partition is deterministic and a month's categories add up; tags are
 * every rule that matches, so they overlap freely and are a lens rather
 * than a sum. A rule written today therefore sorts last year's lines, with
 * no resweep and nothing stored to drift.
 */
import { and, desc, eq, getTableColumns, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';

import { COLOUR_PALETTE } from '../colors.js';
import { db } from '$lib/db/index.js';
import {
	financeRules,
	financeTransactions,
	financeTransactionAllocations,
	financeCommitmentEntries,
	ledgers
} from '$lib/db/schema.js';
import {
	parserFor,
	parseCsv,
	BANK_PARSERS,
	CSV_PARSER_KEY,
	parserKey,
	type CsvMapping
} from '../bank-parsers/index.js';
import { localDateOf, type Ctx } from './ctx.js';
import { getLedger } from './ledgers.js';
import { MAX_NOTE, addCommitmentEntry, getCommitment } from './commitments.js';
import { stamp } from './time.js';
import { NotFoundError, ValidationError } from './errors.js';
import { num, oneOf, optionalStr, str } from './validate.js';
import { civilDay, minorAmount } from './validate.js';
import { minorUnits, normaliseCurrency } from '../money.js';
import { StatementParseError, type ParsedMovement } from '../bank-parsers/shape.js';
import { unsafePattern } from './regex-safety.js';

export const MAX_PATTERN_LENGTH = 300;
/**
 * The biggest statement one import reads, and the most lines it takes from it.
 *
 * A bank's year of a busy account is a few hundred kilobytes; these are far
 * above that and still far below what would hold the process. The line
 * ceiling matters separately from the byte one because a parser turns text
 * into inserts, and a file of nothing but short valid lines is the cheapest
 * way to ask for a million of them.
 */
export const MAX_STATEMENT_LENGTH = 2_000_000;
export const MAX_STATEMENT_LINES = 50_000;
/** As long a description as a line may carry into the table. */
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_RULE_NAME_LENGTH = 100;
/** How far back the plots look by default. Far enough for a shape. */
export const DEFAULT_MONTHS = 12;

/** The colours a new rule is given, in order. Changeable per rule afterwards. */
export const RULE_PALETTE = COLOUR_PALETTE;

/** What a line is filed under when no category rule claims it. */
export const UNCATEGORIZED = 'Uncategorized';

export type Movement = {
	id: number;
	ledgerId: number | null;
	ledgerName: string | null;
	occurredOn: string;
	amountCents: number;
	description: string;
	source: string;
	/** What somebody said it was, or null when the sign is all there is. */
	kind: MovementKind | null;
	/** Legs of one move between two owned accounts share this. */
	groupId: string | null;
	/** A transfer leg whose counterpart has not been named yet. */
	counterpartPending: boolean;
	/** The expense a refund reverses, or the payment a fee belongs to. */
	parentId: number | null;
	category: string | null;
	categoryColor: string | null;
	tags: { name: string; color: string }[];
	allocations: MovementAllocation[];
	/** The commitment entry this line already evidences, if any. */
	commitmentEntryId: number | null;
};

export type MovementAllocation = typeof financeTransactionAllocations.$inferSelect;
export type AllocationInput = {
	kind: unknown;
	amountMinor: unknown;
	category?: unknown;
	commitmentId?: unknown;
	note?: unknown;
};

/** A split never rewrites the bank line; custody entries and all parts land together. */
export function splitMovement(ctx: Ctx, input: { id: unknown; allocations: unknown }): void {
	const id = num(input.id, 'movement', { int: true, min: 1 });
	if (
		!Array.isArray(input.allocations) ||
		!input.allocations.length ||
		input.allocations.length > 100
	)
		throw new ValidationError('A split needs between 1 and 100 parts.');
	db.transaction((tx) => {
		const movement = ownMovement(ctx, id);
		assertMovementUnlinked(ctx, id);
		if (movement.groupId || movement.kind === 'transfer' || movement.kind === 'cash')
			throw new ValidationError(
				'Unlink the transfer or classify this movement before splitting it.'
			);
		if (!movement.amountCents) throw new ValidationError('A zero movement cannot be split.');
		const currency = movement.ledgerId === null ? null : ledgerCurrency(ctx, movement.ledgerId);
		const settlements = new Map<number, { amountMinor: number; notes: string[] }>();
		let sum = 0;
		const parts = (input.allocations as unknown[]).map((raw) => {
			if (!raw || typeof raw !== 'object' || Array.isArray(raw))
				throw new ValidationError('Each split part must name its kind and amount.');
			const part = raw as AllocationInput;
			const kind = oneOf(part.kind, 'allocation kind', ['personal', 'custody'] as const);
			const amountMinor = minorAmount(part.amountMinor);
			if (!amountMinor || Math.sign(amountMinor) !== Math.sign(movement.amountCents))
				throw new ValidationError('Every split part must have the movement’s sign and be nonzero.');
			sum = minorAmount(sum + amountMinor, 'split total');
			const category =
				optionalStr(part.category, 'category', { max: MAX_RULE_NAME_LENGTH }) || null;
			const note = optionalStr(part.note, 'note', { max: MAX_NOTE }) || null;
			let commitmentId: number | null = null;
			if (kind === 'custody') {
				commitmentId = num(part.commitmentId, 'commitment', { int: true, min: 1 });
				const commitment = getCommitment(ctx, commitmentId);
				if (!['custody', 'payable'].includes(commitment.kind) || commitment.status !== 'open')
					throw new ValidationError('Choose an open custody or payable commitment.');
				if (!currency || commitment.currency !== currency)
					throw new ValidationError('A custody part and its movement must share a known currency.');
				if (category) throw new ValidationError('Custody is excluded from personal categories.');
				const entry = settlements.get(commitmentId) ?? { amountMinor: 0, notes: [] };
				entry.amountMinor = minorAmount(entry.amountMinor + amountMinor);
				if (note) entry.notes.push(note);
				settlements.set(commitmentId, entry);
			} else if (
				part.commitmentId !== undefined &&
				part.commitmentId !== null &&
				part.commitmentId !== ''
			) {
				throw new ValidationError('Only custody parts may name a commitment.');
			}
			return {
				userId: ctx.userId,
				transactionId: id,
				kind,
				amountMinor,
				category,
				commitmentId,
				note,
				createdAt: stamp(ctx)
			};
		});
		if (sum !== movement.amountCents)
			throw new ValidationError(
				`Split parts must add to ${movement.amountCents} minor units; difference ${minorAmount(movement.amountCents - sum)}.`
			);
		tx.insert(financeTransactionAllocations).values(parts).run();
		for (const [commitmentId, entry] of settlements) {
			const note = entry.notes.join('\n');
			if (note.length > MAX_NOTE)
				throw new ValidationError(
					`The combined note for one stock must be ${MAX_NOTE} characters or fewer.`
				);
			addCommitmentEntry(ctx, {
				commitmentId,
				occurredOn: movement.occurredOn,
				amountMinor: entry.amountMinor,
				transactionId: id,
				note
			});
		}
	});
}

/** Remove parts only after the owner explicitly reverses their stock entries. */
export function unsplitMovement(ctx: Ctx, id: number): void {
	db.transaction((tx) => {
		ownMovement(ctx, id);
		if (
			tx
				.select({ id: financeCommitmentEntries.id })
				.from(financeCommitmentEntries)
				.where(
					and(
						eq(financeCommitmentEntries.userId, ctx.userId),
						eq(financeCommitmentEntries.transactionId, id)
					)
				)
				.get()
		)
			throw new ValidationError('Reverse the linked commitment entry before removing this split.');
		tx.delete(financeTransactionAllocations)
			.where(
				and(
					eq(financeTransactionAllocations.userId, ctx.userId),
					eq(financeTransactionAllocations.transactionId, id)
				)
			)
			.run();
	});
}

/** Retained splits and settlement evidence must not be edited out from underneath a stock. */
function assertMovementUnlinked(ctx: Ctx, id: number): void {
	const allocation = db
		.select({ id: financeTransactionAllocations.id })
		.from(financeTransactionAllocations)
		.where(
			and(
				eq(financeTransactionAllocations.userId, ctx.userId),
				eq(financeTransactionAllocations.transactionId, id)
			)
		)
		.get();
	const entry = db
		.select({ id: financeCommitmentEntries.id })
		.from(financeCommitmentEntries)
		.where(
			and(
				eq(financeCommitmentEntries.userId, ctx.userId),
				eq(financeCommitmentEntries.transactionId, id)
			)
		)
		.get();
	if (allocation || entry)
		throw new ValidationError(
			`Movement ${id} has a split or settlement entry. Reverse linked entries and unsplit first.`
		);
}

/**
 * What a movement can be.
 *
 * `expense` and `income` are also what the sign means when nothing was said,
 * which is why a stored null keeps its own name — *assumed* — in the UI.
 */
export const MOVEMENT_KINDS = ['expense', 'income', 'transfer', 'refund', 'fee', 'cash'] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export type Rule = {
	id: number;
	kind: 'category' | 'tag';
	name: string;
	pattern: string;
	color: string;
	position: number;
	/** How many of this account's lines the rule currently claims. */
	matches: number;
	/**
	 * Why this rule is not being run, when it is not.
	 *
	 * A rule that no longer compiles, or one written before the safety check
	 * existed, is skipped rather than taken as read — and a skipped rule that
	 * says nothing about itself looks exactly like a rule that matches
	 * nothing, which is the one thing somebody debugging a pattern must not
	 * be told by mistake.
	 */
	problem?: string;
};

/** The parsers an import can offer, by key and friendly name. */
export function availableParsers(): { key: string; name: string }[] {
	return BANK_PARSERS.map((p) => ({ key: parserKey(p), name: p.name }));
}

/*
 * A small stable hash for lines the bank gave no id.
 *
 * Not cryptographic and does not need to be: it only has to keep one
 * person's statement lines apart, and the occurrence counter below keeps
 * two identical espressos on the same day from collapsing into one.
 */
function lineHash(input: string): string {
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let i = 0; i < input.length; i++) {
		const c = input.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
		h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
	}
	return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/**
 * Import one export's text into one ledger. Idempotent: the same file twice
 * adds nothing, and the same file into a *different* ledger is a different
 * set of lines, because a ledger is part of what a line is.
 *
 * `flip` negates every amount, for an export whose signs mean the opposite
 * of what the parser expects — a statement kept from the card's point of
 * view, say.
 *
 * `mapping` is for the generic CSV reader, and only for it: which column holds
 * the date, which the description, which the money. Absent, that reader falls
 * back to what it guessed from the header, which is the ordinary case — the
 * mapping arrives when somebody has corrected the guess on the screen.
 */
export function importStatement(
	ctx: Ctx,
	input: {
		ledgerId: unknown;
		source: unknown;
		text: unknown;
		flip?: boolean;
		mapping?: CsvMapping | null;
	}
): { added: number; skipped: number; recordedOnly: boolean } {
	const ledgerId = num(input.ledgerId, 'ledger', { int: true });
	const ledger = getLedger(ctx, ledgerId); // ownership
	const source = str(input.source, 'bank export', { max: 100 });
	const parser = parserFor(source);
	if (!parser) throw new ValidationError({ key: 'errors.statements.noParserKnowsThatExport' });
	const text = str(input.text, 'statement', { max: MAX_STATEMENT_LENGTH, trim: false });

	const options = { strict: true, units: ledger.currency ? minorUnits(ledger.currency) : 100 };
	if (source !== CSV_PARSER_KEY && options.units !== 100)
		throw new ValidationError(
			'This bank export uses two decimal places. Use the original-currency generic CSV format for this ledger.'
		);
	let parsed: ParsedMovement[];
	try {
		parsed =
			source === CSV_PARSER_KEY && input.mapping
				? parseCsv(text, input.mapping, options)
				: parser.parse(text, options);
	} catch (error) {
		if (error instanceof StatementParseError) throw new ValidationError(error.message);
		throw error;
	}
	if (parsed.length > MAX_STATEMENT_LINES)
		throw new ValidationError(
			`That file exceeds ${MAX_STATEMENT_LINES} movements. Nothing was imported.`
		);
	if (parsed.length === 0)
		throw new ValidationError(
			source === CSV_PARSER_KEY
				? 'No line in that file had both a date and an amount in the columns named.'
				: `That does not look like "${parser.name}" — no lines matched.`
		);

	// Two identical lines in one file are two real movements (two espressos,
	// same price, same day): each gets its occurrence number, so they keep
	// distinct fingerprints while a re-import of the same file lands on the
	// same ones and is ignored.
	for (const [index, line] of parsed.entries()) {
		try {
			civilDay(line.occurredOn);
			minorAmount(line.amountCents);
			str(line.description, 'description', { max: Number.MAX_SAFE_INTEGER });
		} catch {
			throw new ValidationError(
				`Line ${line.line ?? index + 1} was rejected: invalid date, amount or description. Nothing was imported.`
			);
		}
	}
	const earliest = parsed.reduce(
		(date, line) => (line.occurredOn < date ? line.occurredOn : date),
		parsed[0].occurredOn
	);

	// Fingerprints retain the parser's historical two-decimal identity even when
	// original-currency precision differs. Replays must not duplicate old history.
	const identities =
		source === CSV_PARSER_KEY && options.units !== 100
			? input.mapping
				? parseCsv(text, input.mapping)
				: parser.parse(text)
			: parsed;
	return db.transaction((tx) => {
		const current = getLedger(ctx, ledgerId);
		if (current.currency !== ledger.currency)
			throw new ValidationError(
				'Ledger currency changed while reading the file. Nothing was imported; retry with the current currency.'
			);
		if (current.openingOn && earliest < current.openingOn)
			throw new ValidationError(
				`The earliest movement, ${earliest}, is before the opening date ${current.openingOn}. Nothing was imported.`
			);
		const seen = new Map<string, number>();
		let added = 0;
		for (const [index, line] of parsed.entries()) {
			const amountCents = input.flip ? -line.amountCents : line.amountCents;
			// A parser reads whatever the file said; the description it returns is
			// still text from outside and is bounded here, where everything else
			// that reaches this column is.
			const description = line.description.slice(0, MAX_DESCRIPTION_LENGTH);
			const base = line.externalId
				? `${source}:${line.externalId}`
				: (() => {
						const identityAmount = input.flip
							? -identities[index].amountCents
							: identities[index].amountCents;
						const content = `${source}|${line.occurredOn}|${identityAmount}|${description}`;
						const n = (seen.get(content) ?? 0) + 1;
						seen.set(content, n);
						return `h:${lineHash(`${content}|${n}`)}`;
					})();
			let inserted;
			try {
				inserted = tx
					.insert(financeTransactions)
					.values({
						userId: ctx.userId,
						ledgerId,
						occurredOn: line.occurredOn,
						amountCents,
						description,
						source,
						externalId: line.externalId ?? null,
						fingerprint: `${ledgerId}|${base}`,
						createdAt: stamp(ctx)
					})
					.onConflictDoNothing({
						target: [financeTransactions.userId, financeTransactions.fingerprint]
					})
					.run();
			} catch {
				throw new ValidationError(
					`Line ${line.line ?? index + 1} was rejected while saving. Nothing was imported.`
				);
			}
			if (inserted.changes > 0) added += 1;
		}
		return { added, skipped: parsed.length - added, recordedOnly: current.openingOn === null };
	});
}

/**
 * One line, recorded by hand or pushed in by a plugin.
 *
 * The same idempotency as an import: a plugin that re-sends a movement it
 * already sent adds nothing, provided it names the same `externalId`.
 */
export function recordMovement(
	ctx: Ctx,
	input: {
		ledgerId: unknown;
		occurredOn: unknown;
		amountCents: unknown;
		description: unknown;
		source?: unknown;
		externalId?: unknown;
	}
): { id: number; added: boolean } {
	const ledgerId = num(input.ledgerId, 'ledger', { int: true });
	getLedger(ctx, ledgerId);
	const occurredOn = civilDay(input.occurredOn);
	const amountCents = minorAmount(input.amountCents);
	const description = str(input.description, 'description', { max: MAX_DESCRIPTION_LENGTH });
	const source = input.source ? str(input.source, 'source', { max: 100 }) : 'manual';
	const externalId = input.externalId ? str(input.externalId, 'external id', { max: 200 }) : null;
	const fingerprint = externalId
		? `${ledgerId}|${source}:${externalId}`
		: `${ledgerId}|h:${lineHash(`${source}|${occurredOn}|${amountCents}|${description}|${stamp(ctx)}`)}`;

	const inserted = db
		.insert(financeTransactions)
		.values({
			userId: ctx.userId,
			ledgerId,
			occurredOn,
			amountCents,
			description,
			source,
			externalId,
			fingerprint,
			createdAt: stamp(ctx)
		})
		.onConflictDoNothing()
		.returning({ id: financeTransactions.id })
		.get();
	if (inserted) return { id: inserted.id, added: true };

	const existing = db
		.select({ id: financeTransactions.id })
		.from(financeTransactions)
		.where(
			and(
				eq(financeTransactions.userId, ctx.userId),
				eq(financeTransactions.fingerprint, fingerprint)
			)
		)
		.get();
	return { id: existing!.id, added: false };
}

export function updateMovement(
	ctx: Ctx,
	id: number,
	input: {
		description?: unknown;
		occurredOn?: unknown;
		amountCents?: unknown;
		ledgerId?: unknown;
		kind?: unknown;
	}
): void {
	db.transaction(() => {
		const current = db
			.select()
			.from(financeTransactions)
			.where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, ctx.userId)))
			.get();
		if (!current) throw new NotFoundError('movement');

		const ledgerId =
			input.ledgerId === undefined || input.ledgerId === null || input.ledgerId === ''
				? current.ledgerId
				: num(input.ledgerId, 'ledger', { int: true });
		if (ledgerId !== current.ledgerId && ledgerId !== null) getLedger(ctx, ledgerId);

		const kind = input.kind === undefined ? current.kind : movementKind(input.kind);
		if (
			(input.amountCents !== undefined &&
				input.amountCents !== '' &&
				minorAmount(input.amountCents) !== current.amountCents) ||
			(input.occurredOn !== undefined &&
				input.occurredOn !== '' &&
				input.occurredOn !== current.occurredOn) ||
			ledgerId !== current.ledgerId ||
			kind !== current.kind
		)
			assertMovementUnlinked(ctx, id);
		// A leg edited out of its pair is how a transfer becomes spending again:
		// the group is undone first, deliberately, and never by an edit.
		if (current.groupId && kind !== 'transfer')
			throw new ValidationError({ key: 'errors.statements.legOfTransferChange' });
		// The amount and the ledger are what the pairing conserved: editing one
		// leg's amount silently breaks the sum the link proved.
		if (
			current.groupId &&
			((input.amountCents !== undefined && input.amountCents !== '') ||
				(input.ledgerId !== undefined && input.ledgerId !== null && input.ledgerId !== ''))
		)
			throw new ValidationError({ key: 'errors.statements.legOfTransferChange' });

		db.update(financeTransactions)
			.set({
				ledgerId,
				kind,
				description:
					input.description === undefined
						? current.description
						: str(input.description, 'description', { max: 500 }),
				occurredOn:
					input.occurredOn === undefined || input.occurredOn === ''
						? current.occurredOn
						: civilDay(input.occurredOn),
				amountCents:
					input.amountCents === undefined || input.amountCents === ''
						? current.amountCents
						: minorAmount(input.amountCents)
			})
			.where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, ctx.userId)))
			.run();
	});
}

/** A kind, or an empty string to clear it. */
function movementKind(value: unknown): MovementKind | null {
	if (value === null || value === '') return null;
	return oneOf(value, 'kind', MOVEMENT_KINDS);
}

/** One movement of this account's, or the same refusal a missing id gets. */
function ownMovement(ctx: Ctx, id: number) {
	const row = db
		.select()
		.from(financeTransactions)
		.where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, ctx.userId)))
		.get();
	if (!row) throw new NotFoundError('movement');
	return row;
}

/**
 * Say what several movements were at once, in one write.
 *
 * The point is a hundred lines in one gesture, not a hundred round trips, so
 * the whole selection is checked first: a single leg of a transfer or an id
 * from another account refuses the batch rather than half-applying it.
 */
export function classifyMovements(
	ctx: Ctx,
	input: { ids: unknown; kind?: unknown }
): { updated: number } {
	return db.transaction(() => {
		const ids = Array.isArray(input.ids)
			? input.ids.map((id) => num(id, 'movement', { int: true }))
			: [num(input.ids, 'movement', { int: true })];
		const kind = movementKind(input.kind);
		if (ids.length === 0) return { updated: 0 };

		const rows = db
			.select({ id: financeTransactions.id, groupId: financeTransactions.groupId })
			.from(financeTransactions)
			.where(and(eq(financeTransactions.userId, ctx.userId), inArray(financeTransactions.id, ids)))
			.all();
		if (rows.length !== new Set(ids).size) throw new NotFoundError('movement');
		if (kind !== 'transfer' && rows.some((r) => r.groupId))
			throw new ValidationError({ key: 'errors.statements.legOfTransferClassify' });
		for (const id of ids) assertMovementUnlinked(ctx, id);

		db.update(financeTransactions)
			.set({ kind })
			.where(and(eq(financeTransactions.userId, ctx.userId), inArray(financeTransactions.id, ids)))
			.run();
		return { updated: ids.length };
	});
}

/**
 * Two lines are one move between my own accounts (D2).
 *
 * A group of one is a *pending counterpart* and is allowed to stand: the
 * destination statement often arrives later. Two legs in the same ledger are
 * refused — they would balance to zero and hide two real expenses — and legs
 * in one currency must add up to nothing, because money that left one place
 * arrived in the other.
 */
export function linkTransfer(
	ctx: Ctx,
	input: { id: unknown; counterpartId: unknown }
): {
	groupId: string;
} {
	const id = num(input.id, 'movement', { int: true });
	const counterpartId = num(input.counterpartId, 'counterpart', { int: true });
	if (id === counterpartId) throw new ValidationError({ key: 'errors.statements.ownCounterpart' });
	const a = ownMovement(ctx, id);
	const b = ownMovement(ctx, counterpartId);
	if (a.groupId || b.groupId)
		throw new ValidationError({ key: 'errors.statements.alreadyTransfer' });
	if (a.parentId !== null || b.parentId !== null)
		throw new ValidationError({ key: 'errors.statements.alreadyChildLink' });
	if (a.ledgerId === null || b.ledgerId === null)
		throw new ValidationError({ key: 'errors.statements.linkNeedsLedger' });
	if (a.ledgerId === b.ledgerId)
		throw new ValidationError({ key: 'errors.statements.sameLedgerTransfer' });

	const ca = ledgerCurrency(ctx, a.ledgerId);
	const cb = ledgerCurrency(ctx, b.ledgerId);
	// An unlabelled ledger is not a different currency: without knowing both,
	// neither the sum check nor the "no combined total" rule can be honoured.
	if (!ca || !cb) throw new ValidationError({ key: 'errors.statements.linkNeedsCurrency' });
	if (ca === cb && a.amountCents + b.amountCents !== 0)
		throw new ValidationError({
			key: 'errors.statements.legsDoNotBalance',
			values: { a: ca, first: a.amountCents, b: cb, second: b.amountCents }
		});
	// Different currencies are allowed and never summed: the two legs stay
	// two amounts, because no rate is known or invented (D6).

	const groupId = `t:${crypto.randomUUID()}`;
	db.transaction((tx) => {
		assertMovementUnlinked(ctx, id);
		assertMovementUnlinked(ctx, counterpartId);
		for (const row of [a, b])
			tx.update(financeTransactions)
				.set({ groupId, kind: 'transfer' })
				.where(and(eq(financeTransactions.id, row.id), eq(financeTransactions.userId, ctx.userId)))
				.run();
	});
	return { groupId };
}

/** Undo a pairing: both legs return to the sign's guess, and the group is gone. */
export function unlinkTransfer(ctx: Ctx, id: number): void {
	const leg = ownMovement(ctx, id);
	if (!leg.groupId) throw new ValidationError({ key: 'errors.statements.notATransfer' });
	const legs = db
		.select({ id: financeTransactions.id })
		.from(financeTransactions)
		.where(
			and(eq(financeTransactions.userId, ctx.userId), eq(financeTransactions.groupId, leg.groupId))
		)
		.all();
	const ids = legs.map((l) => l.id);
	if (ids.length) {
		const refund = db
			.select({ id: financeTransactions.id })
			.from(financeTransactions)
			.where(
				and(eq(financeTransactions.userId, ctx.userId), inArray(financeTransactions.parentId, ids))
			)
			.get();
		if (refund)
			throw new ValidationError({
				key: 'errors.statements.refundOnLeg',
				values: { id: refund.id }
			});
	}
	db.update(financeTransactions)
		.set({ groupId: null, kind: null })
		.where(
			and(eq(financeTransactions.userId, ctx.userId), eq(financeTransactions.groupId, leg.groupId))
		)
		.run();
}

/**
 * Attach a line to the one it belongs to (D8).
 *
 * A refund reverses one expense and a fee belongs to the payment it was
 * charged on. One parent only: a credit returned against two expenses is two
 * credits. The currencies must match — the ledgers may differ, the money may
 * not — because netting unlike money is arithmetic, not reconciliation.
 */
export function linkMovement(
	ctx: Ctx,
	input: { id: unknown; parentId: unknown; relation: 'refund' | 'fee' }
): void {
	const kind = input.relation;
	linkChild(ctx, { id: input.id, parentId: input.parentId }, kind);
}

function linkChild(ctx: Ctx, input: { id: unknown; parentId: unknown }, kind: 'refund' | 'fee') {
	const id = num(input.id, 'movement', { int: true });
	const parentId = num(input.parentId, 'parent', { int: true });
	if (id === parentId) throw new ValidationError({ key: 'errors.statements.ownParent' });
	const child = ownMovement(ctx, id);
	const parent = ownMovement(ctx, parentId);
	if (child.groupId) throw new ValidationError({ key: 'errors.statements.legCannotBeChild' });
	if (child.parentId !== null && child.parentId !== parentId)
		throw new ValidationError({
			key: kind === 'refund' ? 'errors.statements.alreadyRefund' : 'errors.statements.alreadyChild',
			values: { id: child.parentId }
		});
	if (child.ledgerId === null || parent.ledgerId === null)
		throw new ValidationError({ key: 'errors.statements.linkNeedsLedger' });
	const cc = ledgerCurrency(ctx, child.ledgerId);
	const pc = ledgerCurrency(ctx, parent.ledgerId);
	if (!cc || !pc) throw new ValidationError({ key: 'errors.statements.linkNeedsCurrency' });
	if (cc !== pc)
		throw new ValidationError({
			key: 'errors.statements.unlikeCurrencies',
			values: { a: cc, b: pc }
		});

	db.transaction((tx) => {
		assertMovementUnlinked(ctx, id);
		tx.update(financeTransactions)
			.set({ kind, parentId })
			.where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, ctx.userId)))
			.run();
	});
}

/** The ledger's currency, or null while it has none. */
function ledgerCurrency(ctx: Ctx, ledgerId: number): string | null {
	const row = db
		.select({ currency: ledgers.currency })
		.from(ledgers)
		.where(and(eq(ledgers.id, ledgerId), eq(ledgers.userId, ctx.userId)))
		.get();
	return row?.currency ?? null;
}

/** Undo a refund or fee link: the line stands alone again, back to the sign's guess. */
export function detachMovement(ctx: Ctx, id: number): void {
	db.transaction(() => {
		ownMovement(ctx, id);
		assertMovementUnlinked(ctx, id);
		db.update(financeTransactions)
			.set({ parentId: null, kind: null })
			.where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, ctx.userId)))
			.run();
	});
}

/** One movement as stored, or null — how an id somebody named is resolved. */
export function getMovementRow(ctx: Ctx, id: number) {
	const row =
		db
			.select()
			.from(financeTransactions)
			.where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, ctx.userId)))
			.get() ?? null;
	return row ? { ...row, allocations: allocationsFor(ctx, id) } : null;
}

function allocationsFor(ctx: Ctx, id: number): MovementAllocation[] {
	return db
		.select()
		.from(financeTransactionAllocations)
		.where(
			and(
				eq(financeTransactionAllocations.userId, ctx.userId),
				eq(financeTransactionAllocations.transactionId, id)
			)
		)
		.orderBy(financeTransactionAllocations.id)
		.all();
}

/** Every movement as stored, or only those in some ledgers — what a key tied to a notebook reaches. */
export function listMovementRows(ctx: Ctx, opts: { ledgerIds?: number[] } = {}) {
	if (opts.ledgerIds?.length === 0) return [];
	return db
		.select()
		.from(financeTransactions)
		.where(
			and(
				eq(financeTransactions.userId, ctx.userId),
				opts.ledgerIds ? inArray(financeTransactions.ledgerId, opts.ledgerIds) : undefined
			)
		)
		.all();
}

/**
 * Gone.
 *
 * A leg of a transfer is refused while the group stands: deleting one leg is
 * how a pair becomes a single line that still calls itself a transfer (D2).
 * Anything that pointed at the line is unlinked first, so a refund survives
 * its parent as an unmatched credit rather than disappearing with it.
 */
export function deleteMovement(ctx: Ctx, id: number): void {
	db.transaction(() => {
		const row = ownMovement(ctx, id);
		assertMovementUnlinked(ctx, id);
		if (row.groupId) {
			const group = db
				.select({ id: financeTransactions.id })
				.from(financeTransactions)
				.where(
					and(
						eq(financeTransactions.userId, ctx.userId),
						eq(financeTransactions.groupId, row.groupId),
						ne(financeTransactions.id, id)
					)
				)
				.get();
			if (group)
				throw new ValidationError({
					key: 'errors.statements.legOfTransferDelete',
					values: { id: group.id }
				});
		}
		db.transaction((tx) => {
			tx.update(financeTransactions)
				.set({ parentId: null })
				.where(
					and(eq(financeTransactions.userId, ctx.userId), eq(financeTransactions.parentId, id))
				)
				.run();
			const gone = tx
				.delete(financeTransactions)
				.where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, ctx.userId)))
				.run();
			if (gone.changes === 0) throw new NotFoundError('movement');
		});
	});
}

// ── Rules ────────────────────────────────────────────────────────────────────

function compiled(rule: { pattern: string }): RegExp | null {
	// Checked again on the way out, not only on the way in: a row written
	// before this check existed, or by anything that reaches the table
	// directly, must not run either.
	if (unsafePattern(rule.pattern)) return null;
	try {
		return new RegExp(rule.pattern, 'i');
	} catch {
		// A rule that stopped compiling is skipped rather than taking the
		// whole list down with it.
		return null;
	}
}

/** What stops a stored pattern being run, said for whoever wrote it. */
function whyNotRun(pattern: string): string | undefined {
	const unsafe = unsafePattern(pattern);
	if (unsafe) return unsafe;
	try {
		new RegExp(pattern, 'i');
	} catch (e) {
		return `That pattern is not a valid expression: ${(e as Error).message}`;
	}
	return undefined;
}

function rawRules(ctx: Ctx) {
	return db
		.select()
		.from(financeRules)
		.where(eq(financeRules.userId, ctx.userId))
		.orderBy(financeRules.position, financeRules.id)
		.all();
}

export function listRules(ctx: Ctx): Rule[] {
	const rules = rawRules(ctx);
	const descriptions = db
		.select({ description: financeTransactions.description })
		.from(financeTransactions)
		.where(eq(financeTransactions.userId, ctx.userId))
		.all()
		.map((r) => r.description);

	// What each rule actually claims, which is the number that tells somebody
	// whether their regular expression says what they meant.
	const sorted = descriptions.map((d) => sortDescription(rules, d));
	return rules.map((r) => ({
		id: r.id,
		kind: r.kind as Rule['kind'],
		name: r.name,
		pattern: r.pattern,
		color: r.color,
		position: r.position,
		matches:
			r.kind === 'category'
				? sorted.filter((s) => s.category === r.name).length
				: sorted.filter((s) => s.tags.some((t) => t.name === r.name)).length,
		problem: whyNotRun(r.pattern)
	}));
}

function ruleFields(input: { kind?: unknown; name?: unknown; pattern?: unknown; color?: unknown }) {
	const pattern = str(input.pattern, 'pattern', { max: MAX_PATTERN_LENGTH });
	try {
		new RegExp(pattern, 'i');
	} catch (e) {
		// The engine's own complaint, which names the position — far more use
		// than "invalid" when a bracket is unclosed thirty characters in.
		throw new ValidationError(`That pattern is not a valid expression: ${(e as Error).message}`);
	}
	// Valid is not the same as safe: the engine compiles `(a+)+$` happily and
	// then takes for ever on a line that nearly matches, with nothing able to
	// interrupt it. Refused here rather than discovered in production.
	const unsafe = unsafePattern(pattern);
	if (unsafe) throw new ValidationError(unsafe);
	return {
		kind: oneOf(input.kind, 'kind', ['category', 'tag'] as const),
		name: str(input.name, 'name', { max: MAX_RULE_NAME_LENGTH }),
		pattern,
		color:
			input.color === undefined || input.color === null || input.color === ''
				? undefined
				: str(input.color, 'colour', { max: 9, pattern: /^#[0-9a-fA-F]{6}$/ })
	};
}

export function createRule(
	ctx: Ctx,
	input: { kind?: unknown; name?: unknown; pattern?: unknown; color?: unknown }
): Rule {
	const f = ruleFields(input);
	const siblings = rawRules(ctx).filter((r) => r.kind === f.kind);
	const inserted = db
		.insert(financeRules)
		.values({
			userId: ctx.userId,
			kind: f.kind,
			name: f.name,
			pattern: f.pattern,
			color: f.color ?? RULE_PALETTE[siblings.length % RULE_PALETTE.length],
			position: siblings.length,
			createdAt: stamp(ctx)
		})
		.returning({ id: financeRules.id })
		.get();
	return listRules(ctx).find((r) => r.id === inserted.id)!;
}

export function updateRule(
	ctx: Ctx,
	id: number,
	input: { kind?: unknown; name?: unknown; pattern?: unknown; color?: unknown }
): Rule {
	const found = listRules(ctx).find((r) => r.id === id);
	if (!found) throw new NotFoundError('rule');
	const f = ruleFields({
		kind: input.kind ?? found.kind,
		name: input.name ?? found.name,
		pattern: input.pattern ?? found.pattern,
		color: input.color ?? found.color
	});
	db.update(financeRules)
		.set({ kind: f.kind, name: f.name, pattern: f.pattern, color: f.color ?? found.color })
		.where(and(eq(financeRules.id, id), eq(financeRules.userId, ctx.userId)))
		.run();
	return listRules(ctx).find((r) => r.id === id)!;
}

/**
 * Move a rule within its kind. A move is a reinsertion and every sibling is
 * resequenced around it, so two rules can never share a position and "up"
 * always actually moves.
 */
export function moveRule(ctx: Ctx, id: number, delta: number): void {
	const found = rawRules(ctx).find((r) => r.id === id);
	if (!found) throw new NotFoundError('rule');
	const from = rawRules(ctx)
		.filter((r) => r.kind === found.kind)
		.findIndex((r) => r.id === id);
	placeRule(ctx, id, from + delta);
}

/**
 * Put a rule at a place among the rules of its kind, counting from 0 — the
 * order `listRules` gives them, which for categories is the order they win in.
 * A place past either end is the end.
 */
export function placeRule(ctx: Ctx, id: number, position: number): void {
	const found = rawRules(ctx).find((r) => r.id === id);
	if (!found) throw new NotFoundError('rule');
	const siblings = rawRules(ctx).filter((r) => r.kind === found.kind);
	const from = siblings.findIndex((r) => r.id === id);
	const to = Math.min(Math.max(Math.trunc(position), 0), siblings.length - 1);
	if (to === from) return;
	const [moved] = siblings.splice(from, 1);
	siblings.splice(to, 0, moved);
	siblings.forEach((r, index) => {
		db.update(financeRules)
			.set({ position: index })
			.where(and(eq(financeRules.id, r.id), eq(financeRules.userId, ctx.userId)))
			.run();
	});
}

export function deleteRule(ctx: Ctx, id: number): void {
	const gone = db
		.delete(financeRules)
		.where(and(eq(financeRules.id, id), eq(financeRules.userId, ctx.userId)))
		.run();
	if (gone.changes === 0) throw new NotFoundError('rule');
}

type RawRule = { kind: string; name: string; pattern: string; color: string };

/**
 * Sort one description: the first matching category (the partition), every
 * matching tag (the lenses).
 */
function sortDescription(
	rules: RawRule[],
	description: string
): {
	category: string | null;
	categoryColor: string | null;
	tags: { name: string; color: string }[];
} {
	let category: string | null = null;
	let categoryColor: string | null = null;
	const tags: { name: string; color: string }[] = [];
	for (const rule of rules) {
		const re = compiled(rule);
		if (!re || !re.test(description)) continue;
		if (rule.kind === 'category') {
			if (category === null) {
				category = rule.name;
				categoryColor = rule.color;
			}
		} else {
			tags.push({ name: rule.name, color: rule.color });
		}
	}
	return { category, categoryColor, tags };
}

/** What a description would be filed as, for anything that needs to ask. */
export function sortByRules(ctx: Ctx, description: string) {
	return sortDescription(rawRules(ctx), description);
}

// ── Reading ──────────────────────────────────────────────────────────────────

export type MovementFilter = {
	ledgerId?: number | null;
	/** Omitted means separate original currencies; null selects unspecified. */
	currency?: string | null;
	unclassified?: boolean;
	/** 'YYYY-MM', or an inclusive civil-date range through `from`/`to`. */
	month?: string;
	from?: string;
	to?: string;
	category?: string;
	tag?: string;
	/** Free text, matched against the description. */
	query?: string;
	direction?: 'in' | 'out';
	limit?: number;
};

export function listMovements(ctx: Ctx, filter: MovementFilter = {}): Movement[] {
	const rules = rawRules(ctx);
	const names = new Map(
		db
			.select({ id: ledgers.id, name: ledgers.name })
			.from(ledgers)
			.where(eq(ledgers.userId, ctx.userId))
			.all()
			.map((l) => [l.id, l.name])
	);

	const where = [eq(financeTransactions.userId, ctx.userId)];
	if (filter.ledgerId) where.push(eq(financeTransactions.ledgerId, filter.ledgerId));
	if (filter.from) where.push(gte(financeTransactions.occurredOn, civilDay(filter.from)));
	if (filter.to) where.push(sql`${financeTransactions.occurredOn} <= ${civilDay(filter.to)}`);
	if (filter.month) civilDay(`${filter.month}-01`, 'month');
	if (filter.unclassified) where.push(sql`${financeTransactions.kind} is null`);
	if (filter.currency !== undefined) {
		const currency = filter.currency === null ? null : normaliseCurrency(filter.currency);
		if (filter.currency !== null && !currency)
			throw new ValidationError('Choose a valid original currency.');
		where.push(
			sql`(select l.currency from ledgers l where l.id = ${financeTransactions.ledgerId} and l.user_id = ${ctx.userId}) is ${currency}`
		);
	}

	const rows = db
		.select({
			...getTableColumns(financeTransactions),
			/** One entry per line at most: a split or a settlement writes it. */
			commitmentEntryId: sql<number | null>`(
				select e.id from finance_commitment_entries e
				where e.user_id = ${ctx.userId} and e.transaction_id = ${financeTransactions.id}
				limit 1
			)`
		})
		.from(financeTransactions)
		.where(and(...where))
		.orderBy(desc(financeTransactions.occurredOn), desc(financeTransactions.id))
		.all();

	const text = filter.query?.trim().toLowerCase();
	const allocations = new Map<number, MovementAllocation[]>();
	if (rows.length)
		for (const part of db
			.select()
			.from(financeTransactionAllocations)
			.where(eq(financeTransactionAllocations.userId, ctx.userId))
			.orderBy(financeTransactionAllocations.id)
			.all()) {
			const parts = allocations.get(part.transactionId) ?? [];
			parts.push(part);
			allocations.set(part.transactionId, parts);
		}
	// How many legs each group has — counted over the account, not the page,
	// so a filtered list still knows a counterpart exists. Accounts with no
	// transfers pay nothing for this.
	const groupSize = new Map<string, number>();
	if (rows.some((r) => r.groupId))
		for (const r of db
			.select({ groupId: financeTransactions.groupId, id: financeTransactions.id })
			.from(financeTransactions)
			.where(
				and(eq(financeTransactions.userId, ctx.userId), isNotNull(financeTransactions.groupId))
			)
			.all())
			groupSize.set(r.groupId!, (groupSize.get(r.groupId!) ?? 0) + 1);
	const movements = rows
		.filter((r) => !filter.month || r.occurredOn.startsWith(filter.month))
		.filter((r) => !filter.to || r.occurredOn <= filter.to)
		.filter((r) => !text || r.description.toLowerCase().includes(text))
		.filter((r) =>
			filter.direction === 'in'
				? r.amountCents > 0
				: filter.direction === 'out'
					? r.amountCents < 0
					: true
		)
		.map((r) => {
			const sorted = sortDescription(rules, r.description);
			const parts = allocations.get(r.id) ?? [];
			// A splinter's own category is what Insights counts, so the list and
			// the "uncategorized" count use it too rather than showing the line
			// as unsorted on two screens and sorted on a third.
			const override =
				parts.find((part) => part.kind === 'personal' && part.category)?.category ?? null;
			const categoryColor = override
				? (rules.find((rule) => rule.kind === 'category' && rule.name === override)?.color ?? null)
				: sorted.categoryColor;
			return {
				id: r.id,
				ledgerId: r.ledgerId,
				ledgerName: r.ledgerId === null ? null : (names.get(r.ledgerId) ?? null),
				occurredOn: r.occurredOn,
				amountCents: r.amountCents,
				description: r.description,
				source: r.source,
				kind: (r.kind as MovementKind | null) ?? null,
				groupId: r.groupId,
				// A line marked as a transfer has no group until it is paired, and
				// that is exactly the state the screen must name.
				counterpartPending:
					r.kind === 'transfer' && (r.groupId === null || (groupSize.get(r.groupId) ?? 0) < 2),
				parentId: r.parentId,
				category: override ?? sorted.category,
				categoryColor,
				tags: sorted.tags,
				allocations: parts,
				commitmentEntryId: r.commitmentEntryId
			};
		})
		.filter((m) => !filter.category || (m.category ?? UNCATEGORIZED) === filter.category)
		.filter((m) => !filter.tag || m.tags.some((t) => t.name === filter.tag))
		.slice(0, filter.limit ?? 1000);

	return movements;
}

/** A line a meaning can point at: a transfer's other side, a refund's expense. */
export type LinkCandidate = {
	id: number;
	ledgerId: number | null;
	occurredOn: string;
	amountCents: number;
	description: string;
	groupId: string | null;
};

/**
 * The few recent lines one meaning can be linked to.
 *
 * Deliberately not `listMovements`: that loads the whole history and runs
 * every sorting rule over each row, which a picker of the last hundred lines
 * has no use for and would pay for on every page load.
 */
export function recentForLinking(ctx: Ctx, limit = 100): LinkCandidate[] {
	return db
		.select({
			id: financeTransactions.id,
			ledgerId: financeTransactions.ledgerId,
			occurredOn: financeTransactions.occurredOn,
			amountCents: financeTransactions.amountCents,
			description: financeTransactions.description,
			groupId: financeTransactions.groupId
		})
		.from(financeTransactions)
		.where(and(eq(financeTransactions.userId, ctx.userId), isNotNull(financeTransactions.ledgerId)))
		.orderBy(desc(financeTransactions.occurredOn), desc(financeTransactions.id))
		.limit(Math.min(Math.max(Math.trunc(limit) || 100, 1), 500))
		.all();
}

/** How many lines no category rule claims — the number that says "more rules". */
export function uncategorizedCount(ctx: Ctx, filter: MovementFilter = {}): number {
	return listMovements(ctx, { ...filter, limit: 100_000 }).filter(
		(m) => m.category === null && m.amountCents < 0
	).length;
}

/** 'YYYY-MM' keys ending at the month `now` is in. */
export function monthKeys(now: Date, months: number): string[] {
	const keys: string[] = [];
	const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	for (let i = 0; i < months; i++) {
		keys.unshift(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
		cursor.setUTCMonth(cursor.getUTCMonth() - 1);
	}
	return keys;
}

/** One inclusive window for every finance series, in the account's civil month. */
export function statementWindow(ctx: Ctx, months = DEFAULT_MONTHS, filter: MovementFilter = {}) {
	num(months, 'months', { int: true, min: 1, max: 120 });
	const endOfMonth = (month: string) => {
		const date = new Date(`${civilDay(`${month}-01`)}T12:00:00Z`);
		date.setUTCMonth(date.getUTCMonth() + 1);
		date.setUTCDate(0);
		return date.toISOString().slice(0, 10);
	};
	const last = filter.month
		? endOfMonth(filter.month)
		: filter.to
			? civilDay(filter.to, 'last day')
			: endOfMonth(localDateOf(ctx.now, ctx.tz).slice(0, 7));
	const from = filter.month
		? civilDay(`${filter.month}-01`)
		: filter.from
			? civilDay(filter.from, 'first day')
			: `${monthKeys(new Date(`${last}T12:00:00Z`), months)[0]}-01`;
	const to = filter.to ? civilDay(filter.to, 'last day') : last;
	if (from > to) throw new ValidationError('The first day must not be after the last day.');
	const keys: string[] = [];
	const cursor = new Date(`${from.slice(0, 7)}-01T12:00:00Z`);
	while (cursor.toISOString().slice(0, 7) <= to.slice(0, 7)) {
		keys.push(cursor.toISOString().slice(0, 7));
		if (keys.length > 120) throw new ValidationError('Choose at most 120 months.');
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}
	return { from, to, months: keys };
}

export type CategorySlice = { name: string; color: string; outCents: number; share: number };

/**
 * Personal spending by category over a window — the pie, and the table beside it.
 * Expenses and fees count, net of refunds, and only the personal part of a split
 * line. Transfers, cash withdrawals and custody shares stay out; a month whose
 * refunds outweigh its spending has no slice rather than a negative one.
 */
export function categorySlices(ctx: Ctx, filter: MovementFilter = {}): CategorySlice[] {
	const window = statementWindow(ctx, DEFAULT_MONTHS, filter);
	const bounded = { ...filter, from: window.from, to: window.to };
	assertSingleCurrency(ctx, bounded);
	const out = personalSpending(ctx, bounded);
	const totals = new Map<string, { cents: number; color: string }>();
	for (const m of out) {
		const name = m.category ?? UNCATEGORIZED;
		const held = totals.get(name) ?? { cents: 0, color: m.categoryColor ?? '#94a3b8' };
		held.cents = minorAmount(held.cents + m.spentMinor, 'category total');
		totals.set(name, held);
	}
	// A refund-only category nets below zero. A ring has no arc for that: the
	// month simply has no spending in it.
	const outgoing = [...totals.entries()].filter(([, total]) => total.cents > 0);
	const sum = outgoing.reduce((n, [, total]) => n + total.cents, 0) || 1;
	return outgoing
		.map(([name, t]) => ({ name, color: t.color, outCents: t.cents, share: t.cents / sum }))
		.sort((a, b) => b.outCents - a.outCents);
}

/**
 * Personal spending per line, description and category, aggregated before the
 * rules describe it. Expenses and fees count only when signed out; a refund
 * counts only when signed in. A kind that contradicts its own sign is left out
 * rather than counted backwards.
 */
function personalSpending(ctx: Ctx, filter: MovementFilter = {}) {
	const where = movementWhere(ctx, filter);
	const rows = db.all<{
		month: string;
		currency: string | null;
		description: string;
		categoryDescription: string;
		categoryOverride: string | null;
		grossMinor: number;
		refundMinor: number;
	}>(sql`
		select substr(t.occurred_on, 1, 7) as month, l.currency, t.description,
			case when t.kind = 'refund' then coalesce(p.description, t.description) else t.description end as categoryDescription,
			case when t.kind = 'refund' then coalesce(
				(select pa.category from finance_transaction_allocations pa
				 where pa.transaction_id = p.id and pa.user_id = ${ctx.userId}
				 and pa.kind = 'personal' and pa.category is not null order by pa.id limit 1), a.category)
			else a.category end as categoryOverride,
			sum(case when t.amount_cents < 0 then -case when a.id is null then t.amount_cents else a.amount_minor end else 0 end) as grossMinor,
			sum(case when t.kind = 'refund' then case when a.id is null then t.amount_cents else a.amount_minor end else 0 end) as refundMinor
		from finance_transactions t
		left join ledgers l on l.id = t.ledger_id and l.user_id = ${ctx.userId}
		left join finance_transaction_allocations a on a.transaction_id = t.id and a.user_id = ${ctx.userId}
		left join finance_transactions p on p.id = t.parent_id and p.user_id = ${ctx.userId}
		where ${sql.join(where, sql` and `)}
			and (
				(t.amount_cents < 0 and coalesce(t.kind, 'expense') in ('expense', 'fee'))
				or (t.kind = 'refund' and t.amount_cents > 0)
			)
			and (a.id is null or a.kind = 'personal')
		group by substr(t.occurred_on, 1, 7), l.currency, t.description, categoryDescription, categoryOverride
	`);
	const rules = rawRules(ctx);
	const query = filter.query?.trim().toLowerCase();
	return rows
		.filter((row) => !query || row.description.toLowerCase().includes(query))
		.map((row) => {
			const sorted = sortDescription(rules, row.categoryDescription);
			const tags = sortDescription(rules, row.description).tags;
			return {
				month: row.month,
				currency: row.currency,
				category: row.categoryOverride ?? sorted.category,
				categoryColor: row.categoryOverride
					? (rules.find((rule) => rule.kind === 'category' && rule.name === row.categoryOverride)
							?.color ?? null)
					: sorted.categoryColor,
				tags,
				grossMinor: minorAmount(row.grossMinor, 'gross expenses'),
				refundMinor: minorAmount(row.refundMinor, 'refunds'),
				spentMinor: minorAmount(row.grossMinor - row.refundMinor, 'spending total')
			};
		})
		.filter((row) => !filter.category || (row.category ?? UNCATEGORIZED) === filter.category)
		.filter((row) => !filter.tag || row.tags.some((tag) => tag.name === filter.tag));
}

/** Shared SQL boundary: original currencies and inclusive dates, never preference currency. */
function movementWhere(ctx: Ctx, filter: MovementFilter) {
	const where = [sql`t.user_id = ${ctx.userId}`];
	if (filter.ledgerId)
		where.push(sql`t.ledger_id = ${num(filter.ledgerId, 'ledger', { int: true, min: 1 })}`);
	if (filter.from) where.push(sql`t.occurred_on >= ${civilDay(filter.from, 'first day')}`);
	if (filter.to) where.push(sql`t.occurred_on <= ${civilDay(filter.to, 'last day')}`);
	if (filter.from && filter.to && filter.from > filter.to)
		throw new ValidationError('The first day must not be after the last day.');
	if (filter.month) {
		civilDay(`${filter.month}-01`, 'month');
		where.push(sql`substr(t.occurred_on, 1, 7) = ${filter.month}`);
	}
	if (filter.currency === null) where.push(sql`l.currency is null`);
	else if (filter.currency !== undefined) {
		const currency = normaliseCurrency(filter.currency);
		if (!currency) throw new ValidationError('Choose a valid original currency.');
		where.push(sql`l.currency = ${currency}`);
	}
	if (filter.unclassified) where.push(sql`t.kind is null`);
	if (filter.direction === 'in') where.push(sql`t.amount_cents > 0`);
	if (filter.direction === 'out') where.push(sql`t.amount_cents < 0`);
	if (filter.query?.trim())
		where.push(sql`instr(lower(t.description), ${filter.query.trim().toLowerCase()}) > 0`);
	return where;
}

/** A split replaces, never adds to, the movement's personal share. */
function personalAmount(ctx: Ctx) {
	return sql`case when exists (select 1 from finance_transaction_allocations a
		where a.transaction_id = t.id and a.user_id = ${ctx.userId})
		then coalesce((select sum(a.amount_minor) from finance_transaction_allocations a
		where a.transaction_id = t.id and a.user_id = ${ctx.userId} and a.kind = 'personal'), 0)
		else t.amount_cents end`;
}

function assertSingleCurrency(ctx: Ctx, filter: MovementFilter) {
	const currencies = db.all<{ currency: string | null }>(sql`
		select distinct l.currency from finance_transactions t
		left join ledgers l on l.id = t.ledger_id and l.user_id = ${ctx.userId}
		where ${sql.join(movementWhere(ctx, filter), sql` and `)} limit 2
	`);
	if (currencies.length > 1)
		throw new ValidationError('Choose one original currency; unlike money cannot be combined.');
}

export type SpendingCategory = {
	name: string;
	color: string;
	grossMinor: number;
	refundMinor: number;
	netMinor: number;
};
export type Spending = {
	currency: string | null;
	grossMinor: number;
	refundMinor: number;
	netMinor: number;
	incomeMinor: number;
	movementCount: number;
	unclassifiedCount: number;
	transferCount: number;
	transferInMinor: number;
	transferOutMinor: number;
	cashCount: number;
	cashMinor: number;
	custodyCount: number;
	custodyMinor: number;
	unmatchedRefundCount: number;
	byCategory: SpendingCategory[];
};

/** Personal consumption and its exclusions, grouped by original currency without a row cap. */
export function spending(ctx: Ctx, filter: MovementFilter = {}): Spending[] {
	const personal = personalAmount(ctx);
	const totals = db.all<
		Omit<Spending, 'grossMinor' | 'refundMinor' | 'netMinor' | 'byCategory'>
	>(sql`
		select l.currency, count(*) as movementCount,
			sum(case when t.kind is null then 1 else 0 end) as unclassifiedCount,
			sum(case when t.amount_cents > 0 and coalesce(t.kind, 'income') = 'income' then ${personal} else 0 end) as incomeMinor,
			sum(case when t.kind = 'transfer' then 1 else 0 end) as transferCount,
			sum(case when t.kind = 'transfer' and t.amount_cents > 0 then t.amount_cents else 0 end) as transferInMinor,
			sum(case when t.kind = 'transfer' and t.amount_cents < 0 then -t.amount_cents else 0 end) as transferOutMinor,
			sum(case when t.kind = 'cash' then 1 else 0 end) as cashCount,
			sum(case when t.kind = 'cash' then abs(t.amount_cents) else 0 end) as cashMinor,
			sum(case when t.amount_cents != ${personal} then 1 else 0 end) as custodyCount,
			sum(abs(t.amount_cents - ${personal})) as custodyMinor,
			sum(case when t.kind = 'refund' and t.amount_cents > 0 and p.id is null then 1 else 0 end) as unmatchedRefundCount
		from finance_transactions t
		left join ledgers l on l.id = t.ledger_id and l.user_id = ${ctx.userId}
		left join finance_transactions p on p.id = t.parent_id and p.user_id = ${ctx.userId}
		where ${sql.join(movementWhere(ctx, filter), sql` and `)}
		group by l.currency order by l.currency
	`);
	const parts = personalSpending(ctx, filter);
	return totals.map((row) => {
		for (const [key, value] of Object.entries(row)) if (key !== 'currency') minorAmount(value, key);
		const categories = new Map<string, SpendingCategory>();
		for (const part of parts.filter((part) => part.currency === row.currency)) {
			const name = part.category ?? UNCATEGORIZED;
			const category = categories.get(name) ?? {
				name,
				color: part.categoryColor ?? '#94a3b8',
				grossMinor: 0,
				refundMinor: 0,
				netMinor: 0
			};
			category.grossMinor = minorAmount(category.grossMinor + part.grossMinor);
			category.refundMinor = minorAmount(category.refundMinor + part.refundMinor);
			category.netMinor = minorAmount(category.grossMinor - category.refundMinor);
			categories.set(name, category);
		}
		const byCategory = [...categories.values()].sort(
			(a, b) => b.netMinor - a.netMinor || a.name.localeCompare(b.name)
		);
		const grossMinor = byCategory.reduce(
			(sum, category) => minorAmount(sum + category.grossMinor),
			0
		);
		const refundMinor = byCategory.reduce(
			(sum, category) => minorAmount(sum + category.refundMinor),
			0
		);
		return {
			...row,
			byCategory,
			grossMinor,
			refundMinor,
			netMinor: minorAmount(grossMinor - refundMinor)
		};
	});
}

export type StatementMonth = {
	month: string;
	inCents: number;
	outCents: number;
	netCents: number;
};

/**
 * In, out and net, month by month.
 *
 * This is cash flow as the bank shows it: a linked refund arrived, so it is
 * money in. Personal spending — `categorySlices`, `categoryMonths` — nets that
 * refund against the expense it reverses and leaves transfers, cash and custody
 * shares out, so the two totals are not meant to match.
 */
export function monthlyTotals(
	ctx: Ctx,
	months = DEFAULT_MONTHS,
	filter: MovementFilter = {}
): StatementMonth[] {
	const window = statementWindow(ctx, months, filter);
	const keys = window.months;
	const bounded = { ...filter, from: window.from, to: window.to };
	assertSingleCurrency(ctx, bounded);
	const description = filter.category || filter.tag ? sql`t.description` : sql`''`;
	const rules = filter.category || filter.tag ? rawRules(ctx) : [];
	const rows = db
		.all<{ month: string; description: string; inCents: number; outCents: number }>(
			sql`
		select substr(t.occurred_on, 1, 7) as month, ${description} as description,
			sum(case when t.amount_cents > 0 then t.amount_cents else 0 end) as inCents,
			sum(case when t.amount_cents < 0 then -t.amount_cents else 0 end) as outCents
		from finance_transactions t
		left join ledgers l on l.id = t.ledger_id and l.user_id = ${ctx.userId}
		where ${sql.join(movementWhere(ctx, bounded), sql` and `)}
		group by substr(t.occurred_on, 1, 7), ${description}
	`
		)
		.filter((row) => {
			const sorted = sortDescription(rules, row.description);
			return (
				(!filter.category || (sorted.category ?? UNCATEGORIZED) === filter.category) &&
				(!filter.tag || sorted.tags.some((tag) => tag.name === filter.tag))
			);
		});
	return keys.map((month) => {
		const mine = rows.filter((r) => r.month === month);
		const inCents = mine.reduce((n, r) => minorAmount(n + r.inCents, 'cash in'), 0);
		const outCents = mine.reduce((n, r) => minorAmount(n + r.outCents, 'cash out'), 0);
		return { month, inCents, outCents, netCents: minorAmount(inCents - outCents, 'cash flow') };
	});
}

export type CategoryMonths = {
	months: string[];
	categories: { name: string; color: string; byMonth: number[]; totalCents: number }[];
};

/** Each category's spending across the months — the stacked bars on Insights. */
export function categoryMonths(
	ctx: Ctx,
	months = DEFAULT_MONTHS,
	filter: MovementFilter = {}
): CategoryMonths {
	const window = statementWindow(ctx, months, filter);
	const keys = window.months;
	assertSingleCurrency(ctx, { ...filter, from: window.from, to: window.to });
	const personalRows = personalSpending(ctx, {
		...filter,
		from: window.from,
		to: window.to
	});
	const names = new Map<string, string>();
	for (const r of personalRows)
		names.set(r.category ?? UNCATEGORIZED, r.categoryColor ?? '#94a3b8');

	return {
		months: keys,
		categories: [...names.entries()]
			.map(([name, color]) => {
				const byMonth = keys.map((month) =>
					personalRows
						.filter((r) => (r.category ?? UNCATEGORIZED) === name && r.month === month)
						.reduce((n, r) => minorAmount(n + r.spentMinor, 'category month'), 0)
				);
				return { name, color, byMonth, totalCents: byMonth.reduce((n, c) => n + c, 0) };
			})
			.sort((a, b) => b.totalCents - a.totalCents)
	};
}

export type TagMonths = {
	name: string;
	color: string;
	months: string[];
	byMonth: number[];
	totalCents: number;
	/** The mean over the months that had any — an average of real months. */
	averageCents: number;
	/** How many of the window's months had any of it at all. */
	activeMonths: number;
};

/**
 * What one tag costs, month by month, with its average.
 *
 * A tag is a lens and tags overlap, so this is deliberately one tag at a
 * time: summing several would count a line that carries two of them twice,
 * and a chart that lies is worse than a chart that answers one question.
 */
export function tagMonths(
	ctx: Ctx,
	tag: string,
	months = DEFAULT_MONTHS,
	filter: MovementFilter = {}
): TagMonths {
	const window = statementWindow(ctx, months, filter);
	const keys = window.months;
	assertSingleCurrency(ctx, { ...filter, from: window.from, to: window.to });
	const rules = rawRules(ctx);
	const colour = rules.find((r) => r.kind === 'tag' && r.name === tag)?.color ?? '#475569';
	const rows = personalSpending(ctx, {
		...filter,
		tag,
		from: window.from,
		to: window.to
	});
	const byMonth = keys.map((month) =>
		rows
			.filter((r) => r.month === month)
			.reduce((n, r) => minorAmount(n + r.spentMinor, 'tag month'), 0)
	);
	const active = byMonth.filter((c) => c > 0).length;
	const totalCents = byMonth.reduce((n, c) => n + c, 0);
	return {
		name: tag,
		color: colour,
		months: keys,
		byMonth,
		totalCents,
		averageCents: active === 0 ? 0 : Math.round(totalCents / active),
		activeMonths: active
	};
}

/** Everything the movement filters can offer, for the pickers. */
export function filterOptions(ctx: Ctx) {
	const rules = listRules(ctx);
	return {
		categories: rules
			.filter((r) => r.kind === 'category')
			.map((r) => ({ name: r.name, color: r.color })),
		tags: rules.filter((r) => r.kind === 'tag').map((r) => ({ name: r.name, color: r.color }))
	};
}

/**
 * The months this ledger actually has lines in, newest first.
 *
 * A list rather than a date field. `input type="month"` is a picker in
 * Chromium and a bare text box in Firefox — where somebody typing "2" gets a
 * filter that matches nothing and a box that explains nothing — and even
 * where it is a picker it offers every month since the calendar began, all
 * but a handful of which are empty. These are the months there is something
 * to look at.
 */
export function monthsWithLines(ctx: Ctx, ledgerId?: number | null): string[] {
	const rows = db
		.select({ occurredOn: financeTransactions.occurredOn })
		.from(financeTransactions)
		.where(
			ledgerId
				? and(
						eq(financeTransactions.userId, ctx.userId),
						eq(financeTransactions.ledgerId, ledgerId)
					)
				: eq(financeTransactions.userId, ctx.userId)
		)
		.all();
	return [...new Set(rows.map((r) => r.occurredOn.slice(0, 7)))].sort().reverse();
}

/** The ledgers a set of transaction ids belongs to — for bulk moves later. */
export function movementsIn(ctx: Ctx, ids: number[]): Movement[] {
	if (ids.length === 0) return [];
	const rows = db
		.select({ id: financeTransactions.id })
		.from(financeTransactions)
		.where(and(eq(financeTransactions.userId, ctx.userId), inArray(financeTransactions.id, ids)))
		.all();
	const found = new Set(rows.map((r) => r.id));
	return listMovements(ctx, { limit: 100_000 }).filter((m) => found.has(m.id));
}
