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
import { listRecipes } from '$lib/services/recipes.js';
import { listReminders } from '$lib/services/reminders.js';
import { listCategories as listShoppingCategories, listItems } from '$lib/services/shopping.js';
import { listWeeklySlots } from '$lib/services/slots.js';
import { listRules } from '$lib/services/statements.js';
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
	shoppingCategory: { label: 'category', rows: (ctx) => listShoppingCategories(ctx) },
	recipe: { label: 'recipe', rows: (ctx) => listRecipes(ctx, { includeArchived: true }) },
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
	ledger: { label: 'account', rows: (ctx) => listLedgers(ctx, { includeArchived: true }) },

	/** Both directions: a bill and a payment coming in are one table. */
	bill: {
		label: 'bill',
		rows: (ctx) => FLOWS.flatMap((flow) => listBills(ctx, { includeArchived: true, flow }))
	}
});

export type RefKind = keyof typeof KINDS;

/**
 * What a tool declares: this argument names a thing of this kind.
 *
 * `subject` marks the one the call is *about*, which is what the answer reads
 * before and after a write so a wrong call can be undone from the transcript.
 * Only needed where that is not the argument called `id` — a goal's targets
 * are changed by naming the goal as `goalId`, and the goal is the subject.
 */
export type Ref = { arg: string; kind: RefKind; subject?: boolean };

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
export function resolveRef(ctx: Ctx, ref: Ref, args: Record<string, unknown>): unknown | null {
	const raw = args[ref.arg];
	if (!given(raw)) return null;

	const kind = KINDS[ref.kind];

	// A block's id is a string with its kind on the front; every other kind
	// counts, and a number that is not a whole number names nothing.
	if (kind.find) {
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
	return kind.rows(ctx).find((row) => row.id === id) ?? null;
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
	args: Record<string, unknown>
): void {
	for (const ref of refs ?? []) {
		const raw = args[ref.arg];
		if (!given(raw)) continue;

		// A few arguments take a list — the todos being hung on a goal. Every one
		// of them is an id like any other, and one foreign id in a list of twenty
		// is precisely the call that would otherwise go unnoticed.
		const each = Array.isArray(raw) ? raw : [raw];
		for (const one of each)
			if (given(one) && resolveRef(ctx, ref, { [ref.arg]: one }) === null)
				throw new NotFoundError(KINDS[ref.kind].label);
	}
}

/**
 * What an id-shaped argument looks like.
 *
 * Here so the guard test can ask "does this tool take an id it has not
 * declared?" without a list somebody maintains by hand: a new argument called
 * `recipeId` fails the guard on the day it is written.
 */
export const ID_ARGUMENT = /^(id|ids|[a-z]+Ids?)$/;
