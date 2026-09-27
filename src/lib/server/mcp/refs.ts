import type { Ctx } from '$lib/services/ctx.js';
import { NotFoundError } from '$lib/services/errors.js';

import { listActivities } from '$lib/services/activities.js';
import { FLOWS, listBills } from '$lib/services/bills.js';
import { listEveryEntry } from '$lib/services/diary.js';
import { listGoals } from '$lib/services/goals.js';
import { listHabits } from '$lib/services/habits.js';
import { listIdeas } from '$lib/services/ideas.js';
import { occurrenceRow } from '$lib/services/instances.js';
import { listLedgers } from '$lib/services/ledgers.js';
import { listLocations } from '$lib/services/locations.js';
import { listNotebooks } from '$lib/services/notebooks.js';
import { listPeople } from '$lib/services/people.js';
import { listIngredientItems, listRecipes } from '$lib/services/recipes.js';
import { listReminders } from '$lib/services/reminders.js';
import { listCategories as listInventoryCategories, listItems } from '$lib/services/inventory.js';
import { listWeeklySlots } from '$lib/services/slots.js';
import { listRules } from '$lib/services/statements.js';
import { listTagsWithUses } from '$lib/services/tags.js';
import { listTodos } from '$lib/services/todos.js';
import { listSessions, listWorkoutCategories, listWorkouts } from '$lib/services/workouts.js';

/**
 * The kinds of thing a tool can name, and how one is found.
 *
 * Seventy of the tools name something by number. What has kept those numbers
 * inside one account is that every service filters by `user_id` itself, by
 * hand, in each query it writes — eighteen times in `todos.ts` alone. That is
 * a habit, and a habit is not a boundary: one forgotten line is not a bug
 * somebody notices, it is somebody else's week readable over an API.
 *
 * So a kind is defined once, here, as *the rows this ctx can already list*.
 * Finding one means looking among those, which collapses "may I touch this
 * row?" into "can I already see it?" — a question the listing answers, so
 * there is nothing per-tool left to remember. Twenty of the `subject`
 * resolvers already worked exactly this way; this is that pattern promoted
 * from a habit to the rule, and applied to every id the surface takes.
 *
 * It buys a second thing, which is the reason to do it now rather than later:
 * a token confined to one notebook is the same mechanism with a narrower
 * listing. Narrow `rows` once for a kind and every tool that names that kind
 * narrows with it, with nothing to change at seventy call sites.
 *
 * `rows` is the listing; `find` is how one is picked out of it. A kind
 * overrides `find` only where listing everything is not a sensible query — a
 * block's id is resolved against the day's generated records, a workout
 * session's against a query that takes the id — and those finders are scoped
 * to the ctx the same way, which is the only thing that matters here.
 */

type Kind = {
	/** What to call it when one cannot be found, in a sentence for a person. */
	label: string;
	/** Everything of this kind this ctx can reach — the whole of the fence. */
	rows: (ctx: Ctx) => { id: number }[];
	/** Where listing them all is the wrong query, the scoped lookup instead. */
	find?: (ctx: Ctx, id: number) => unknown | null;
};

/** Keeps the names, so `RefKind` is the list; widens the values, so every
 * entry is read as a `Kind` whether or not it overrode `find`. */
const kinds = <T extends Record<string, Kind>>(table: T): { readonly [K in keyof T]: Kind } =>
	Object.freeze(table);

