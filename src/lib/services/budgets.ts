/** Monthly ceilings share statement spending; they never write a bank or stock entry. */
import { and, eq, ne } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import { financeBudgets, financeRules, ledgers } from '$lib/db/schema.js';
import { normaliseCurrency } from '../money.js';
import { localDateOf, type Ctx } from './ctx.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { civilDay, minorAmount, num, str } from './validate.js';
import { spending, MAX_RULE_NAME_LENGTH, type Spending } from './statements.js';
import { stamps } from './time.js';

type StoredBudget = typeof financeBudgets.$inferSelect;
export type Budget = StoredBudget & {
	spentMinor: number;
	remainingMinor: number;
	creditMinor: number;
	orphaned: boolean;
};
export type BudgetInput = {
	month?: unknown;
	category?: unknown;
	currency?: unknown;
	amountMinor?: unknown;
	updatedAt?: unknown;
};

export function budgetMonth(value: unknown): string {
	const month = str(value, 'month', { max: 7, pattern: /^\d{4}-\d{2}$/ });
	civilDay(`${month}-01`, 'month');
	return month;
}

function owned(ctx: Ctx, id: number): StoredBudget {
	const found = db
		.select()
		.from(financeBudgets)
		.where(
			and(
				eq(financeBudgets.userId, ctx.userId),
				eq(financeBudgets.id, num(id, 'budget', { int: true, min: 1 }))
			)
		)
		.get();
	if (!found) throw new NotFoundError('budget');
	return found;
}

/** `spent` is the same month's personal spending already read by a caller that
 * needs both figures — one grouped read, not two (D11). */
function progress(ctx: Ctx, rows: StoredBudget[], spent?: Spending[]): Budget[] {
	const categories = new Set(
		db
			.select({ name: financeRules.name })
			.from(financeRules)
			.where(and(eq(financeRules.userId, ctx.userId), eq(financeRules.kind, 'category')))
			.all()
			.map((row) => row.name)
	);
	const months = new Map(
		[...new Set(rows.map((row) => row.month))].map((month) => [
			month,
			spent ?? spending(ctx, { month })
		])
	);
	return rows.map((row) => {
		const net =
			months
				.get(row.month)
				?.find((group) => group.currency === row.currency)
				?.byCategory.find((category) => category.name === row.category)?.netMinor ?? 0;
		const spentMinor = Math.max(0, net);
		return {
			...row,
			amountMinor: minorAmount(row.amountMinor),
			spentMinor,
			remainingMinor: Math.max(0, minorAmount(row.amountMinor - spentMinor)),
			creditMinor: Math.max(0, -net),
			orphaned: !categories.has(row.category)
		};
	});
}

export function listBudgets(
	ctx: Ctx,
	filter: { month?: string; currency?: string } = {},
	spent?: Spending[]
): Budget[] {
	const where = [
		eq(financeBudgets.userId, ctx.userId),
		eq(financeBudgets.month, budgetMonth(filter.month ?? localDateOf(ctx.now, ctx.tz).slice(0, 7)))
	];
	if (filter.currency !== undefined) {
		const currency = normaliseCurrency(filter.currency);
		if (!currency) throw new ValidationError('Choose a valid original currency.');
		where.push(eq(financeBudgets.currency, currency));
	}
	return progress(
		ctx,
		db
			.select()
			.from(financeBudgets)
			.where(and(...where))
			.orderBy(financeBudgets.currency, financeBudgets.category, financeBudgets.id)
			.all(),
		spent
	);
}

export function getBudget(ctx: Ctx, id: number): Budget {
	return progress(ctx, [owned(ctx, id)])[0];
}

