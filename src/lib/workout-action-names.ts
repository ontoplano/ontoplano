/**
 * Where a workout card posts, on each screen that shows one.
 *
 * The same component draws the card in Health and inside a notebook, and the
 * two routes cannot use the same action names — a notebook page already
 * answers to `delete` for the notebook itself. So the names are a prop, as the
 * goals, ideas, bills and habits already do.
 */
export type WorkoutActionNames = {
	done: string;
	archive: string;
	updateSession: string;
	deleteSession: string;
};

/** The Health room's Workouts tab, where a workout is what the page is about. */
export const WORKOUT_ROOM_ACTIONS: WorkoutActionNames = {
	done: '?/done',
	archive: '?/archive',
	updateSession: '?/updateSession',
	deleteSession: '?/deleteSession'
};

/** Inside a notebook, where the unprefixed names belong to the notebook. */
export const NOTEBOOK_WORKOUT_ACTIONS: WorkoutActionNames = {
	done: '?/workoutDone',
	archive: '?/workoutArchive',
	updateSession: '?/workoutUpdateSession',
	deleteSession: '?/workoutDeleteSession'
};