export const KINDS = kinds({
	todo: { label: 'to-do', rows: (ctx) => listTodos(ctx) },
	goal: { label: 'goal', rows: (ctx) => listGoals(ctx, { includeClosed: true }) },
	notebook: { label: 'notebook', rows: (ctx) => listNotebooks(ctx) },
	note: { label: 'note', rows: (ctx) => listEveryEntry(ctx) },
	habit: { label: 'habit', rows: (ctx) => listHabits(ctx) },
	idea: { label: 'idea', rows: (ctx) => listIdeas(ctx) },
	person: { label: 'person', rows: (ctx) => listPeople(ctx) },
	activity: { label: 'activity', rows: (ctx) => listActivities(ctx) },
	reminder: { label: 'reminder', rows: (ctx) => listReminders(ctx, { includePast: true }) },
	repeatingBlock: { label: 'repeating block', rows: (ctx) => listWeeklySlots(ctx) },

	/**
	 * A block on a day, which is a record that may not exist yet.
	 *
	 * The plan is generated: asking for Thursday is what creates Thursday's
	 * rows. So there is no listing of every occurrence to search — the id
	 * carries its own kind (`slot:12`, `exceptional:4`) and is resolved against
	 * the records for the day it names. `rows` is the plan as it stands, which
	 * is what a confinement would narrow; `find` is what resolves a call.
	 */
	block: {
		label: 'block',
		rows: () => [],
		find: (ctx, id) => occurrenceRow(ctx, id)
	},

	item: { label: 'item', rows: (ctx) => listItems(ctx) },
	inventoryCategory: { label: 'category', rows: (ctx) => listInventoryCategories(ctx) },
	recipe: { label: 'recipe', rows: (ctx) => listRecipes(ctx, { includeArchived: true }) },
	/**
	 * An inventory item named as a recipe's ingredient. Keyed by the item's
	 * id, but only items some recipe uses — so a confinement narrows it to the
	 * ingredients of its own recipes rather than to whatever is filed with it.
	 */
	ingredient: { label: 'ingredient', rows: (ctx) => listIngredientItems(ctx) },
	location: { label: 'place', rows: (ctx) => listLocations(ctx) },
	workout: { label: 'exercise', rows: (ctx) => listWorkouts(ctx, { includeArchived: true }) },
	workoutCategory: { label: 'exercise group', rows: (ctx) => listWorkoutCategories(ctx) },

	/**
	 * Sessions are many and a listing is paged, so this asks for the one.
	 * `listSessions` filters by `user_id` before it filters by id, which is the
	 * property that matters.
	 */
	workoutSession: {
		label: 'session',
		rows: (ctx) => listSessions(ctx),
		find: (ctx, id) => listSessions(ctx, { sessionId: id })[0] ?? null
	},

	sortRule: { label: 'sorting rule', rows: (ctx) => listRules(ctx) },

	/** The account's one vocabulary — a label belongs to the account, not to a room. */
	tag: { label: 'label', rows: (ctx) => listTagsWithUses(ctx.userId) },

	ledger: { label: 'account', rows: (ctx) => listLedgers(ctx, { includeArchived: true }) },

	/** Both directions: a bill and a payment coming in are one table. */
	bill: {
		label: 'bill',
		rows: (ctx) => FLOWS.flatMap((flow) => listBills(ctx, { includeArchived: true, flow }))
	}
});

export type RefKind = keyof typeof KINDS;

/**
 * The row a create just made, read back the way any other id is read.
 *
 * An id in an answer has to mean a row that is there. It did not once: a
 * `add_task` answered `{ id: 559 }` and nothing by that number existed a
 * minute later — so the caller labelled its own work, was told the task was
 * not found, and the work was lost with no error anywhere to say so.
 *
 * Whatever the cause, the contract is the fixable part: the same registry
 * that resolves an id somebody passed in resolves the one the app just handed
 * out, and a create that cannot find what it made says so instead of
 * answering with a number.
 */
export function madeRow(ctx: Ctx, kind: RefKind, id: unknown): unknown | null {
	return resolveRef(ctx, { arg: 'id', kind }, { id });
}

/**
 * What a tool declares: this argument names a thing of this kind.
 *
 * `subject` marks the one the call is *about*, which is what the answer reads
 * before and after a write so a wrong call can be undone from the transcript.
 * Only needed where that is not the argument called `id` — a goal's targets
 * are changed by naming the goal as `goalId`, and the goal is the subject.
 */
