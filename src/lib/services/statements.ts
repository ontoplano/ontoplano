/**
 * Bank statements: lines imported from an export, and the rules that sort
 * them.
 *
 * The lines are kept as the bank said them — see the schema note on
 * `finance_transactions` — and the sorting happens at read time: a category
 * is the first rule whose pattern matches (position order, so the partition
 * is deterministic), tags are every rule that matches. Writing a rule today
 * therefore sorts last year's lines too, with no resweep and nothing stored
 * to drift.
 */
import { and, desc, eq, gte } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { bills, billPayments, financeRules, financeTransactions } from '$lib/db/schema.js';
import { parserFor, BANK_PARSERS, parserKey } from '../bank-parsers/index.js';
import type { Ctx } from './ctx.js';
import { stamp } from './time.js';
import { NotFoundError, ValidationError } from './errors.js';
import { num, oneOf, str } from './validate.js';

export const MAX_PATTERN_LENGTH = 300;
export const MAX_RULE_NAME_LENGTH = 100;
/** How far back the Net plots look. Far enough for a shape, near enough to read. */
export const NET_MONTHS = 12;

export type Movement = {
	id: number;
	occurredOn: string;
	amountCents: number;
	description: string;
	source: string;
	category: string | null;
	tags: string[];
};

export type Rule = {
	id: number;
	kind: 'category' | 'tag';
	name: string;
	pattern: string;
	position: number;
};

/** The parsers the import screen can offer, by key and friendly name. */
export function availableParsers(): { key: string; name: string }[] {
	return BANK_PARSERS.map((p) => ({ key: parserKey(p), name: p.name }));
}

/*
 * A small stable hash for lines the bank gave no id.
 *
 * Not cryptographic and does not need to be: it only has to keep one
 * person's statement lines apart, and the occurrence counter below keeps
 * two identical espressos on the same day from colliding on purpose.
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
 * Import one export's text. Idempotent: the same file twice adds nothing.
 *
 * `flip` negates every amount, for the person whose export means the
 * opposite of what the parser expects — a statement kept from the card's
 * point of view, say. The fingerprint uses the flipped amount, so the same
 * file imported flipped and unflipped is two sets of lines, which is what
 * it truthfully is.
 */
export function importStatement(
	ctx: Ctx,
	input: { source: unknown; text: unknown; flip?: boolean }
): { added: number; skipped: number } {
	const source = str(input.source, 'bank export', { max: 100 });
	const parser = parserFor(source);
	if (!parser) throw new ValidationError('No parser knows that export.');
	const text = str(input.text, 'statement', { max: 2_000_000 });

	const parsed = parser.parse(text);
	if (parsed.length === 0)
		throw new ValidationError(`That does not look like "${parser.name}" — no lines matched.`);

	// Two identical lines in one file are two real movements (two espressos,
	// same price, same day): each gets its occurrence number, so they keep
	// distinct fingerprints while a re-import of the same file still lands on
	// the same ones and is ignored.
	const seen = new Map<string, number>();
	let added = 0;
	for (const line of parsed) {
		const amountCents = input.flip ? -line.amountCents : line.amountCents;
		let fingerprint: string;
		if (line.externalId) {
			fingerprint = `${source}:${line.externalId}`;
		} else {
			const content = `${source}|${line.occurredOn}|${amountCents}|${line.description}`;
			const n = (seen.get(content) ?? 0) + 1;
			seen.set(content, n);
			fingerprint = `h:${lineHash(`${content}|${n}`)}`;
		}
		const inserted = db
			.insert(financeTransactions)
			.values({
				userId: ctx.userId,
				occurredOn: line.occurredOn,
				amountCents,
				description: line.description,
				source,
				externalId: line.externalId ?? null,
				fingerprint,
				createdAt: stamp(ctx)
			})
			.onConflictDoNothing()
			.run();
		if (inserted.changes > 0) added += 1;
	}
	return { added, skipped: parsed.length - added };
}

export function deleteMovement(ctx: Ctx, id: number): void {
	const gone = db
		.delete(financeTransactions)
		.where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, ctx.userId)))
		.run();
	if (gone.changes === 0) throw new NotFoundError('movement');
}

