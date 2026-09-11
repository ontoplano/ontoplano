import type { SelfContainedEvent } from '$lib/self-contained/routes';
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
} from '$lib/services/activities';
import { goalBacklinks } from '$lib/services/backlinks';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';

export const load = async ({ locals }: SelfContainedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		activities: listActivitiesWithUsage(ctx),
		categories: listCategories(ctx),
		goalLinks: goalBacklinks(ctx)
	};
};

export const actions = {
	create: async ({ request, locals }: SelfContainedEvent) => {
		const formData = await request.formData();
		try {
			createActivity(buildCtx(locals.user!.id), {
				name: formData.get('label'),
				categoryId: formData.get('categoryId'),
				description: formData.get('description')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }: SelfContainedEvent) => {
		const formData = await request.formData();
		try {
			updateActivity(buildCtx(locals.user!.id), Number(formData.get('id')), {
				name: formData.get('label'),
				categoryId: formData.get('categoryId'),
				description: formData.get('description')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleActive: async ({ request, locals }: SelfContainedEvent) => {
		const formData = await request.formData();
		try {
			toggleActivityActive(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }: SelfContainedEvent) => {
		const formData = await request.formData();
		try {
			deleteActivity(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	createCategory: async ({ request, locals }: SelfContainedEvent) => {
		const formData = await request.formData();
		try {
			createCategory(buildCtx(locals.user!.id), {
				name: formData.get('label'),
				color: formData.get('color')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateCategory: async ({ request, locals }: SelfContainedEvent) => {
		const formData = await request.formData();
		try {
			updateCategory(buildCtx(locals.user!.id), Number(formData.get('id')), {
				name: formData.get('label'),
				color: formData.get('color')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteCategory: async ({ request, locals }: SelfContainedEvent) => {
		const formData = await request.formData();
		try {
			deleteCategory(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
