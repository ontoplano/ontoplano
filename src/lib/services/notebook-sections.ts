import type { Ctx } from './ctx.js';
import { entriesOf, getNotebook } from './notebooks.js';
import { listTodosIn } from './todos.js';
import { listGoals } from './goals.js';
import { listIdeas } from './ideas.js';
import { listItems } from './inventory.js';
import { orderNotes, sortTitle } from '../note-order.js';
import { compareByPriority } from '../ratings.js';
import { CLOSED_STATUSES } from '../task-status.js';
import { notebookTabHref, type WidgetQuery, type WidgetSection } from '../notebook-widget.js';

/**
 * One tab of one notebook, as lines.
 *
 * What a home-screen widget draws, and what `/api/v1/notebooks/:id/:section`
 * answers: each row is the tab's own row — read through the same list function
 * the tab is drawn from — reduced to what fits on a line, filtered and ordered
 * by the choices `$lib/notebook-widget` offers for that tab.
 */
export type SectionItem = {
	id: number;
	title: string;
	/** A short figure beside the title — a quantity, a progress — or nothing. */
	detail: string | null;
	/** Finished, closed or bought: drawn dimmed rather than left out. */
	done: boolean;
	/** Where pressing it goes, inside the app. */
	href: string;
};

export type SectionAnswer = {
	notebook: { id: number; title: string };
	section: WidgetSection;
	/** The tab itself, for a header that opens it. */
	href: string;
	/** How many lines matched, before `limit` cut the list. */
	total: number;
	items: SectionItem[];
};

type Row = SectionItem & { sort: string | number; tie: number };

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function firstLine(text: string): string {
	return (text.trim().split('\n', 1)[0] ?? '').trim();
}

function hasTag(tags: readonly { name: string }[], tag: string | null): boolean {
	return tag === null || tags.some((one) => one.name.toLowerCase() === tag);
}

/** Sort by a key, then by id so equals never swap between two refreshes. */
function byKey(rows: Row[], direction: 'asc' | 'desc'): Row[] {
	const sign = direction === 'desc' ? -1 : 1;
	return [...rows].sort((a, b) => {
		const by =
			typeof a.sort === 'number' && typeof b.sort === 'number'
				? a.sort - b.sort
				: collator.compare(String(a.sort), String(b.sort));
		return by !== 0 ? sign * by : a.tie - b.tie;
	});
}

function notes(ctx: Ctx, notebookId: number, q: WidgetQuery): SectionItem[] {
	const chosen = entriesOf(ctx, notebookId).filter((entry) => {
		if (!hasTag(entry.tags, q.tag)) return false;
		if (q.status === 'open') return entry.archivedAt === null;
		if (q.status === 'pinned') return entry.pinnedAt !== null && entry.archivedAt === null;
		if (q.status === 'archived') return entry.archivedAt !== null;
		return true;
	});
	// The Notes tab's own ordering, pinned ones first, from the same module.
	return orderNotes(chosen, q.order as 'written' | 'title' | 'edited', q.direction).map(
		(entry) => ({
			id: entry.id,
			title: sortTitle(entry),
			detail: entry.forDate ?? null,
			done: entry.archivedAt !== null,
			href: notebookTabHref(notebookId, 'notes', entry.id)
		})
	);
}

