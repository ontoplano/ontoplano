import { resolve } from '$app/paths';

import type { PlainKey } from './i18n/keys.js';
import type { IconName } from './components/Icon.svelte';
import { NOTEBOOK_ACTIONS } from './module-actions.js';
import type { NotebookModule } from './notebook-modules.js';

/**
 * What each module looks like inside a notebook, and what can be done to it.
 *
 * A notebook's tab for a module is that module's room looking at one subject.
 * It has to do the real work — tick the thing bought, pay the bill, write the
 * session down — or it is a list of links pretending to be a feature. What it
 * must not do is become a second implementation of seven rooms: that is how
 * two screens start disagreeing about what a row is.
 *
 * So the rows and the editors are described here rather than drawn seven
 * times. `ModuleTab.svelte` is the only markup, which is what makes the
 * paddings, the hierarchy and the shape of every editor the same — and adding
 * a field to one of them is a line in this file, not a new screen.
 *
 * What each module owns:
 *
 *  - `rowOf` turns its row into the three things a line needs: a name, some
 *    facts beside it, and whether it is finished with.
 *  - `fields` is its editor, as spans on the same twelve-column grid every
 *    other form in the app uses.
 *  - `mark` is its characteristic verb — the one thing you came to the tab to
 *    press — and `open` is where the row lives when you want the whole room.
 *
 * The action names come from `$lib/module-actions`, which derives them from
 * the same verb lists the handlers are mounted under.
 */

/** One control in a module's editor. Spans are the grid's, so forms line up. */
export type ModuleField =
	| { kind: 'text'; name: string; label: PlainKey; span?: Span; required?: true }
	| { kind: 'textarea'; name: string; label: PlainKey; rows?: number }
	| { kind: 'number'; name: string; label: PlainKey; span?: Span; min?: number; max?: number }
	| { kind: 'money'; name: string; label: PlainKey; span?: Span }
	| {
			kind: 'select';
			name: string;
			label: PlainKey;
			span?: Span;
			/** A fixed list of values, each with the message key that names it. */
			options?: { value: string; label: PlainKey }[];
			/** Or a list the page loaded — the account's own sections and kinds. */
			from?: 'inventoryCategories' | 'workoutCategories';
			/** Whether "none" is an answer. */
			blank?: PlainKey;
	  };

type Span = 3 | 4 | 6 | 8 | 12;

/** A row, reduced to what a line shows. */
export type ModuleRow = {
	id: number;
	title: string;
	/** Facts beside the name, already in words. Empty ones are dropped. */
	meta: string[];
	/** Finished, archived, bought — whatever "not outstanding" means here. */
	done: boolean;
};

export type ModuleSpec = {
	/** The button above the list. */
	newLabel: PlainKey;
	/** Nothing here yet, in this module's words. */
	empty: PlainKey;
	fields: ModuleField[];
	/** The one verb the tab is for, pressed on a row. */
	mark?: { action: string; icon: IconName; label: PlainKey; undo?: PlainKey };
	/** Put away rather than delete, where the module has one. */
	archive?: { action: string; field: string };
	remove?: string;
	create: string;
	update: string;
	/** Where the row lives, for "open where it lives". */
	room: (row: { id: number }) => string;
};

const ITEM_TYPES: { value: string; label: PlainKey }[] = [
	{ value: 'replenish', label: 'notebooks.fields.replenish' },
	{ value: 'someday', label: 'notebooks.fields.someday' }
];

const LEDGER_KINDS: { value: string; label: PlainKey }[] = [
	{ value: 'bank', label: 'notebooks.fields.bank' },
	{ value: 'card', label: 'notebooks.fields.card' },
	{ value: 'cash', label: 'notebooks.fields.cash' },
	{ value: 'other', label: 'notebooks.fields.other' }
];

