import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import { recipesByItem } from '$lib/server/services/recipes';
import { getCurrency } from '$lib/server/settings';
import {
	createCategory,
	deleteCategory,
	renameCategory,
	createItem,
	deleteItem,
	listCategories,
	setCategoryFood,
	listItems,
	recordPaid,
	restockItem,
	toggleBought,
	toggleSnoozed,
	updateItem
} from '$lib/server/services/shopping';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		items: listItems(ctx),
		/** Which recipes use each item — the other half of the ingredient link. */
		usedIn: recipesByItem(ctx),
		shoppingCategories: listCategories(ctx),
		currency: getCurrency(ctx.userId)
	};
};

/** Every action here is the same shape: read the form, call the service, map errors. */
export const actions: Actions = {
	/** Which categories hold food, and therefore what can be an ingredient. */
	/** One tick, saved as it lands — the modal has no save button any more. */
	setCategoryFood: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setCategoryFood(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('isFood') === 'true'
			);
			return { success: true, action: 'setCategoryFood' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	renameCategory: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			renameCategory(buildCtx(locals.user!.id), Number(formData.get('id')), formData.get('name'));
			return { success: true, action: 'renameCategory' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteCategory: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteCategory(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true, action: 'deleteCategory' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	saveCategories: async ({ request, locals }) => {
		const formData = await request.formData();
		const ctx = buildCtx(locals.user!.id);

		try {
			const food = new Set(formData.getAll('food').map((v) => Number(v)));
			for (const category of listCategories(ctx))
				setCategoryFood(ctx, category.id, food.has(category.id));

			return { success: true, action: 'saveCategories' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * Making a category is its own act, and needs its own action.
	 *
	 * It used to be a second pair of fields inside `saveCategories`, so one Save
	 * meant two things. Splitting the form was right and left this behind: the
	 * new form posted here and there was nothing here to post to, so the dialog
	 * simply did nothing and said nothing about it.
	 */
	createCategory: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createCategory(buildCtx(locals.user!.id), {
				name: formData.get('label'),
				isFood: formData.get('isFood') === 'true'
			});
			return { success: true, action: 'createCategory' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const name = formData.get('label');
			const { alreadyHad } = createItem(buildCtx(locals.user!.id), {
				name,
				type: formData.get('type'),
				notes: formData.get('notes'),
				price: formData.get('price'),
				shoppingCategoryId: formData.get('shoppingCategoryId')
			});

			return {
				success: true,
				action: 'create',
				notice: alreadyHad
					? `${String(name).trim()} was already on the list, so it is back on it.`
					: null
			};
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateItem(buildCtx(locals.user!.id), Number(formData.get('id')), {
				name: formData.get('label'),
				type: formData.get('type'),
				notes: formData.get('notes'),
				price: formData.get('price'),
				shoppingCategoryId: formData.get('shoppingCategoryId')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleBought: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			toggleBought(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** What you actually paid. Never part of the tick, which has to stay one press. */
	paid: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			recordPaid(buildCtx(locals.user!.id), Number(formData.get('id')), formData.get('paid'));
			return { success: true, action: 'paid' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteItem(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	restock: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			restockItem(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleSnoozed: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			toggleSnoozed(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
