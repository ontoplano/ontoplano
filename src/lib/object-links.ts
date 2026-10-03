/**
 * Where a thing opens, for anything that points at one: a notification, a
 * receipt, a link in a log.
 *
 * One table, because a notification you cannot follow to its object is one
 * you have to act on twice — and the rooms grew one at a time, so each sender
 * used to pick a page by itself and most picked the room's front door. Every
 * kind the assistants can touch has an entry (`tests/object-links.test.ts`
 * holds that against `KINDS` in `$lib/server/mcp/refs`), so a kind added later
 * fails a test until it says where it opens.
 *
 * `edit` rooms open the thing's own editor through `$lib/open-from-url`; the
 * rest lead to the page the thing is drawn on.
 */
import { EDIT_PARAM } from './open-from-url-param.js';

/** What a link can be built from: the thing's kind and its id. */
export type ObjectRef = { kind: string; id: number | string | null };

type Opens = {
	/** The page it lives on. */
	room: string;
	/** How the room is asked to open one: `edit` (the default editor), another param, or a path. */
	by?: 'edit' | 'path' | { param: string };
};

/** Every kind a link can name, and where it opens. */
export const OBJECT_ROOMS = {
	todo: { room: '/tasks/todo', by: 'edit' },
	goal: { room: '/goals', by: 'edit' },
	goalArea: { room: '/goals' },
	notebook: { room: '/notebooks', by: 'path' },
	note: { room: '/notebooks/diary', by: 'edit' },
	habit: { room: '/health/habits', by: 'edit' },
	idea: { room: '/notebooks/ideas', by: 'edit' },
	person: { room: '/notebooks/people', by: { param: 'person' } },
	activity: { room: '/tasks/activities', by: 'edit' },
	reminder: { room: '/reminders' },
	repeatingBlock: { room: '/tasks/plan' },
	block: { room: '/tasks/plan' },
	item: { room: '/inventory/stock', by: 'edit' },
	inventoryCategory: { room: '/inventory/stock' },
	recipe: { room: '/health/recipes', by: 'edit' },
	ingredient: { room: '/inventory/stock', by: 'edit' },
	location: { room: '/inventory/stock' },
	workout: { room: '/health/workouts', by: 'edit' },
	workoutCategory: { room: '/health/workouts' },
	workoutSession: { room: '/health/workouts' },
	sortRule: { room: '/finance/rules' },
	recording: { room: '/media/audio' },
	tag: { room: '/notebooks/tags' },
	ledger: { room: '/finance/ledgers' },
	movement: { room: '/finance/ledgers' },
	bill: { room: '/finance/bills', by: 'edit' }
} as const satisfies Record<string, Opens>;

export type ObjectKind = keyof typeof OBJECT_ROOMS;

export function isObjectKind(kind: string): kind is ObjectKind {
	return Object.hasOwn(OBJECT_ROOMS, kind);
}

/**
 * The address that opens one thing — its editor where its room has one, the
 * room otherwise. A kind nobody has taught this about yet gets null rather
 * than a guess, so the caller falls back to something it chose.
 */
export function linkTo(ref: ObjectRef): string | null {
	if (!isObjectKind(ref.kind)) return null;
	const opens: Opens = OBJECT_ROOMS[ref.kind];
	const id = ref.id;
	const numeric = typeof id === 'number' && Number.isInteger(id) && id > 0;
	if (!numeric || !opens.by) return opens.room;
	if (opens.by === 'path') return `${opens.room}/${id}`;
	const param = opens.by === 'edit' ? EDIT_PARAM : opens.by.param;
	return `${opens.room}?${param}=${id}`;
}
