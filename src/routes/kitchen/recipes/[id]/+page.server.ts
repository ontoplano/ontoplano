import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { NotFoundError } from '$lib/server/services/errors';
import { edibleItems, getRecipe, ingredientsOf } from '$lib/server/services/recipes';
import { recipeActions } from '../actions';

export const load: PageServerLoad = async ({ locals, params }) => {
	const ctx = buildCtx(locals.user!.id);
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Not found');

	try {
		return {
			recipe: getRecipe(ctx, id),
			ingredients: ingredientsOf(ctx, id),
			// Everything that could be an ingredient, for the combobox.
			pantry: edibleItems(ctx)
		};
	} catch (e) {
		if (e instanceof NotFoundError) error(404, 'Recipe not found');
		throw e;
	}
};

export const actions = recipeActions;
