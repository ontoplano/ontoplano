import type { PageServerLoad } from './$types';
import { listCategories } from '$lib/server/services/activities';
import { buildCtx } from '$lib/server/services/ctx';
import { mainPictures } from '$lib/server/services/media';
import { foodCategories, withMissingCounts } from '$lib/server/services/recipes';
import { recipeActions } from './actions';

/**
 * Every recipe, with the picture that stands for it.
 *
 * One query for the whole list rather than one per card: a cookbook is a page
 * of forty cards, and forty round trips to ask "does this one have a picture"
 * is how a list stops being instant.
 */
function withPictures(ctx: Parameters<typeof withMissingCounts>[0]) {
	const recipes = withMissingCounts(ctx);
	const main = mainPictures(
		ctx,
		recipes.map((r) => r.id)
	);
	return recipes.map((r) => ({ ...r, mainPicture: main.get(r.id) ?? null }));
}

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);

	return {
		recipes: withPictures(ctx),
		// With no food category nothing can be an ingredient, and the page has to
		// say so rather than offering an editor that refuses everything.
		hasFoodCategory: foodCategories(ctx).length > 0,
		// For putting a recipe on a day without opening it first.
		categories: listCategories(ctx),
		today: new Date(ctx.now).toISOString().slice(0, 10)
	};
};

export const actions = recipeActions;