function tasks(ctx: Ctx, notebookId: number, q: WidgetQuery): SectionItem[] {
	const chosen = listTodosIn(ctx, notebookId).filter((todo) => {
		if (todo.archivedAt !== null) return false;
		if (!hasTag(todo.tags, q.tag)) return false;
		const closed = CLOSED_STATUSES.includes(todo.status);
		if (q.status === 'open') return !closed;
		if (q.status === 'done') return closed;
		return true;
	});

	let ordered: typeof chosen;
	if (q.order === 'priority') {
		ordered = [...chosen].sort(compareByPriority);
		if (q.direction === 'asc') ordered.reverse();
	} else {
		const key = (todo: (typeof chosen)[number]): string =>
			q.order === 'done'
				? (todo.completedAt ?? '')
				: q.order === 'tagged'
					? todo.tags.reduce((newest, one) => {
							const at = one.taggedAt ?? '';
							return at > newest ? at : newest;
						}, '')
					: todo.createdAt;
		ordered = [...chosen].sort((a, b) => {
			const by = key(a).localeCompare(key(b));
			return (q.direction === 'desc' ? -by : by) || a.id - b.id;
		});
	}

	return ordered.map((todo) => ({
		id: todo.id,
		title: todo.title,
		detail: todo.scheduledDate,
		done: CLOSED_STATUSES.includes(todo.status),
		href: notebookTabHref(notebookId, 'tasks', todo.id)
	}));
}

function goals(ctx: Ctx, notebookId: number, q: WidgetQuery): SectionItem[] {
	const rows = listGoals(ctx, { includeClosed: true, notebookId })
		.filter((goal) =>
			q.status === 'open'
				? goal.status === 'open'
				: q.status === 'closed'
					? goal.status !== 'open'
					: true
		)
		.map(
			(goal): Row => ({
				id: goal.id,
				title: goal.title,
				detail:
					goal.progress.fraction === null ? null : `${Math.round(goal.progress.fraction * 100)}%`,
				done: goal.status !== 'open',
				href: notebookTabHref(notebookId, 'goals', goal.id),
				sort: q.order === 'title' ? goal.title : goal.periodStart,
				tie: goal.id
			})
		);
	return byKey(rows, q.direction);
}

function ideas(ctx: Ctx, notebookId: number, q: WidgetQuery): SectionItem[] {
	const rows = listIdeas(ctx, { notebookId })
		.filter((idea) => {
			if (!hasTag(idea.tags, q.tag)) return false;
			if (q.status === 'favourites') return idea.favorite;
			if (q.status === 'applied') return idea.isApplied;
			if (q.status === 'unapplied') return !idea.isApplied;
			return true;
		})
		.map(
			(idea): Row => ({
				id: idea.id,
				title: firstLine(idea.content),
				detail: null,
				done: idea.isApplied,
				href: notebookTabHref(notebookId, 'ideas', idea.id),
				sort: q.order === 'title' ? firstLine(idea.content) : idea.createdAt,
				tie: idea.id
			})
		);
	return byKey(rows, q.direction);
}

function inventory(ctx: Ctx, notebookId: number, q: WidgetQuery): SectionItem[] {
	const rows = listItems(ctx, { notebookId })
		.filter((item) =>
			q.status === 'toBuy' ? !item.bought : q.status === 'bought' ? item.bought : true
		)
		.map(
			(item): Row => ({
				id: item.id,
				title: item.name,
				detail: item.idealQty ? `${item.qty}/${item.idealQty}` : item.qty ? String(item.qty) : null,
				done: item.bought,
				href: notebookTabHref(notebookId, 'inventory', item.id),
				sort: q.order === 'name' ? item.name : item.createdAt,
				tie: item.id
			})
		);
	return byKey(rows, q.direction);
}

const READERS: Record<
	WidgetSection,
	(ctx: Ctx, notebookId: number, q: WidgetQuery) => SectionItem[]
> = { notes, tasks, goals, ideas, inventory };

/**
 * The lines of one tab, or a `NotFoundError` for a notebook this account
 * cannot reach — somebody else's and one that does not exist answer alike.
 */
export function sectionItems(ctx: Ctx, notebookId: number, q: WidgetQuery): SectionAnswer {
	const notebook = getNotebook(ctx, notebookId);
	const all = READERS[q.section](ctx, notebookId, q);
	return {
		notebook: { id: notebook.id, title: notebook.title },
		section: q.section,
		href: notebookTabHref(notebookId, q.section),
		total: all.length,
		items: all.slice(0, q.limit).map(({ id, title, detail, done, href }) => ({
			id,
			title,
			detail,
			done,
			href
		}))
	};
}
