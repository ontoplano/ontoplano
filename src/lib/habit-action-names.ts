/**
 * Where a habit card posts, on each screen that shows one.
 *
 * The same component draws the card in Health and inside a notebook, and the
 * two routes cannot use the same action names — a notebook page already
 * answers to `delete` for the notebook itself. So the names are a prop, as
 * `$lib/goal-action-names`, `$lib/idea-action-names` and
 * `$lib/bill-action-names` already are.
 */
export type HabitActionNames = {
	logOccurrence: string;
	toggleOccurrence: string;
	updateOccurrence: string;
	deleteOccurrence: string;
	remove: string;
};

/** The Health room's Habits tab, where a habit is what the page is about. */
export const HABIT_ROOM_ACTIONS: HabitActionNames = {
	logOccurrence: '?/logOccurrence',
	toggleOccurrence: '?/toggleOccurrence',
	updateOccurrence: '?/updateOccurrence',
	deleteOccurrence: '?/deleteOccurrence',
	remove: '?/delete'
};

/** Inside a notebook, where the unprefixed names belong to the notebook. */
export const NOTEBOOK_HABIT_ACTIONS: HabitActionNames = {
	logOccurrence: '?/habitLogOccurrence',
	toggleOccurrence: '?/habitToggleOccurrence',
	updateOccurrence: '?/habitUpdateOccurrence',
	deleteOccurrence: '?/habitDeleteOccurrence',
	remove: '?/habitDelete'
};