// ── Rules ────────────────────────────────────────────────────────────────────

function compiled(rule: { pattern: string }): RegExp | null {
	try {
		return new RegExp(rule.pattern, 'i');
	} catch {
		// A rule that stopped compiling (written by an older build, say) is
		// skipped rather than taking the whole list down with it.
		return null;
	}
}

export function listRules(ctx: Ctx): Rule[] {
	return db
		.select()
		.from(financeRules)
		.where(eq(financeRules.userId, ctx.userId))
		.orderBy(financeRules.position, financeRules.id)
		.all()
		.map((r) => ({
			id: r.id,
			kind: r.kind as Rule['kind'],
			name: r.name,
			pattern: r.pattern,
			position: r.position
		}));
}

function ruleFields(input: { kind?: unknown; name?: unknown; pattern?: unknown }) {
	const pattern = str(input.pattern, 'pattern', { max: MAX_PATTERN_LENGTH });
	try {
		new RegExp(pattern, 'i');
	} catch {
		throw new ValidationError('That pattern is not a valid regular expression.');
	}
	return {
		kind: oneOf(input.kind, 'kind', ['category', 'tag'] as const),
		name: str(input.name, 'name', { max: MAX_RULE_NAME_LENGTH }),
		pattern
	};
}

export function createRule(
	ctx: Ctx,
	input: { kind?: unknown; name?: unknown; pattern?: unknown }
): Rule {
	const f = ruleFields(input);
	const last = listRules(ctx).filter((r) => r.kind === f.kind).length;
	const inserted = db
		.insert(financeRules)
		.values({ userId: ctx.userId, ...f, position: last, createdAt: stamp(ctx) })
		.returning({ id: financeRules.id })
		.get();
	return listRules(ctx).find((r) => r.id === inserted.id)!;
}

export function updateRule(
	ctx: Ctx,
	id: number,
	input: { kind?: unknown; name?: unknown; pattern?: unknown; position?: unknown }
): Rule {
	const found = listRules(ctx).find((r) => r.id === id);
	if (!found) throw new NotFoundError('rule');
	const f = ruleFields({
		kind: input.kind ?? found.kind,
		name: input.name ?? found.name,
		pattern: input.pattern ?? found.pattern
	});
	db.update(financeRules)
		.set(f)
		.where(and(eq(financeRules.id, id), eq(financeRules.userId, ctx.userId)))
		.run();

	if (input.position !== undefined && input.position !== null && input.position !== '') {
		// A move is a reinsertion, not a bare number: every rule of the kind is
		// resequenced around it, so two rules can never share a position and
		// "move up" always actually moves.
		const wanted = num(input.position, 'position', { int: true, min: 0 });
		const siblings = listRules(ctx).filter((r) => r.kind === f.kind);
		const rest = siblings.filter((r) => r.id !== id);
		rest.splice(Math.min(wanted, rest.length), 0, siblings.find((r) => r.id === id)!);
		rest.forEach((r, index) => {
			db.update(financeRules)
				.set({ position: index })
				.where(and(eq(financeRules.id, r.id), eq(financeRules.userId, ctx.userId)))
				.run();
		});
	}
	return listRules(ctx).find((r) => r.id === id)!;
}

export function deleteRule(ctx: Ctx, id: number): void {
	const gone = db
		.delete(financeRules)
		.where(and(eq(financeRules.id, id), eq(financeRules.userId, ctx.userId)))
		.run();
	if (gone.changes === 0) throw new NotFoundError('rule');
}

/**
 * Sort one description: the first matching category (the partition), every
 * matching tag (the lenses).
 */
export function sortByRules(
	rules: Rule[],
	description: string
): { category: string | null; tags: string[] } {
	let category: string | null = null;
	const tags: string[] = [];
	for (const rule of rules) {
		const re = compiled(rule);
		if (!re || !re.test(description)) continue;
		if (rule.kind === 'category') {
			if (category === null) category = rule.name;
		} else {
			tags.push(rule.name);
		}
	}
	return { category, tags };
}

// ── Reading ──────────────────────────────────────────────────────────────────

