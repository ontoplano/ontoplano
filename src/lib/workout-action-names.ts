import { OBJECT_ROOMS } from './object-links.js';

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

/**
 * What a notebook's card asks the Health room to open, by address.
 *
 * Writing a session down, correcting one and putting a workout on a day are
 * the room's own dialogs, and a notebook's tab is not going to carry a second
 * copy of each. So the card's buttons there are links into the room, and the
 * room opens the dialog the address names (`openFromUrl`). Editing the workout
 * itself is the room's ordinary `?edit=` — see `$lib/object-links`.
 */
export const WORKOUT_ROOM_PARAMS = {
	log: 'log',
	schedule: 'schedule',
	session: 'session',
	deleteSession: 'deleteSession'
} as const;

export type WorkoutRoomParam = keyof typeof WORKOUT_ROOM_PARAMS;

/** The Health room's address with one of its dialogs asked for. */
export function workoutRoomLink(param: WorkoutRoomParam, id: number): string {
	return `${OBJECT_ROOMS.workout.room}?${WORKOUT_ROOM_PARAMS[param]}=${id}`;
}
