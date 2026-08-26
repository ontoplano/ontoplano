import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from '@sveltejs/kit';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import {
	addIngredient,
	cooked,
	createRecipe,
	deleteRecipe,
	removeIngredient,
	setArchived,
	updateRecipe
} from '$lib/server/services/recipes';

/**
 * What can be done to a recipe, from the list or from its own page.
 *
 * Shared for the same reason the notebook's are: two screens, one set of
 * buttons, and no chance of them drifting apart.
 */
export const recipeActions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const id = createRecipe(buildCtx(locals.user!.id), {
				title: formData.get('title'),
				servings: formData.get('servings'),
				minutes: formData.get('minutes')
			});
			// Straight into the new recipe: the next thing anybody does is write it.
			redirect(303, `/kitchen/recipes/${id}`);
		} catch (e) {
			if (e instanceof Response) throw e;
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateRecipe(buildCtx(locals.user!.id), Number(formData.get('id')), {
				title: formData.get('title'),
				method: formData.get('method'),
				notes: formData.get('notes'),
				servings: formData.get('servings'),
				minutes: formData.get('minutes'),
				source: formData.get('source')
			});
			return { success: true, action: 'update' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	addIngredient: async ({ request, locals }) => {
		const formData = await request.formData();
		const recipeId = Number(formData.get('recipeId'));
		if (!recipeId) return fail(400, { message: 'No recipe' });

		try {
			addIngredient(buildCtx(locals.user!.id), recipeId, {
				itemId: formData.get('itemId'),
				name: formData.get('name'),
				quantity: formData.get('quantity'),
				unit: formData.get('unit'),
				note: formData.get('note')
			});
			return { success: true, action: 'addIngredient' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	removeIngredient: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			removeIngredient(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true, action: 'removeIngredient' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	cooked: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const ranOut = formData
				.getAll('ranOut')
				.map((v) => Number(v))
				.filter(Boolean);

			cooked(buildCtx(locals.user!.id), Number(formData.get('id')), ranOut);
			return { success: true, action: 'cooked', ranOut: ranOut.length };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setArchived: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setArchived(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('archived') === 'true'
			);
			return { success: true, action: 'setArchived' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteRecipe(buildCtx(locals.user!.id), Number(formData.get('id')));
		} catch (e) {
			return toActionFailure(e);
		}

		redirect(303, '/kitchen/recipes');
	}
} satisfies Actions;