export type Ref = {
	/**
	 * The argument, or a path into one: `targets[].goalId` is the `goalId` of
	 * every object in the `targets` list, `where.notebookId` a field of an
	 * object. A top-level name is the common case.
	 */
	arg: string;
	kind: RefKind;
	subject?: boolean;
	/**
	 * `0` in this argument means "in none" — `change_task`'s notebookId takes a
	 * task out of its notebook that way — and names no row, so it passes.
	 */
	zeroIsNone?: boolean;
};

/**
 * Where to look for a thing of a given kind.
 *
 * The whole account by default. A key confined to one notebook passes a
 * narrower one — see `confinement.ts` — and answers null for a kind that has
 * no meaning inside it, which refuses rather than narrows.
 */
export type Reach = (kind: RefKind, ctx: Ctx) => { id: number }[] | null;

/**
 * Every value a ref's path reaches in the arguments — one for a plain
 * argument, one per element for a list or a path through `[]`.
 */
export function valuesAt(args: unknown, path: string): unknown[] {
	let here: unknown[] = [args];
	for (const step of path.split('.')) {
		const many = step.endsWith('[]');
		const key = many ? step.slice(0, -2) : step;
		here = here.flatMap((one) => {
			if (!one || typeof one !== 'object' || Array.isArray(one)) return [];
			const next = (one as Record<string, unknown>)[key];
			return many ? (Array.isArray(next) ? next : []) : [next];
		});
	}
	// A list at the end of the path is a list of ids.
	return here.flatMap((one) => (Array.isArray(one) ? one : [one]));
}

/** Sets every place a ref's path reaches — used to pin a confined argument. */
export function setAt(args: Record<string, unknown>, path: string, value: unknown): void {
	if (!path.includes('.') && !path.includes('[]')) {
		args[path] = value;
		return;
	}
	const steps = path.split('.');
	const last = steps.pop()!;
	let here: unknown[] = [args];
	for (const step of steps) {
		const many = step.endsWith('[]');
		const key = many ? step.slice(0, -2) : step;
		here = here.flatMap((one) => {
			if (!one || typeof one !== 'object' || Array.isArray(one)) return [];
			const next = (one as Record<string, unknown>)[key];
			return many ? (Array.isArray(next) ? next : []) : [next];
		});
	}
	for (const one of here)
		if (one && typeof one === 'object' && !Array.isArray(one))
			(one as Record<string, unknown>)[last] = value;
}

/** Absent is not the same as wrong: an optional argument left out is fine. */
function given(raw: unknown): boolean {
	return raw !== undefined && raw !== null && raw !== '';
}

/**
 * The thing an argument names, or null.
 *
 * Null for an id that is nobody's and null for an id that is somebody else's —
 * deliberately the same answer. A refusal that told the two apart would be a
 * way to ask whether a number exists, one number at a time, which is the
 * question the whole arrangement exists to refuse.
 */
export function resolveRef(
	ctx: Ctx,
	ref: Ref,
	args: Record<string, unknown>,
	reach?: Reach
): unknown | null {
	const raw = args[ref.arg];
	if (!given(raw)) return null;

	const kind = KINDS[ref.kind];

	// A block's id is a string with its kind on the front; every other kind
	// counts, and a number that is not a whole number names nothing. The
	// dedicated finders are only ever reached by an unconfined caller: a
	// confinement that does not contain the kind has already refused the call.
	if (kind.find && !reach) {
		const id = Number(raw);
		try {
			return kind.find(ctx, Number.isInteger(id) ? id : (raw as number)) ?? null;
		} catch {
			// The older scoped getters answer a bad id by throwing. Same answer.
			return null;
		}
	}

	const id = Number(raw);
	if (!Number.isInteger(id)) return null;

	const rows = reach ? reach(ref.kind, ctx) : kind.rows(ctx);
	return rows?.find((row) => row.id === id) ?? null;
}

