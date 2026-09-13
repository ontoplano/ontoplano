/**
 * Where a todo row posts, on each screen that shows one.
 *
 * The same component draws the row in the to-do room and inside a notebook,
 * and the two routes cannot use the same action names — a notebook page
 * already answers to `delete` and `update` for the notebook itself. So the
 * names are a prop rather than something the markup spells out.
 */
export type TodoActionNames = {
	create: string;
	update: string;
	setStatus: string;
	schedule: string;
	delegate: string;
	archive: string;
	remove: string;
};

/** The to-do room, where a todo is the only thing on the page. */
export const TODO_ROOM_ACTIONS: TodoActionNames = {
	create: '?/create',
	update: '?/update',
	setStatus: '?/setStatus',
	schedule: '?/schedule',
	delegate: '?/delegate',
	archive: '?/archive',
	remove: '?/delete'
};

/** Inside a notebook, where the unprefixed names belong to the notebook. */
export const NOTEBOOK_TODO_ACTIONS: TodoActionNames = {
	create: '?/todoCreate',
	update: '?/todoUpdate',
	setStatus: '?/todoStatus',
	schedule: '?/todoSchedule',
	delegate: '?/todoDelegate',
	archive: '?/todoArchive',
	remove: '?/todoDelete'
};
