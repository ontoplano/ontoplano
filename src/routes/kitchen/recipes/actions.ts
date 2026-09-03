import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from '@sveltejs/kit';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
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
import { attachToRecipe, detachFromRecipe, setMain } from '$lib/server/services/media';
import { parseRecipeFromHtml } from '$lib/recipe-import';

/** A recipe page is tens of kilobytes. This is where a paste stops being one. */
const MAX_PAGE_LENGTH = 1_000_000;

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
	 * A recipe out of a page somebody pasted.
	 *
	 * Almost every food site publishes its recipes as schema.org JSON-LD,
	 * because Google's rich results require it — so this reads a standard rather
	 * than scraping a layout, and does not break when a blog is redesigned.
	 *
	 * The page arrives as text rather than as a link, and that is the design.
	 * A server that fetches an address a user typed reaches everything the box
	 * can reach and nothing outside it can: the metadata service on a rented
	 * VPS, the router, this app's own port. Other people run this on their own
	 * machines and would inherit that door. Pasting costs one step, works on
	 * sites that refuse servers anyway, and leaves the useful half — the parser
	 * — exactly as it was.
	 */
	importFromPage: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		let id: number;
		try {
			const pasted = String(formData.get('page') ?? '');

			// A page is tens of kilobytes; a megabyte is somebody's mistake and
			// there is no reason to hand it to a regular expression.
			if (pasted.length > MAX_PAGE_LENGTH)
				return fail(413, { message: 'That is too much to read at once.' });

			const found = parseRecipeFromHtml(pasted);

			if (!found)
				return fail(422, {
					message:
						'No recipe in that — it has no structured recipe data. Paste the ingredients below instead.'
				});

			id = createRecipe(ctx, {
				title: found.title,
				method: found.method,
				servings: found.servings,
				minutes: found.minutes,
				source: String(formData.get('source') ?? '').slice(0, 500) || null
			});

			// The same parser the paste box uses, so a line read off a page and a
			// line typed by hand end up as the same ingredient.
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

	/*
	 * The gallery: three actions, all of them ordinary form posts.
	 *
	 * Unlike a picture pasted into a note — which has to be stored while
	 * somebody is still typing — a recipe's pictures are a list on a page that is
	 * already a form, so there is nothing to invent: a file input, a submit, a
	 * reload. Everything about how many and how big is the service's.
	 */
	addPicture: async ({ request, locals }) => {
		const formData = await request.formData();
		const recipeId = Number(formData.get('recipeId'));
		if (!recipeId) return fail(400, { message: 'No recipe' });

		const file = formData.get('file');
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { message: 'Choose a picture first.' });

		try {
			attachToRecipe(buildCtx(locals.user!.id), recipeId, {
				bytes: Buffer.from(await file.arrayBuffer()),
				filename: file.name,
				alt: String(formData.get('alt') ?? '')
			});
			return { success: true, action: 'addPicture' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	removePicture: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			detachFromRecipe(
				buildCtx(locals.user!.id),
				Number(formData.get('recipeId')),
				Number(formData.get('mediaId'))
			);
			return { success: true, action: 'removePicture' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setMainPicture: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setMain(
				buildCtx(locals.user!.id),
				Number(formData.get('recipeId')),
				Number(formData.get('mediaId'))
			);
			return { success: true, action: 'setMainPicture' };
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
