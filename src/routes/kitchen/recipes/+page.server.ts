import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { foodCategories, withMissingCounts } from '$lib/server/services/recipes';
import { recipeActions } from './actions';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);

	return {
		recipes: withMissingCounts(ctx),
		// With no food category nothing can be an ingredient, and the page has to
		// say so rather than offering an editor that refuses everything.
		hasFoodCategory: foodCategories(ctx).length > 0
	};
};

export const actions = recipeActions;
