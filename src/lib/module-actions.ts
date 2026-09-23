import { actionsFor } from './scoped-actions.js';

/**
 * What each module's rows can be asked to do, and where they post.
 *
 * A module's list is drawn in two places now — its own room, and the tab for
 * it inside a notebook — by one component. The two routes cannot share action
 * names: a notebook page already answers to `create`, `update` and `delete`
 * for the notebook itself. So each module has two sets, and the component is
 * handed the one for the screen it is on.
 *
 * That is the shape `$lib/todo-actions` already had for one module, written
 * out by hand twice. Here both sets come from one list of verbs, and
 * `$lib/services/scoped-actions` mounts the handlers under the same rule — so
 * a form and its handler cannot drift, which is the failure this replaces: a
 * post to an action nobody defined fails at runtime with nothing to read.
 *
 * The verbs are the names the rooms already answer to. Renaming a room's
 * actions to make this list tidier would be churn in markup nobody is confused
 * by; Ledgers is the one exception, below, and says why.
 */

export const IDEA_VERBS = [
	'create',
	'update',
	'delete',
	'toggleApplied',
	'updateAppliedNote',
	'toggleFavorite'
] as const;

export const INVENTORY_VERBS = [
	'create',
	'update',
	'delete',
	'setQty',
	'toggleBought',
	'paid',
	'restock',
	'setFields',
	'toggleSnoozed'
] as const;

export const LEDGER_VERBS = ['create', 'update', 'move', 'archive', 'delete'] as const;

export const BILL_VERBS = [
	'create',
	'update',
	'pay',
	'payFromMovement',
	'unpay',
	'archive',
	'delete'
] as const;

export const HABIT_VERBS = [
	'create',
	'update',
	'delete',
	'logOccurrence',
	'toggleOccurrence',
	'updateOccurrence',
	'deleteOccurrence'
] as const;

export const WORKOUT_VERBS = [
	'create',
	'update',
	'done',
	'log',
	'updateSession',
	'deleteSession',
	'schedule',
	'archive',
	'delete'
] as const;

export const RECIPE_VERBS = ['create', 'update', 'cooked', 'schedule', 'setArchived'] as const;

/**
 * On the module's own room, where the plain names are free.
 *
 * Ledgers is written out rather than derived: its room has answered to
 * `createLedger` and `deleteLedger` since before it shared anything, and those
 * names are in its markup. The verbs above are what the handlers are called;
 * this is what that room's forms post to.
 */
export const ROOM_ACTIONS = {
	ideas: actionsFor(IDEA_VERBS),
	inventory: actionsFor(INVENTORY_VERBS),
	ledgers: {
		create: '?/createLedger',
		update: '?/updateLedger',
		move: '?/moveLedger',
		archive: '?/archiveLedger',
		delete: '?/deleteLedger'
	} as Record<(typeof LEDGER_VERBS)[number], string>,
	bills: actionsFor(BILL_VERBS),
	habits: actionsFor(HABIT_VERBS),
	workouts: actionsFor(WORKOUT_VERBS),
	recipes: actionsFor(RECIPE_VERBS)
};

/** Inside a notebook, where the plain names belong to the notebook. */
export const NOTEBOOK_ACTIONS = {
	ideas: actionsFor(IDEA_VERBS, 'idea'),
	inventory: actionsFor(INVENTORY_VERBS, 'item'),
	ledgers: actionsFor(LEDGER_VERBS, 'ledger'),
	bills: actionsFor(BILL_VERBS, 'bill'),
	habits: actionsFor(HABIT_VERBS, 'habit'),
	workouts: actionsFor(WORKOUT_VERBS, 'workout'),
	recipes: actionsFor(RECIPE_VERBS, 'recipe')
};
