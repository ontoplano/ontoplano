import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import {
	createItem,
	deleteItem,
	listCategories,
	listItems,
	restockItem,
	toggleBought,
	toggleSnoozed,
	updateItem
} from '$lib/server/services/shopping';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return { items: listItems(ctx), shoppingCategories: listCategories(ctx) };
};

/** Every action here is the same shape: read the form, call the service, map errors. */
export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const name = formData.get('name');
			const { alreadyHad } = createItem(buildCtx(locals.user!.id), {
				name,
				type: formData.get('type'),
				notes: formData.get('notes'),
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
				name: formData.get('name'),
				type: formData.get('type'),
				notes: formData.get('notes'),
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
