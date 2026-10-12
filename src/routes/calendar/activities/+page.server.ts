import type { IsolatedEvent } from '$lib/isolated/routes';
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
import { formAction } from '$lib/services/scoped-actions';

export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		activities: listActivitiesWithUsage(ctx),
		categories: listCategories(ctx),
		goalLinks: goalBacklinks(ctx)
	};
};

export const actions = {
	create: formAction((ctx, formData) => {
		createActivity(ctx, {
			name: formData.get('label'),
			categoryId: formData.get('categoryId'),
			description: formData.get('description')
		});
	}),

	update: formAction((ctx, formData) => {
		updateActivity(ctx, Number(formData.get('id')), {
			name: formData.get('label'),
			categoryId: formData.get('categoryId'),
			description: formData.get('description')
		});
	}),

	toggleActive: formAction((ctx, formData) => {
		toggleActivityActive(ctx, Number(formData.get('id')));
	}),

	delete: formAction((ctx, formData) => {
		deleteActivity(ctx, Number(formData.get('id')));
	}),

	createCategory: formAction((ctx, formData) => {
		createCategory(ctx, {
			name: formData.get('label'),
			color: formData.get('color')
		});
	}),

	updateCategory: formAction((ctx, formData) => {
		updateCategory(ctx, Number(formData.get('id')), {
			name: formData.get('label'),
			color: formData.get('color')
		});
	}),

	deleteCategory: formAction((ctx, formData) => {
		deleteCategory(ctx, Number(formData.get('id')));
	})
};
