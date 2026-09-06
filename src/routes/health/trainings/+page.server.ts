import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { listCategories } from '$lib/server/services/activities';
import { toActionFailure } from '$lib/server/http-errors';
import {
	listTrainings,
	createTraining,
	updateTraining,
	setArchived,
	deleteTraining,
	doneToday,
	scheduleTraining
} from '$lib/server/services/trainings';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		trainings: listTrainings(ctx, { includeArchived: true }),
		// For the block a scheduled workout becomes: a category is optional, but
		// filing it under one is how it takes a colour on the grid.
		categories: listCategories(ctx)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			createTraining(buildCtx(locals.user!.id), {
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
			updateTraining(buildCtx(locals.user!.id), Number(form.get('id')), {
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
			scheduleTraining(buildCtx(locals.user!.id), Number(form.get('id')), {
				date: form.get('date'),
				startTime: form.get('startTime'),
				durationMinutes: form.get('durationMinutes'),
				categoryId: form.get('categoryId')
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
			deleteTraining(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
