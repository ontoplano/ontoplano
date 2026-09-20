/**
 * Where a goal card posts, on each screen that shows one.
 *
 * The same component draws the card in the goals room and inside a notebook,
 * and the two routes cannot use the same action names — a notebook page
 * already answers to `delete` and `update` for the notebook itself. So the
 * names are a prop rather than something the markup spells out, exactly as
 * `$lib/todo-actions` does for a todo row.
 */
export type GoalActionNames = {
	update: string;
	setProgress: string;
	close: string;
	setLinks: string;
	setTodoStatus: string;
	remove: string;
};

/** The goals room, where a goal is the only thing on the page. */
export const GOAL_ROOM_ACTIONS: GoalActionNames = {
	update: '?/update',
	setProgress: '?/setProgress',
	close: '?/close',
	setLinks: '?/setLinks',
	setTodoStatus: '?/setTodoStatus',
	remove: '?/remove'
};

/** Inside a notebook, where the unprefixed names belong to the notebook. */
export const NOTEBOOK_GOAL_ACTIONS: GoalActionNames = {
	update: '?/goalUpdate',
	setProgress: '?/goalProgress',
	close: '?/goalClose',
	setLinks: '?/goalLinks',
	setTodoStatus: '?/goalTodoStatus',
	remove: '?/goalDelete'
};
