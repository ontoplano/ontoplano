/**
 * One box over everything the account owns.
 *
 * The app had grown nine places to put a sentence and no way to find one
 * again: remembering which section something is in is not a feature. This
 * queries each table for the same substring and returns the hits grouped by
 * what they are.
 *
 * `LIKE` rather than FTS5 on purpose. It is one index scan per table on a few
 * thousand rows, which is nothing, and it keeps the schema free of a second
 * copy of every piece of text. When somebody has fifty thousand notes this
 * becomes an FTS5 table and the shape of this file does not change.
 */
import { and, desc, eq, like, or, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
	activities,
	diaryEntries,
	exceptionalTasks,
	goals,
	ideas,
	notebooks,
	people,
	todoTasks,
	shoppingItems,
	recurringTasks
} from '../db/schema.js';
import {
	KIND_LABELS,
	MIN_QUERY,
	parseQuery,
	SEARCH_KINDS,
	type Hit,
	type SearchKind
} from '../../search.js';
import type { Ctx } from './ctx.js';
import { str } from './validate.js';

export {
	KIND_LABELS,
	MIN_QUERY,
	parseQuery,
	SEARCH_KINDS,
	type Hit,
	type SearchKind
} from '../../search.js';

const PER_KIND = 6;

/**
 * The line the match is on, trimmed to something that fits a result row.
 *
 * Showing the first line of a long note when the match is in the last one is
 * worse than showing nothing: the reader cannot see why it matched.
 */
function snippetOf(text: string, needle: string, max = 120): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	const at = flat.toLowerCase().indexOf(needle.toLowerCase());
	if (at === -1) return flat.slice(0, max);

	const from = Math.max(0, at - 30);
	const cut = flat.slice(from, from + max);
	return (from > 0 ? '…' : '') + cut + (from + max < flat.length ? '…' : '');
}

function firstLine(text: string, max = 80): string {
	const line = text.replace(/\s+/g, ' ').trim();
	return line.length > max ? line.slice(0, max) + '…' : line;
}

/** The kinds a notebook can hold. `in:` cannot narrow to the others. */
const SCOPABLE: SearchKind[] = ['note', 'todo', 'block', 'goal'];

