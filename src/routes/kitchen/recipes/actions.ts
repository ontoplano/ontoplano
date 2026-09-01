import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from '@sveltejs/kit';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import { createExceptional } from '$lib/server/services/slots';
import { listCategories } from '$lib/server/services/activities';
import {
	addIngredient,
	cooked,
	createRecipe,
	deleteRecipe,
	importIngredients,
	removeIngredient,
	setArchived,
	updateRecipe
} from '$lib/server/services/recipes';
import { parseRecipeFromHtml } from '$lib/recipe-import';
import { fetchPage } from '$lib/server/services/recipe-fetch';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * What can be done to a recipe, from the list or from its own page.
 *
 * Shared for the same reason the notebook's are: two screens, one set of
 * buttons, and no chance of them drifting apart.
 */
export const recipeActions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();

		// The redirect is outside the `try`. SvelteKit signals one by throwing,
		// and a `catch` that turns everything into a failure turned a successful
		// create into "Unexpected error" — with the recipe made and the caller
		// told it had not been.
		let id: number;
		try {
			id = createRecipe(buildCtx(locals.user!.id), {
				title: formData.get('title'),
				method: formData.get('method'),
				notes: formData.get('notes'),
				servings: formData.get('servings'),
				minutes: formData.get('minutes'),
				source: formData.get('source')
			});
		} catch (e) {
			return toActionFailure(e);
		}

		// Straight into the new recipe: the next thing anybody does is write it.
		redirect(303, `/kitchen/recipes/${id}`);
	},

	/**
	 * A recipe from a link.
	 *
	 * Almost every food site publishes schema.org JSON-LD, because Google's rich
	 * results require it — so this reads a standard rather than scraping a
	 * layout, and does not break when a blog is redesigned.
	 *
	 * The two halves are deliberately separate. `fetchPage` is the one that can
	 * hurt somebody: fetching a URL a user supplies reaches everything the box
	 * can reach and nothing outside it can, so it resolves the name, refuses
	 * private addresses, and re-checks every redirect. `parseRecipeFromHtml` is
	 * pure and knows nothing about the network.
	 *
	 * Rate limited per account, not per address: it is a signed-in action that
	 * makes the server fetch something, which is worth a ceiling even from
	 * somebody who is allowed to do it.
	 */
	importFromUrl: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		const budget = rateLimit(`recipe-import:${ctx.userId}`, 10, 60_000);
		if (!budget.allowed)
			return fail(429, {
				message: `Too many at once. Try again in ${budget.retryAfterSeconds} seconds.`
			});

		let id: number;
		try {
			const url = String(formData.get('url') ?? '');
			const page = await fetchPage(url);
			const found = parseRecipeFromHtml(page);

			if (!found)
				return fail(422, {
					message:
						'No recipe on that page — it has no structured recipe data. Paste the ingredients instead.'
				});

			id = createRecipe(ctx, {
				title: found.title,
				method: found.method,
				servings: found.servings,
				minutes: found.minutes,
				source: url
			});

			// The same parser the paste box uses, so a line imported from a page
			// and a line typed by hand end up as the same ingredient.
			importIngredients(ctx, id, found.ingredients.join('\n'));
		} catch (e) {
			return toActionFailure(e);
		}

		redirect(303, `/kitchen/recipes/${id}`);
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

	importIngredients: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const added = importIngredients(
				buildCtx(locals.user!.id),
				Number(formData.get('recipeId')),
				formData.get('list')
			);
			return { success: true, added };
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
				name: formData.get('label'),
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

	/**
	 * Put a recipe on a day.
	 *
	 * It becomes an ordinary block on the planner grid with the recipe attached,
	 * which is what makes dinner show up beside deep work and what makes "what
	 * does this week need" a join rather than a second calendar.
	 */
	schedule: async ({ request, locals }) => {
		const formData = await request.formData();
		const ctx = buildCtx(locals.user!.id);

		try {
			const category = Number(formData.get('categoryId')) || listCategories(ctx)[0]?.id;
			if (!category) return fail(400, { message: 'No category to put it in yet' });

			createExceptional(ctx, {
				date: formData.get('date'),
				startTime: formData.get('startTime'),
				durationMinutes: formData.get('durationMinutes'),
				mode: 'category',
				categoryId: category,
				label: formData.get('label'),
				recipeId: formData.get('recipeId')
			});

			return { success: true, action: 'schedule' };
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