export function listMovements(ctx: Ctx, opts: { month?: string; limit?: number } = {}): Movement[] {
	const rules = listRules(ctx);
	const where = opts.month
		? and(
				eq(financeTransactions.userId, ctx.userId),
				gte(financeTransactions.occurredOn, `${opts.month}-01`)
			)
		: eq(financeTransactions.userId, ctx.userId);
	let rows = db
		.select()
		.from(financeTransactions)
		.where(where)
		.orderBy(desc(financeTransactions.occurredOn), desc(financeTransactions.id))
		.limit(opts.limit ?? 500)
		.all();
	if (opts.month) rows = rows.filter((r) => r.occurredOn.startsWith(opts.month!));
	return rows.map((r) => ({
		id: r.id,
		occurredOn: r.occurredOn,
		amountCents: r.amountCents,
		description: r.description,
		source: r.source,
		...sortByRules(rules, r.description)
	}));
}

/** 'YYYY-MM' for an instant, and the N keys ending at that month. */
export function monthKeys(now: Date, months: number): string[] {
	const keys: string[] = [];
	const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	for (let i = 0; i < months; i++) {
		keys.unshift(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
		cursor.setUTCMonth(cursor.getUTCMonth() - 1);
	}
	return keys;
}

export type StatementMonth = {
	month: string;
	inCents: number;
	outCents: number;
	netCents: number;
	/** Spending by category — the partition, plus what nothing claimed. */
	byCategory: { name: string; outCents: number }[];
};

/** What the statements say, month by month. */
export function statementSeries(ctx: Ctx, months = NET_MONTHS): StatementMonth[] {
	const keys = monthKeys(ctx.now, months);
	const rules = listRules(ctx);
	const from = `${keys[0]}-01`;
	const rows = db
		.select()
		.from(financeTransactions)
		.where(
			and(eq(financeTransactions.userId, ctx.userId), gte(financeTransactions.occurredOn, from))
		)
		.all();

	return keys.map((month) => {
		const monthRows = rows.filter((r) => r.occurredOn.startsWith(month));
		const inCents = monthRows
			.filter((r) => r.amountCents > 0)
			.reduce((sum, r) => sum + r.amountCents, 0);
		const outRows = monthRows.filter((r) => r.amountCents < 0);
		const outCents = outRows.reduce((sum, r) => sum - r.amountCents, 0);

		const byCategory = new Map<string, number>();
		for (const r of outRows) {
			const { category } = sortByRules(rules, r.description);
			const name = category ?? 'Uncategorized';
			byCategory.set(name, (byCategory.get(name) ?? 0) - r.amountCents);
		}
		return {
			month,
			inCents,
			outCents,
			netCents: inCents - outCents,
			byCategory: [...byCategory.entries()]
				.map(([name, cents]) => ({ name, outCents: cents }))
				.sort((a, b) => b.outCents - a.outCents)
		};
	});
}

export type RecordsMonth = {
	month: string;
	incomeCents: number;
	billsCents: number;
	netCents: number;
};

/**
 * What the app's own books say, month by month: income received against
 * bills paid. Kept apart from the statement series on purpose — a salary
 * that is both recorded here and visible in a statement would be counted
 * twice by any series that merged them.
 */
export function recordsSeries(ctx: Ctx, months = NET_MONTHS): RecordsMonth[] {
	const keys = monthKeys(ctx.now, months);
	const rows = db
		.select({ period: billPayments.period, amountPaid: billPayments.amountPaid, flow: bills.flow })
		.from(billPayments)
		.innerJoin(bills, eq(billPayments.billId, bills.id))
		.where(eq(billPayments.userId, ctx.userId))
		.all();

	return keys.map((month) => {
		// A weekly period key ('2026-W07') never equals a month key; monthly
		// and yearly payments land by prefix.
		const monthRows = rows.filter((r) => r.period === month || r.period.startsWith(`${month}-`));
		const incomeCents = monthRows
			.filter((r) => r.flow === 'in')
			.reduce((sum, r) => sum + r.amountPaid, 0);
		const billsCents = monthRows
			.filter((r) => r.flow === 'out')
			.reduce((sum, r) => sum + r.amountPaid, 0);
		return { month, incomeCents, billsCents, netCents: incomeCents - billsCents };
	});
}
