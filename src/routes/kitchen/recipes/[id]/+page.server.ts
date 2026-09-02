import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { NotFoundError } from '$lib/server/services/errors';
import { listCategories } from '$lib/server/services/activities';
import { mediaLimits, picturesOf } from '$lib/server/services/media';
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
			// The gallery, in the order it is shown, main one flagged.
			pictures: picturesOf(ctx, id),
			// What the operator allows, so the page can say it rather than only
			// refusing after somebody has chosen a file.
			pictureLimits: {
				most: mediaLimits().recipeImages,
				kilobytes: mediaLimits().maxKilobytes
			},
			// Everything that could be an ingredient, for the combobox.
			pantry: edibleItems(ctx),
			// For putting it on a day: a meal is a block like any other.
			categories: listCategories(ctx),
			today: new Date(ctx.now).toISOString().slice(0, 10)
		};
	} catch (e) {
		if (e instanceof NotFoundError) error(404, 'Recipe not found');
		throw e;
	}
};

export const actions = recipeActions;