function fields(ctx: Ctx, input: BudgetInput, before?: StoredBudget) {
	const month = budgetMonth(input.month === undefined ? before?.month : input.month);
	const category = str(
		input.category === undefined ? before?.category : input.category,
		'category',
		{ max: MAX_RULE_NAME_LENGTH }
	);
	if (
		category !== before?.category &&
		!db
			.select({ id: financeRules.id })
			.from(financeRules)
			.where(
				and(
					eq(financeRules.userId, ctx.userId),
					eq(financeRules.kind, 'category'),
					eq(financeRules.name, category)
				)
			)
			.get()
	)
		throw new ValidationError(
			`Category ${category} no longer exists. Choose an existing category rule.`
		);
	const currency = normaliseCurrency(
		input.currency === undefined ? before?.currency : input.currency
	);
	if (!currency) throw new ValidationError('Choose a valid original currency.');
	if (
		(before === undefined || currency !== before.currency) &&
		!db
			.select({ id: ledgers.id })
			.from(ledgers)
			.where(and(eq(ledgers.userId, ctx.userId), eq(ledgers.currency, currency)))
			.get()
	)
		throw new ValidationError(
			`No ledger uses ${currency}. Add a ledger in that original currency first.`
		);
	const amountMinor = minorAmount(
		input.amountMinor === undefined ? before?.amountMinor : input.amountMinor
	);
	if (amountMinor < 0) throw new ValidationError('A budget amount cannot be negative.');
	return { month, category, currency, amountMinor };
}

function assertUnique(ctx: Ctx, next: ReturnType<typeof fields>, id?: number) {
	if (
		db
			.select({ id: financeBudgets.id })
			.from(financeBudgets)
			.where(
				and(
					eq(financeBudgets.userId, ctx.userId),
					eq(financeBudgets.month, next.month),
					eq(financeBudgets.category, next.category),
					eq(financeBudgets.currency, next.currency),
					id === undefined ? undefined : ne(financeBudgets.id, id)
				)
			)
			.get()
	)
		throw new ConflictError('A budget already exists for this month, category and currency.');
}

export function createBudget(ctx: Ctx, input: BudgetInput): Budget {
	return db.transaction((tx) => {
		const next = fields(ctx, input);
		assertUnique(ctx, next);
		const row = tx
			.insert(financeBudgets)
			.values({ userId: ctx.userId, ...next, ...stamps(ctx) })
			.returning({ id: financeBudgets.id })
			.get();
		return getBudget(ctx, row.id);
	});
}

export function updateBudget(ctx: Ctx, id: number, input: BudgetInput): void {
	db.transaction((tx) => {
		const before = owned(ctx, id);
		if (input.updatedAt !== undefined && input.updatedAt !== before.updatedAt)
			throw new ConflictError('This budget changed. Read it again before saving.', {
				updatedAt: before.updatedAt
			});
		const next = fields(ctx, input, before);
		assertUnique(ctx, next, id);
		// Two edits in the same clock tick must not share a concurrency token.
		const updatedAt = new Date(
			Math.max(ctx.now.getTime(), new Date(before.updatedAt).getTime() + 1)
		).toISOString();
		const result = tx
			.update(financeBudgets)
			.set({ ...next, updatedAt })
			.where(
				and(
					eq(financeBudgets.userId, ctx.userId),
					eq(financeBudgets.id, id),
					eq(financeBudgets.updatedAt, before.updatedAt)
				)
			)
			.run();
		if (result.changes !== 1)
			throw new ConflictError('This budget changed. Read it again before saving.');
	});
}

export function deleteBudget(ctx: Ctx, id: number): void {
	const result = db
		.delete(financeBudgets)
		.where(and(eq(financeBudgets.userId, ctx.userId), eq(financeBudgets.id, id)))
		.run();
	if (result.changes !== 1) throw new NotFoundError('budget');
}

/** Copy existing ceilings as ceilings, preserving orphan labels and never overwriting a bucket. */
export function copyBudgets(
	ctx: Ctx,
	input: { fromMonth: unknown; toMonth: unknown }
): { added: number; skipped: number } {
	const from = budgetMonth(input.fromMonth);
	const to = budgetMonth(input.toMonth);
	return db.transaction((tx) => {
		const source = tx
			.select()
			.from(financeBudgets)
			.where(and(eq(financeBudgets.userId, ctx.userId), eq(financeBudgets.month, from)))
			.all();
		let added = 0;
		for (const before of source) {
			const next = fields(ctx, { month: to }, before);
			const result = tx
				.insert(financeBudgets)
				.values({ userId: ctx.userId, ...next, ...stamps(ctx) })
				.onConflictDoNothing({
					target: [
						financeBudgets.userId,
						financeBudgets.month,
						financeBudgets.category,
						financeBudgets.currency
					]
				})
				.run();
			added += result.changes;
		}
		return { added, skipped: source.length - added };
	});
}
