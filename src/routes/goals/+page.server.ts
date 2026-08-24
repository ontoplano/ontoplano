import type { Actions, PageServerLoad } from './$types';
import { listActivities } from '$lib/server/services/activities';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import {
	closeGoal,
	createArea,
	createGoal,
	deleteArea,
	deleteGoal,
	linkableSlots,
	listAreas,
	listGoals,
	setGoalLinks,
	setGoalProgress,
	updateGoal
} from '$lib/server/services/goals';
import { listTodos } from '$lib/server/services/todos';

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	const includeClosed = url.searchParams.get('closed') === '1';

	return {
		areas: listAreas(ctx),
		goals: listGoals(ctx, { includeClosed }),
		includeClosed,
		slots: linkableSlots(ctx),
		todos: listTodos(ctx).filter((t) => t.status !== 'done'),
		activities: listActivities(ctx, { activeOnly: true }).map((a) => ({ id: a.id, name: a.name }))
	};
};

export const actions: Actions = {
	createArea: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createArea(buildCtx(locals.user!.id), {
				name: formData.get('name'),
				color: formData.get('color')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteArea: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteArea(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createGoal(buildCtx(locals.user!.id), {
				title: formData.get('title'),
				horizon: formData.get('horizon'),
				notes: formData.get('notes'),
				periodAnchor: formData.get('periodAnchor'),
				areaId: formData.get('areaId'),
				parentId: formData.get('parentId'),
				targetValue: formData.get('targetValue'),
				unit: formData.get('unit')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateGoal(buildCtx(locals.user!.id), Number(formData.get('id')), {
				title: formData.get('title'),
				notes: formData.get('notes'),
				areaId: formData.get('areaId'),
				targetValue: formData.get('targetValue'),
				unit: formData.get('unit')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setProgress: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setGoalProgress(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('currentValue')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	close: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			closeGoal(buildCtx(locals.user!.id), Number(formData.get('id')), {
				status: formData.get('status'),
				outcome: formData.get('outcome')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setLinks: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setGoalLinks(buildCtx(locals.user!.id), Number(formData.get('id')), {
				slotIds: formData.getAll('slotId'),
				todoIds: formData.getAll('todoId'),
				activityIds: formData.getAll('activityId')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	remove: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteGoal(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
