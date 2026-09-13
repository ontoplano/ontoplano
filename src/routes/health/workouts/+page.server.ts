import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	listWorkouts,
	listSessions,
	logWorkout,
	updateSession,
	deleteSession,
	measuredActivities,
	createWorkout,
	updateWorkout,
	setArchived,
	deleteWorkout,
	doneToday,
	scheduleWorkout,
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

/**
 * The lines of one session, as a form sends them.
 *
 * Three parallel lists rather than indexed names: a row is added and removed
 * in the browser, and `measureActivity[3]` left behind by a removed row is a
 * hole somebody has to code around. Zipped by position, and a row with no
 * activity is one that was opened and abandoned — the service drops it.
 */
function measuresFrom(form: FormData) {
	const activities = form.getAll('measureActivity');
	const amounts = form.getAll('measureAmount');
	const units = form.getAll('measureUnit');
	return activities.map((activity, index) => ({
		activity,
		amount: amounts[index] ?? null,
		unit: units[index] ?? ''
	}));
}

/**
 * What a workout declares it measures, as the workout form sends it.
 *
 * The same two lists without the amounts, under their own names, because the
 * workout form and the session form are both open in the same page and a
 * shared field name would let one post the other's rows.
 */
function declaredFrom(form: FormData) {
	const activities = form.getAll('planActivity');
	const units = form.getAll('planUnit');
	return activities.map((activity, index) => ({ activity, unit: units[index] ?? '' }));
}

export const actions = {
	create: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			createWorkout(buildCtx(locals.user!.id), {
				title: form.get('heading'),
				categoryId: form.get('categoryId'),
				plan: form.get('plan'),
				minutes: form.get('minutes') || null,
				notes: form.get('notes'),
				measures: declaredFrom(form)
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			updateWorkout(buildCtx(locals.user!.id), Number(form.get('id')), {
				title: form.get('heading'),
				categoryId: form.get('categoryId'),
				plan: form.get('plan'),
				minutes: form.get('minutes') || null,
				notes: form.get('notes'),
				measures: declaredFrom(form)
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	done: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			// Ticks today's block too, if the workout is on today's plan.
			doneToday(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Write down a session: the day, anything noted, and the lines. */
	log: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			logWorkout(buildCtx(locals.user!.id), Number(form.get('id')), {
				doneOn: form.get('doneOn'),
				notes: form.get('notes'),
				measures: measuresFrom(form)
			});
			return { success: true, action: 'log' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Correct one that was written down wrong. */
	updateSession: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			updateSession(buildCtx(locals.user!.id), Number(form.get('sessionId')), {
				doneOn: form.get('doneOn'),
				notes: form.get('notes'),
				measures: measuresFrom(form)
			});
			return { success: true, action: 'updateSession' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** For one logged by accident. Its lines go with it. */
	deleteSession: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			deleteSession(buildCtx(locals.user!.id), Number(form.get('sessionId')));
			return { success: true, action: 'deleteSession' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	schedule: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			scheduleWorkout(buildCtx(locals.user!.id), Number(form.get('id')), {
				date: form.get('date'),
				startTime: form.get('startTime'),
				durationMinutes: form.get('durationMinutes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	archive: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			setArchived(
				buildCtx(locals.user!.id),
				Number(form.get('id')),
				form.get('archived') === 'true'
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			deleteWorkout(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},
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
