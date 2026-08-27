import type { Actions, PageServerLoad } from './$types';
import {
	createActivity,
	createCategory,
	deleteActivity,
	deleteCategory,
	listActivitiesWithUsage,
	listCategories,
	toggleActivityActive,
	updateActivity,
	updateCategory
} from '$lib/server/services/activities';
import { goalBacklinks } from '$lib/server/services/backlinks';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		activities: listActivitiesWithUsage(ctx),
		categories: listCategories(ctx),
		goalLinks: goalBacklinks(ctx)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createActivity(buildCtx(locals.user!.id), {
				name: formData.get('name'),
				categoryId: formData.get('categoryId'),
				description: formData.get('description')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateActivity(buildCtx(locals.user!.id), Number(formData.get('id')), {
				name: formData.get('name'),
				categoryId: formData.get('categoryId'),
				description: formData.get('description')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleActive: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			toggleActivityActive(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteActivity(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	createCategory: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createCategory(buildCtx(locals.user!.id), {
				name: formData.get('name'),
				color: formData.get('color')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateCategory: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateCategory(buildCtx(locals.user!.id), Number(formData.get('id')), {
				name: formData.get('name'),
				color: formData.get('color')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteCategory: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteCategory(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
