import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import {
	listWorkouts,
	createWorkout,
	updateWorkout,
	setArchived,
	deleteWorkout,
	doneToday,
	scheduleWorkout
} from '$lib/server/services/workouts';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	// A workout needs no category: on the grid it is its own kind of block and
	// wears Health's colour, the way a meal does.
	return { workouts: listWorkouts(ctx, { includeArchived: true }) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			createWorkout(buildCtx(locals.user!.id), {
				title: form.get('heading'),
				kind: form.get('kind') || 'other',
				plan: form.get('plan'),
				minutes: form.get('minutes') || null,
				notes: form.get('notes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			updateWorkout(buildCtx(locals.user!.id), Number(form.get('id')), {
				title: form.get('heading'),
				kind: form.get('kind') || 'other',
				plan: form.get('plan'),
				minutes: form.get('minutes') || null,
				notes: form.get('notes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	done: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			// Ticks today's block too, if the workout is on today's plan.
			doneToday(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	schedule: async ({ request, locals }) => {
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

	archive: async ({ request, locals }) => {
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

	delete: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			deleteWorkout(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
