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
import { MOVE_TO_NEW } from './move-to';

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

	// `moveTo` is empty to fold into the category, an id, or `new` with the new one's fields.
	delete: formAction((ctx, formData) => {
		const moveTo = String(formData.get('moveTo') ?? '');
		deleteActivity(
			ctx,
			Number(formData.get('id')),
			moveTo === MOVE_TO_NEW
				? {
						moveToNew: {
							name: formData.get('newName'),
							categoryId: formData.get('newCategoryId')
						}
					}
				: moveTo
					? { moveTo: Number(moveTo) }
					: {}
		);
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
