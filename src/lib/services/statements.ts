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
import { and, desc, eq, gte, inArray } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { financeRules, financeTransactions, ledgers } from '$lib/db/schema.js';
import {
	parserFor,
	parseCsv,
	BANK_PARSERS,
	CSV_PARSER_KEY,
	parserKey,
	type CsvMapping
} from '../bank-parsers/index.js';
import type { Ctx } from './ctx.js';
import { getLedger } from './ledgers.js';
import { stamp } from './time.js';
import { NotFoundError, ValidationError } from './errors.js';
import { num, oneOf, str } from './validate.js';
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

/**
 * The colours a new rule is given, in order.
 *
 * Distinguishable from each other and readable as a pale row wash, which is
 * what a category does to its line. Changeable per rule afterwards.
 */
export const RULE_PALETTE = [
	'#1d4ed8',
	'#b45309',
	'#0f766e',
	'#7c2d12',
	'#6d28d9',
	'#9d174d',
	'#155e63',
	'#4d7c0f',
	'#a16207',
	'#be123c'
] as const;

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
	category: string | null;
	categoryColor: string | null;
	tags: { name: string; color: string }[];
};

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
): { added: number; skipped: number } {
	const ledgerId = num(input.ledgerId, 'ledger', { int: true });
	getLedger(ctx, ledgerId); // ownership
	const source = str(input.source, 'bank export', { max: 100 });
	const parser = parserFor(source);
	if (!parser) throw new ValidationError({ key: 'errors.statements.noParserKnowsThatExport' });
	const text = str(input.text, 'statement', { max: MAX_STATEMENT_LENGTH });

	const read =
		source === CSV_PARSER_KEY && input.mapping ? parseCsv(text, input.mapping) : parser.parse(text);
	const parsed = read.slice(0, MAX_STATEMENT_LINES);
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
	const seen = new Map<string, number>();
	let added = 0;
	for (const line of parsed) {
		const amountCents = input.flip ? -line.amountCents : line.amountCents;
		// A parser reads whatever the file said; the description it returns is
		// still text from outside and is bounded here, where everything else
		// that reaches this column is.
		const description = line.description.slice(0, MAX_DESCRIPTION_LENGTH);
		const base = line.externalId
			? `${source}:${line.externalId}`
			: (() => {
					const content = `${source}|${line.occurredOn}|${amountCents}|${description}`;
					const n = (seen.get(content) ?? 0) + 1;
					seen.set(content, n);
					return `h:${lineHash(`${content}|${n}`)}`;
				})();
		const inserted = db
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
			.onConflictDoNothing()
			.run();
		if (inserted.changes > 0) added += 1;
	}
	return { added, skipped: parsed.length - added };
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
	const occurredOn = str(input.occurredOn, 'date', { max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
	const amountCents = num(input.amountCents, 'amount', { int: true });
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
	input: { description?: unknown; occurredOn?: unknown; amountCents?: unknown; ledgerId?: unknown }
): void {
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

	db.update(financeTransactions)
		.set({
			ledgerId,
			description:
				input.description === undefined
					? current.description
					: str(input.description, 'description', { max: 500 }),
			occurredOn:
				input.occurredOn === undefined || input.occurredOn === ''
					? current.occurredOn
					: str(input.occurredOn, 'date', { max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ }),
			amountCents:
				input.amountCents === undefined || input.amountCents === ''
					? current.amountCents
					: num(input.amountCents, 'amount', { int: true })
		})
		.where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, ctx.userId)))
		.run();
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
	const siblings = rawRules(ctx).filter((r) => r.kind === found.kind);
	const from = siblings.findIndex((r) => r.id === id);
	const to = Math.min(Math.max(from + delta, 0), siblings.length - 1);
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
	/** 'YYYY-MM', or a half-open range through `from`/`to` dates. */
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
	if (filter.from) where.push(gte(financeTransactions.occurredOn, filter.from));

	const rows = db
		.select()
		.from(financeTransactions)
		.where(and(...where))
		.orderBy(desc(financeTransactions.occurredOn), desc(financeTransactions.id))
		.all();

	const text = filter.query?.trim().toLowerCase();
	return rows
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
			return {
				id: r.id,
				ledgerId: r.ledgerId,
				ledgerName: r.ledgerId === null ? null : (names.get(r.ledgerId) ?? null),
				occurredOn: r.occurredOn,
				amountCents: r.amountCents,
				description: r.description,
				source: r.source,
				...sorted
			};
		})
		.filter((m) => !filter.category || (m.category ?? UNCATEGORIZED) === filter.category)
		.filter((m) => !filter.tag || m.tags.some((t) => t.name === filter.tag))
		.slice(0, filter.limit ?? 1000);
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

