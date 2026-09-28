import type { PlainKey } from './i18n/keys.js';
import type { NotebookModule } from './notebook-modules.js';
import { NOTE_ORDERS } from './note-order.js';

/**
 * What a home-screen widget can show of a notebook.
 *
 * One tab of one notebook — its tasks, its notes, its shopping — narrowed and
 * ordered the way that tab's own list can be. The widget on the phone, the
 * settings screen that edits it and the API that answers it all read this
 * table, so a choice offered in one is a choice understood by the others.
 *
 * Not every module is here. A widget is a list of lines, and a ledger or a
 * habit heatmap is not; the ones below are the tabs whose rows are already
 * lines.
 */
export const WIDGET_SECTIONS = {
	notes: {
		statuses: ['open', 'pinned', 'archived', 'all'],
		orders: NOTE_ORDERS,
		tags: true
	},
	tasks: {
		statuses: ['open', 'done', 'all'],
		// The Tasks tab's own orders — see `TodoRows`.
		orders: ['created', 'tagged', 'done', 'priority'],
		tags: true
	},
	goals: {
		statuses: ['open', 'closed', 'all'],
		orders: ['period', 'title'],
		tags: false
	},
	ideas: {
		statuses: ['all', 'favourites', 'applied', 'unapplied'],
		orders: ['created', 'title'],
		tags: true
	},
	inventory: {
		statuses: ['all', 'toBuy', 'bought'],
		orders: ['name', 'created'],
		tags: false
	}
} as const satisfies Partial<
	Record<NotebookModule, { statuses: readonly string[]; orders: readonly string[]; tags: boolean }>
>;

export type WidgetSection = keyof typeof WIDGET_SECTIONS;
export const WIDGET_SECTION_IDS = Object.keys(WIDGET_SECTIONS) as WidgetSection[];

export const WIDGET_DIRECTIONS = ['asc', 'desc'] as const;
export type WidgetDirection = (typeof WIDGET_DIRECTIONS)[number];

/** How many lines one answer carries. A home screen shows fewer than this. */
export const WIDGET_ITEM_LIMIT = 30;
/** The most a caller may ask for, so a plugin cannot turn this into an export. */
export const WIDGET_ITEM_CEILING = 100;

/** A tag names at most this much. The same ceiling the tag vocabulary has. */
export const WIDGET_TAG_MAX = 60;

/**
 * The handoff between an instance and the phone, which are two origins.
 *
 * The instance mints the widget's key; only the copy of the app the phone
 * carries can hand it to the shell. So the instance navigates to
 * `DEVICE_ORIGIN + WIDGET_HANDOFF_PATH` with these in the address, the same
 * way the reminders key travels through `/ring`.
 */
export const WIDGET_HANDOFF_PATH = '/widget';
export const HANDOFF_AT = 'at';
export const HANDOFF_KEY = 'key';
export const HANDOFF_SLOT = 'slot';
export const HANDOFF_WIDGET = 'widget';

/** Where a phone's widget sends somebody to set it up, on their instance. */
export const WIDGET_SETUP_PATH = '/settings/integrations/widget';

/** The query string a notebook page reads to open on a tab, and on one thing in it. */
export const TAB_PARAM = 'tab';
export const ITEM_PARAM = 'item';

export type WidgetQuery = {
	section: WidgetSection;
	status: string;
	order: string;
	direction: WidgetDirection;
	tag: string | null;
	limit: number;
};

export function isWidgetSection(value: unknown): value is WidgetSection {
	return typeof value === 'string' && Object.hasOwn(WIDGET_SECTIONS, value);
}

/** The newest of a list reads first; a name reads from A. */
export function defaultDirection(order: string): WidgetDirection {
	return order === 'title' || order === 'name' || order === 'period' || order === 'written'
		? 'asc'
		: 'desc';
}

/**
 * A query read off a request or a form, with every part checked against the
 * section it is for. Anything the section does not offer falls back to its
 * first choice rather than failing: a widget must keep drawing something.
 */
export function widgetQuery(
	section: WidgetSection,
	raw: { status?: unknown; order?: unknown; direction?: unknown; tag?: unknown; limit?: unknown }
): WidgetQuery {
	const offer = WIDGET_SECTIONS[section];
	const pick = <T extends string>(value: unknown, from: readonly T[]): T =>
		typeof value === 'string' && (from as readonly string[]).includes(value)
			? (value as T)
			: from[0];

	const status = pick(raw.status, offer.statuses);
	const order = pick(raw.order, offer.orders);
	const direction =
		typeof raw.direction === 'string' &&
		(WIDGET_DIRECTIONS as readonly string[]).includes(raw.direction)
			? (raw.direction as WidgetDirection)
			: defaultDirection(order);

	const tagged = typeof raw.tag === 'string' ? raw.tag.trim().toLowerCase() : '';
	const tag = offer.tags && tagged !== '' ? tagged.slice(0, WIDGET_TAG_MAX) : null;

	const asked = Number(raw.limit);
	const limit =
		Number.isInteger(asked) && asked > 0 ? Math.min(asked, WIDGET_ITEM_CEILING) : WIDGET_ITEM_LIMIT;

	return { section, status, order, direction, tag, limit };
}

/** A notebook's page, opened on one tab — and, when given, on one thing in it. */
export function notebookTabHref(notebookId: number, section: string, itemId?: number): string {
	const query = new URLSearchParams({ [TAB_PARAM]: section });
	if (itemId !== undefined) query.set(ITEM_PARAM, String(itemId));
	return `/notebooks/${notebookId}?${query}`;
}

/** What each choice is called on screen. */
export const STATUS_LABELS: Record<string, PlainKey> = {
	open: 'widgets.statusOpen',
	pinned: 'widgets.statusPinned',
	archived: 'widgets.statusArchived',
	all: 'widgets.statusAll',
	done: 'widgets.statusDone',
	closed: 'widgets.statusClosed',
	favourites: 'widgets.statusFavourites',
	applied: 'widgets.statusApplied',
	unapplied: 'widgets.statusUnapplied',
	toBuy: 'widgets.statusToBuy',
	bought: 'widgets.statusBought'
};

export const ORDER_LABELS: Record<string, PlainKey> = {
	written: 'notebookDetail.orderWritten',
	title: 'notebookDetail.orderTitle',
	edited: 'notebookDetail.orderEdited',
	created: 'todoRows.added',
	tagged: 'todoRows.tagged',
	done: 'todoRows.done',
	priority: 'todoRows.priority',
	period: 'widgets.orderPeriod',
	name: 'widgets.orderName'
};

export const DIRECTION_LABELS: Record<WidgetDirection, PlainKey> = {
	asc: 'widgets.directionAsc',
	desc: 'widgets.directionDesc'
};
