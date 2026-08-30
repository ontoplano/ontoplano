import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import {
	createHabit,
	deleteHabit,
	deleteOccurrence,
	listHabits,
	listOccurrences,
	logOccurrence,
	today,
	toggleOccurrence,
	updateHabit,
	updateOccurrence
} from '$lib/server/services/habits';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);

	return {
		habits: listHabits(ctx),
		occurrences: listOccurrences(ctx),
		today: today(ctx)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createHabit(buildCtx(locals.user!.id), {
				name: formData.get('label'),
				description: formData.get('description'),
				type: formData.get('type'),
				scheduledDays: formData.get('scheduledDays')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateHabit(buildCtx(locals.user!.id), Number(formData.get('id')), {
				name: formData.get('label'),
				description: formData.get('description'),
				type: formData.get('type'),
				scheduledDays: formData.get('scheduledDays')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteHabit(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	logOccurrence: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			logOccurrence(buildCtx(locals.user!.id), {
				habitId: formData.get('habitId'),
				date: formData.get('date'),
				notes: formData.get('notes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleOccurrence: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			toggleOccurrence(buildCtx(locals.user!.id), {
				habitId: formData.get('habitId'),
				date: formData.get('date')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateOccurrence: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateOccurrence(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('notes')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteOccurrence: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteOccurrence(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
