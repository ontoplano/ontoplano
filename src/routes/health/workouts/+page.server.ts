import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { pickableNotebooks } from '$lib/services/notebooks';
import { workoutHandlers } from '$lib/services/workout-actions';
import { toActionFailure } from '$lib/http-errors';
import {
	listWorkouts,
	listSessions,
	measuredActivities,
	listWorkoutCategories,
	createWorkoutCategory,
	renameWorkoutCategory,
	deleteWorkoutCategory
} from '$lib/services/workouts';

/**
 * How much of the register the page carries.
 *
 * The history under a workout is read, not paged: somebody wants to see the
 * last few months of a thing they do twice a week, and a year of that is a
 * couple of hundred rows. Far enough back to be useful, short enough that the
 * page is not a database dump.
 */
const SESSIONS_LOADED = 300;

export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	// A workout needs no category: on the grid it is its own kind of block and
	// wears Health's colour, the way a meal does.
	return {
		// The subject a thing belongs to, asked in the room's own form: the
		// notebook's tab opens this same form with its own notebook chosen.
		notebooks: pickableNotebooks(ctx),
		workouts: listWorkouts(ctx, { includeArchived: true }),
		// Made on first sight, so an account that predates the table has them.
		categories: listWorkoutCategories(ctx),
		// The register: what was actually done, and how much of it.
		sessions: listSessions(ctx, { limit: SESSIONS_LOADED }),
		// Everything this account has ever measured, so the activity field
		// completes rather than asking somebody to spell "deadlifted" the same
		// way twice.
		activityNames: measuredActivities(ctx)
	};
};

export const actions = {
	/*
	 * The workout itself, and the register of what was done.
	 *
	 * In `$lib/services/workout-actions`, because a notebook's Workouts tab
	 * runs the same handlers — a session written down there is the same row.
	 * The categories stay below: they are this room's vocabulary, and a
	 * notebook has no business renaming what every other workout is filed
	 * under.
	 */
	...workoutHandlers,

	createCategory: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			createWorkoutCategory(buildCtx(locals.user!.id), form.get('label'));
			return { success: true, action: 'createCategory' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	renameCategory: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			renameWorkoutCategory(buildCtx(locals.user!.id), Number(form.get('id')), form.get('name'));
			return { success: true, action: 'renameCategory' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** The workouts filed under it keep existing, without a kind. */
	deleteCategory: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			deleteWorkoutCategory(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true, action: 'deleteCategory' };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