/**
 * Every id a tool was given belongs to whoever is calling — or it never runs.
 *
 * Called once, at the single point where a tool is dispatched, so a tool
 * cannot be written that skips it. What reaches `run` afterwards is an id that
 * has been seen in this account's own listing.
 */
export function assertRefs(
	ctx: Ctx,
	refs: readonly Ref[] | undefined,
	args: Record<string, unknown>,
	reach?: Reach
): void {
	/*
	 * Each kind is listed once per call, not once per id: a list of fifty
	 * todos is one listing and fifty lookups in a set, where it was fifty
	 * listings of every todo the account has.
	 */
	const listed = new Map<RefKind, Set<number> | null>();
	const idsOf = (kind: RefKind): Set<number> | null => {
		if (!listed.has(kind)) {
			const rows = reach ? reach(kind, ctx) : KINDS[kind].rows(ctx);
			listed.set(kind, rows ? new Set(rows.map((row) => row.id)) : null);
		}
		return listed.get(kind)!;
	};

	for (const ref of refs ?? []) {
		const kind = KINDS[ref.kind];
		// A few arguments take a list — the todos being hung on a goal — and a
		// few sit inside an object. Every one of them is an id like any other,
		// and one foreign id in a list of twenty is precisely the call that
		// would otherwise go unnoticed.
		for (const one of new Set(valuesAt(args, ref.arg))) {
			if (!given(one)) continue;
			if (ref.zeroIsNone && (one === 0 || one === '0')) continue;
			// The same two paths `resolveRef` takes, with the listing kept.
			const found =
				kind.find && !reach
					? resolveRef(ctx, { ...ref, arg: 'id' }, { id: one }) !== null
					: Number.isInteger(Number(one)) && (idsOf(ref.kind)?.has(Number(one)) ?? false);
			if (!found) throw new NotFoundError(kind.label);
		}
	}
}

/**
 * What an id-shaped argument name looks like, in either spelling the surface
 * uses: `id`, `ids`, `goalId`, `todoIds`, `ledger_id`, `parent_id`.
 */
export const ID_ARGUMENT = /^(id|ids|[a-z]+Ids?|[a-z_]+_ids?)$/;

type SchemaNode = {
	type?: string | string[];
	description?: string;
	properties?: Record<string, SchemaNode>;
	items?: SchemaNode;
};

/**
 * Every argument of a schema that reads as naming a thing, with its path.
 *
 * Derived rather than listed, so an argument written tomorrow is caught by
 * what it is, not by somebody remembering to add it. Something reads as a
 * reference when its name is id-shaped, or when it is a whole number (or a
 * list of them) whose description calls it an id or sends the reader to a
 * listing tool for it — "from `locations`", "as `ledgers` gives it". That
 * second half is what catches a name like `ranOutOf`, which is a list of item
 * ids that no spelling rule would have seen. Nested objects and lists of
 * objects are walked, and their paths are what a `Ref` declares.
 */
export function referenceLike(input: unknown, toolNames: ReadonlySet<string>): string[] {
	const found: string[] = [];
	const points = (text: string) =>
		/\bids?\b/i.test(text) ||
		[...text.matchAll(/`([a-z_]+)`/g)].some(
			([, name]) => toolNames.has(name) && new RegExp(`(from|as|by) \`${name}\``, 'i').test(text)
		);
	const isInteger = (node: SchemaNode | undefined) =>
		node?.type === 'integer' || (Array.isArray(node?.type) && node.type.includes('integer'));

	const walk = (node: SchemaNode | undefined, path: string) => {
		for (const [name, child] of Object.entries(node?.properties ?? {})) {
			const at = path ? `${path}.${name}` : name;
			const whole = isInteger(child) || (child.type === 'array' && isInteger(child.items));
			if (ID_ARGUMENT.test(name) || (whole && points(child.description ?? ''))) found.push(at);
			if (child.type === 'object') walk(child, at);
			if (child.type === 'array' && child.items?.type === 'object') walk(child.items, `${at}[]`);
		}
	};
	walk(input as SchemaNode, '');
	return found;
}