export type CategorySlice = { name: string; color: string; outCents: number; share: number };

/**
 * Spending by category over a window — the pie, and the table beside it.
 * Every outgoing line is in exactly one slice, uncategorized included, so
 * the slices are the whole of what was spent.
 */
export function categorySlices(ctx: Ctx, filter: MovementFilter = {}): CategorySlice[] {
	const out = listMovements(ctx, { ...filter, limit: 100_000 }).filter((m) => m.amountCents < 0);
	const totals = new Map<string, { cents: number; color: string }>();
	for (const m of out) {
		const name = m.category ?? UNCATEGORIZED;
		const held = totals.get(name) ?? { cents: 0, color: m.categoryColor ?? '#94a3b8' };
		held.cents -= m.amountCents;
		totals.set(name, held);
	}
	const sum = [...totals.values()].reduce((n, t) => n + t.cents, 0) || 1;
	return [...totals.entries()]
		.map(([name, t]) => ({ name, color: t.color, outCents: t.cents, share: t.cents / sum }))
		.sort((a, b) => b.outCents - a.outCents);
}

export type StatementMonth = {
	month: string;
	inCents: number;
	outCents: number;
	netCents: number;
};

/** In, out and net, month by month. */
export function monthlyTotals(
	ctx: Ctx,
	months = DEFAULT_MONTHS,
	filter: MovementFilter = {}
): StatementMonth[] {
	const keys = monthKeys(ctx.now, months);
	const rows = listMovements(ctx, { ...filter, from: `${keys[0]}-01`, limit: 100_000 });
	return keys.map((month) => {
		const mine = rows.filter((r) => r.occurredOn.startsWith(month));
		const inCents = mine.filter((r) => r.amountCents > 0).reduce((n, r) => n + r.amountCents, 0);
		const outCents = mine.filter((r) => r.amountCents < 0).reduce((n, r) => n - r.amountCents, 0);
		return { month, inCents, outCents, netCents: inCents - outCents };
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
	const keys = monthKeys(ctx.now, months);
	const rows = listMovements(ctx, { ...filter, from: `${keys[0]}-01`, limit: 100_000 }).filter(
		(m) => m.amountCents < 0
	);
	const names = new Map<string, string>();
	for (const r of rows) names.set(r.category ?? UNCATEGORIZED, r.categoryColor ?? '#94a3b8');

	return {
		months: keys,
		categories: [...names.entries()]
			.map(([name, color]) => {
				const byMonth = keys.map((month) =>
					rows
						.filter((r) => (r.category ?? UNCATEGORIZED) === name && r.occurredOn.startsWith(month))
						.reduce((n, r) => n - r.amountCents, 0)
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
	const keys = monthKeys(ctx.now, months);
	const rules = rawRules(ctx);
	const colour = rules.find((r) => r.kind === 'tag' && r.name === tag)?.color ?? '#475569';
	const rows = listMovements(ctx, { ...filter, tag, from: `${keys[0]}-01`, limit: 100_000 }).filter(
		(m) => m.amountCents < 0
	);
	const byMonth = keys.map((month) =>
		rows.filter((r) => r.occurredOn.startsWith(month)).reduce((n, r) => n - r.amountCents, 0)
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
