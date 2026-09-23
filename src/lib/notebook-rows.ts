import { formatMoney, type Currency } from './money.js';
import type { ModuleRow } from './notebook-tabs.js';
import type { NotebookModule } from './notebook-modules.js';
import type { Translate } from './i18n/index.js';

/**
 * Each module's rows, reduced to the three things a line shows.
 *
 * Separated from the markup because this is the part that differs per module
 * and nothing else does: a habit's line says its streak, a bill's says what it
 * costs and when, an item's says how many there are. Written here, once, they
 * can be read side by side and kept in the same voice — and `ModuleTab` stays
 * one list rather than seven.
 *
 * `done` is whatever "not outstanding any more" means in that room: bought,
 * paid, applied, archived. The tab greys those rows and counts the rest, which
 * is the same rule the Tasks tab already used for finished todos.
 */

type Contents = Record<string, unknown[]>;

/** What the whole tab needs to put numbers and money into words. */
export type RowContext = { t: Translate; currency: Currency };

export function rowsFor(
	module: NotebookModule,
	contents: Contents | null,
	ctx: RowContext
): ModuleRow[] {
	const rows = (contents?.[module] ?? []) as Record<string, never>[];
	const shape = SHAPES[module];
	if (!shape) return [];
	return rows.map((row) => shape(row, ctx));
}

/** Only the ones worth saying — a blank fact is a separator with nothing round it. */
function facts(...parts: (string | false | null | undefined)[]): string[] {
	return parts.filter((part): part is string => Boolean(part));
}

const SHAPES: Partial<
	Record<NotebookModule, (row: Record<string, never>, ctx: RowContext) => ModuleRow>
> = {
	inventory: (row, { t }) => ({
		id: Number(row.id),
		title: String(row.name ?? ''),
		meta: facts(
			// How many there are against how many you keep — the pair is the
			// whole point of the column, so it is never shown as one number.
			t('notebooks.rows.ofWanted', { have: Number(row.qty), want: Number(row.idealQty) }),
			row.inventoryCategoryName ? String(row.inventoryCategoryName) : null
		),
		done: Boolean(row.bought)
	}),

	ledgers: (row, { t, currency }) => ({
		id: Number(row.id),
		title: String(row.name ?? ''),
		meta: facts(
			formatMoney(Number(row.balanceCents ?? 0), currency, t.locale),
			t('notebooks.rows.linesCount', { count: Number(row.count ?? 0) })
		),
		done: Boolean(row.archived)
	}),

	bills: (row, { t, currency }) => ({
		id: Number(row.id),
		title: String(row.name ?? ''),
		meta: facts(
			formatMoney(Number(row.amountExpected ?? 0), currency, t.locale),
			row.dueDay ? t('notebooks.rows.dueOnThe', { day: Number(row.dueDay) }) : null
		),
		// Archived, not paid: a bill is never finished with, it comes round
		// again. Whether this month's is paid is the mark on the row.
		done: !row.active
	}),

	habits: (row, { t }) => ({
		id: Number(row.id),
		title: String(row.name ?? ''),
		meta: facts(
			Number(row.streak ?? 0) > 0
				? t('notebooks.rows.streakDays', { count: Number(row.streak) })
				: null
		),
		done: false
	}),

	workouts: (row, { t }) => ({
		id: Number(row.id),
		title: String(row.title ?? ''),
		meta: facts(
			row.categoryName ? String(row.categoryName) : null,
			row.minutes ? t('notebooks.rows.minutesLong', { count: Number(row.minutes) }) : null
		),
		done: Boolean(row.archived)
	}),

	recipes: (row, { t }) => ({
		id: Number(row.id),
		title: String(row.title ?? ''),
		meta: facts(
			row.servings ? t('notebooks.rows.servesCount', { count: Number(row.servings) }) : null,
			row.minutes ? t('notebooks.rows.minutesLong', { count: Number(row.minutes) }) : null
		),
		done: Boolean(row.archivedAt)
	})
};