export const MODULE_SPECS: Partial<Record<NotebookModule, ModuleSpec>> = {
	inventory: {
		newLabel: 'notebooks.newItem',
		empty: 'notebooks.nothingUnderThisSubjectYet',
		create: NOTEBOOK_ACTIONS.inventory.create,
		update: NOTEBOOK_ACTIONS.inventory.update,
		remove: NOTEBOOK_ACTIONS.inventory.delete,
		mark: {
			action: NOTEBOOK_ACTIONS.inventory.toggleBought,
			icon: 'check',
			label: 'notebooks.marks.bought',
			undo: 'notebooks.marks.ranOut'
		},
		fields: [
			{ kind: 'text', name: 'label', label: 'notebooks.fields.whatItIs', span: 8, required: true },
			{
				kind: 'select',
				name: 'type',
				label: 'notebooks.fields.kind',
				span: 4,
				options: ITEM_TYPES
			},
			{
				kind: 'select',
				name: 'inventoryCategoryId',
				label: 'notebooks.fields.section',
				span: 6,
				from: 'inventoryCategories',
				blank: 'notebooks.fields.noSection'
			},
			{
				kind: 'number',
				name: 'idealQty',
				label: 'notebooks.fields.howManyYouKeep',
				span: 3,
				min: 0
			},
			{ kind: 'money', name: 'price', label: 'notebooks.fields.aboutWhat', span: 3 },
			{ kind: 'textarea', name: 'notes', label: 'notebooks.fields.notes', rows: 2 }
		],
		room: () => resolve('/inventory')
	},

	ledgers: {
		newLabel: 'notebooks.newLedger',
		empty: 'notebooks.nothingUnderThisSubjectYet',
		create: NOTEBOOK_ACTIONS.ledgers.create,
		update: NOTEBOOK_ACTIONS.ledgers.update,
		remove: NOTEBOOK_ACTIONS.ledgers.delete,
		archive: { action: NOTEBOOK_ACTIONS.ledgers.archive, field: 'archived' },
		fields: [
			{ kind: 'text', name: 'heading', label: 'notebooks.fields.name', span: 8, required: true },
			{
				kind: 'select',
				name: 'kind',
				label: 'notebooks.fields.kind',
				span: 4,
				options: LEDGER_KINDS
			}
		],
		room: (row) => `${resolve('/finance/ledgers')}?ledger=${row.id}`
	},

	workouts: {
		newLabel: 'notebooks.newWorkout',
		empty: 'notebooks.nothingUnderThisSubjectYet',
		create: NOTEBOOK_ACTIONS.workouts.create,
		update: NOTEBOOK_ACTIONS.workouts.update,
		remove: NOTEBOOK_ACTIONS.workouts.delete,
		archive: { action: NOTEBOOK_ACTIONS.workouts.archive, field: 'archived' },
		mark: {
			action: NOTEBOOK_ACTIONS.workouts.done,
			icon: 'check',
			label: 'notebooks.marks.doneToday'
		},
		fields: [
			{ kind: 'text', name: 'heading', label: 'notebooks.fields.name', span: 8, required: true },
			{
				kind: 'select',
				name: 'categoryId',
				label: 'notebooks.fields.kind',
				span: 4,
				from: 'workoutCategories',
				blank: 'notebooks.fields.noKind'
			},
			{ kind: 'number', name: 'minutes', label: 'notebooks.fields.minutes', span: 4, min: 1 },
			{ kind: 'textarea', name: 'plan', label: 'notebooks.fields.thePlan', rows: 4 },
			{ kind: 'textarea', name: 'notes', label: 'notebooks.fields.notes', rows: 2 }
		],
		room: () => resolve('/health/workouts')
	},

	recipes: {
		newLabel: 'notebooks.newRecipe',
		empty: 'notebooks.nothingUnderThisSubjectYet',
		create: NOTEBOOK_ACTIONS.recipes.create,
		update: NOTEBOOK_ACTIONS.recipes.update,
		archive: { action: NOTEBOOK_ACTIONS.recipes.setArchived, field: 'archived' },
		mark: {
			action: NOTEBOOK_ACTIONS.recipes.cooked,
			icon: 'flame',
			label: 'notebooks.marks.cooked'
		},
		fields: [
			{ kind: 'text', name: 'heading', label: 'notebooks.fields.name', span: 8, required: true },
			{ kind: 'number', name: 'servings', label: 'notebooks.fields.servings', span: 4, min: 1 },
			{ kind: 'number', name: 'minutes', label: 'notebooks.fields.minutes', span: 4, min: 1 },
			{ kind: 'text', name: 'source', label: 'notebooks.fields.whereItCameFrom', span: 8 },
			{ kind: 'textarea', name: 'notes', label: 'notebooks.fields.notes', rows: 2 }
		],
		room: (row) => resolve('/health/recipes/[id]', { id: String(row.id) })
	}
};