export function search(ctx: Ctx, raw: unknown): Hit[] {
	const parsed = parseQuery(String(raw ?? ''));
	const q = parsed.text.trim();
	if (q.length < MIN_QUERY) return [];

	// Bounded before it reaches a query, like every other string (I8).
	const query = str(q, 'search', { max: 200 });
	/*
	 * `%` and `_` are wildcards to LIKE, so a search for a literal one has to
	 * escape it — and the escaping only exists if the query carries an ESCAPE
	 * clause, which drizzle's `like()` never emits. Without it the backslashes
	 * were matched literally: searching "100%" found nothing, and "%" matched
	 * every row.
	 */
	const escape = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);
	const pattern = `%${escape(query)}%`;
	const matches = (column: Parameters<typeof like>[0]) =>
		sql`${column} like ${pattern} escape '\\'`;

	/**
	 * `in:kitchen` scopes to one notebook, matched by prefix so three letters of
	 * it will do. A name that matches nothing scopes to nothing, which is the
	 * honest answer to a search inside a notebook that does not exist.
	 */
	const scope =
		parsed.notebook === null
			? null
			: (db
					.select({ id: notebooks.id })
					.from(notebooks)
					.where(
						and(
							eq(notebooks.userId, ctx.userId),
							sql`${notebooks.title} like ${`${escape(parsed.notebook)}%`} escape '\\'`
						)
					)
					.limit(1)
					.get()?.id ?? -1);

	/**
	 * A prefix narrows before the query runs rather than after.
	 *
	 * Filtering the finished list would still cost nine table scans to throw
	 * eight of them away, and the whole point of typing `todo:` is that you
	 * already know where the thing is.
	 */
	const wants = (kind: SearchKind) =>
		(parsed.kinds === null || parsed.kinds.includes(kind)) &&
		(scope === null || SCOPABLE.includes(kind));

	const hits: Hit[] = [];
	const found = (hit: Hit) => {
		if (wants(hit.kind)) hits.push(hit);
	};

	// --- what you wrote ---------------------------------------------------------
	for (const row of db
		.select({
			id: diaryEntries.id,
			seq: diaryEntries.seq,
			content: diaryEntries.content,
			notebookId: diaryEntries.notebookId,
			notebookTitle: notebooks.title
		})
		.from(diaryEntries)
		.leftJoin(notebooks, eq(diaryEntries.notebookId, notebooks.id))
		.where(
			and(
				eq(diaryEntries.userId, ctx.userId),
				matches(diaryEntries.content),
				scope === null ? undefined : eq(diaryEntries.notebookId, scope)
			)
		)
		.orderBy(desc(diaryEntries.createdAt))
		.limit(PER_KIND * 2)
		.all()) {
		const inNotebook = row.notebookId !== null;
		// The title is what you wrote. Two notes in the same notebook titled by
		// the notebook are indistinguishable, and `#11` says nothing at all.
		found({
			kind: inNotebook ? 'note' : 'entry',
			id: row.id,
			title: firstLine(row.content),
			snippet: inNotebook
				? `in ${row.notebookTitle} · ${snippetOf(row.content, query, 90)}`
				: `#${row.seq} · ${snippetOf(row.content, query, 100)}`,
			href: inNotebook ? `/notebooks/${row.notebookId}` : `/notebooks/diary#diary-${row.seq}`
		});
	}

	for (const row of db
		.select({ id: notebooks.id, title: notebooks.title, description: notebooks.description })
		.from(notebooks)
		.where(
			and(
				eq(notebooks.userId, ctx.userId),
				or(matches(notebooks.title), matches(notebooks.description ?? sql`''`))
			)
		)
		.limit(PER_KIND)
		.all())
		found({
			kind: 'notebook',
			id: row.id,
			title: row.title,
			snippet: firstLine(row.description ?? ''),
			href: `/notebooks/${row.id}`
		});

	for (const row of db
		.select({ id: ideas.id, content: ideas.content })
		.from(ideas)
		.where(and(eq(ideas.userId, ctx.userId), matches(ideas.content)))
		.orderBy(desc(ideas.createdAt))
		.limit(PER_KIND)
		.all())
		found({
			kind: 'idea',
			id: row.id,
			title: firstLine(row.content),
			snippet: '',
			href: '/ideas'
		});

	// --- what you have to do ----------------------------------------------------
	for (const row of db
		.select({ id: todoTasks.id, title: todoTasks.title, notes: todoTasks.notes })
		.from(todoTasks)
		.where(
			and(
				eq(todoTasks.userId, ctx.userId),
				or(matches(todoTasks.title), matches(todoTasks.notes ?? sql`''`)),
				scope === null ? undefined : eq(todoTasks.notebookId, scope)
			)
		)
		.limit(PER_KIND)
		.all())
		found({
			kind: 'todo',
			id: row.id,
			title: row.title,
			snippet: firstLine(row.notes ?? ''),
			href: '/tasks/todo'
		});

	for (const row of db
		.select({
			id: recurringTasks.id,
			label: recurringTasks.label,
			startTime: recurringTasks.startTime
		})
		.from(recurringTasks)
		.where(and(eq(recurringTasks.userId, ctx.userId), matches(recurringTasks.label ?? sql`''`)))
		.limit(PER_KIND)
		.all())
		found({
			kind: 'block',
			id: row.id,
			title: row.label || 'Untitled',
			snippet: `every week at ${row.startTime}`,
			href: '/tasks/plan'
		});

	for (const row of db
		.select({
			id: exceptionalTasks.id,
			label: exceptionalTasks.label,
			date: exceptionalTasks.date,
			startTime: exceptionalTasks.startTime
		})
		.from(exceptionalTasks)
		.where(
			and(
				eq(exceptionalTasks.userId, ctx.userId),
				matches(exceptionalTasks.label ?? sql`''`),
				scope === null ? undefined : eq(exceptionalTasks.notebookId, scope)
			)
		)
		.orderBy(desc(exceptionalTasks.date))
		.limit(PER_KIND)
		.all())
		found({
			kind: 'block',
			id: row.id,
			title: row.label || 'Untitled',
			snippet: `${row.date} at ${row.startTime}`,
			href: `/tasks/plan?from=${row.date}`
		});

	// --- what you are aiming at -------------------------------------------------
	for (const row of db
		.select({ id: goals.id, title: goals.title, notes: goals.notes })
		.from(goals)
		.where(
			and(
				eq(goals.userId, ctx.userId),
				or(matches(goals.title), matches(goals.notes ?? sql`''`)),
				scope === null ? undefined : eq(goals.notebookId, scope)
			)
		)
		.limit(PER_KIND)
		.all())
		found({
			kind: 'goal',
			id: row.id,
			title: row.title,
			snippet: firstLine(row.notes ?? ''),
			href: '/goals'
		});

	// --- everything else --------------------------------------------------------
	for (const row of db
		.select({ id: people.id, name: people.name, notes: people.notes })
		.from(people)
		.where(
			and(eq(people.userId, ctx.userId), or(matches(people.name), matches(people.notes ?? sql`''`)))
		)
		.limit(PER_KIND)
		.all())
		found({
			kind: 'person',
			id: row.id,
			title: row.name,
			snippet: firstLine(row.notes ?? ''),
			href: `/notebooks/people?person=${row.id}`
		});

	for (const row of db
		.select({ id: shoppingItems.id, name: shoppingItems.name, notes: shoppingItems.notes })
		.from(shoppingItems)
		.where(
			and(
				eq(shoppingItems.userId, ctx.userId),
				or(matches(shoppingItems.name), matches(shoppingItems.notes ?? sql`''`))
			)
		)
		.limit(PER_KIND)
		.all())
		found({
			kind: 'shopping',
			id: row.id,
			title: row.name,
			snippet: firstLine(row.notes ?? ''),
			href: '/inventory'
		});

	for (const row of db
		.select({ id: activities.id, name: activities.name, description: activities.description })
		.from(activities)
		.where(
			and(
				eq(activities.userId, ctx.userId),
				or(matches(activities.name), matches(activities.description ?? sql`''`))
			)
		)
		.limit(PER_KIND)
		.all())
		found({
			kind: 'activity',
			id: row.id,
			title: row.name,
			snippet: firstLine(row.description ?? ''),
			href: '/tasks/activities'
		});

	return hits;
}

/** The same hits, in the order the kinds are listed, for rendering. */
export function grouped(hits: Hit[]): { kind: SearchKind; label: string; hits: Hit[] }[] {
	return SEARCH_KINDS.map((kind) => ({
		kind,
		label: KIND_LABELS[kind],
		hits: hits.filter((h) => h.kind === kind)
	})).filter((g) => g.hits.length > 0);
}
