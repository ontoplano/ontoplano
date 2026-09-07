import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { familyUserIds } from '$lib/server/services/subscriptions';
import { toActionFailure } from '$lib/server/http-errors';
import { recipesByItem } from '$lib/server/services/recipes';
import {
	createLocation,
	deleteLocation,
	listLocations,
	locationTree,
	updateLocation
} from '$lib/server/services/locations';
import { getCurrency } from '$lib/server/settings';
import {
	createCategory,
	deleteCategory,
	renameCategory,
	setCategoryShared,
	createItem,
	deleteItem,
	listCategories,
	setCategoryFood,
	listItems,
	recordPaid,
	restockItem,
	setItemAttributes,
	setItemLocation,
	setQty,
	toggleBought,
	toggleSnoozed,
	updateItem
} from '$lib/server/services/shopping';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		items: listItems(ctx),
		// The other axis the same rows are read on: where each thing lives.
		locationTree: locationTree(ctx),
		locations: listLocations(ctx),
		/** Which recipes use each item — the other half of the ingredient link. */
		usedIn: recipesByItem(ctx),
		shoppingCategories: listCategories(ctx),
		currency: getCurrency(ctx.userId),
		// Whether the share-with-family switch has anybody to share with.
		onFamilyPlan: familyUserIds(ctx.userId).length > 1
	};
};

/** Every action here is the same shape: read the form, call the service, map errors. */
/** `fieldName`/`fieldValue` pairs, in order, as the object they describe. */
function fieldsFrom(formData: FormData): Record<string, string> {
	const names = formData.getAll('fieldName').map(String);
	const values = formData.getAll('fieldValue').map(String);
	const out: Record<string, string> = {};
	names.forEach((name, i) => {
		const key = name.trim();
		if (key) out[key] = (values[i] ?? '').trim();
	});
	return out;
}

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

	/** The owner's switch: the family sees the section and fills it. */
	setCategoryShared: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setCategoryShared(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('shared') === 'true'
			);
			return { success: true, action: 'setCategoryShared' };
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
				shoppingCategoryId: formData.get('shoppingCategoryId'),
				locationId: formData.get('locationId'),
				idealQty: formData.get('idealQty')
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
			const ctx = buildCtx(locals.user!.id);
			const id = Number(formData.get('id'));
			updateItem(ctx, id, {
				name: formData.get('label'),
				type: formData.get('type'),
				notes: formData.get('notes'),
				price: formData.get('price'),
				shoppingCategoryId: formData.get('shoppingCategoryId'),
				idealQty: formData.get('idealQty')
			});
			/*
			 * The thing's own fields, saved with the rest of it.
			 *
			 * Not every thing shares a shape — a tape has a length, a cable has
			 * a plug — so these are this thing's, written as pairs. They go
			 * through the same save because a second button for them would be a
			 * second thing to remember to press.
			 */
			setItemAttributes(ctx, id, fieldsFrom(formData));
			// Where it lives, when the form carried the field. `updateItem`
			// re-parses the row and would not have known about it; this is the
			// same call a drag makes.
			if (formData.has('locationId')) {
				const raw = String(formData.get('locationId') ?? '');
				setItemLocation(ctx, id, raw === '' ? null : Number(raw));
			}
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * How many of it there are, from the arrows beside the name.
	 *
	 * Its own action rather than a field on `update`: this is pressed in a
	 * cupboard with one thumb, and `update` re-parses the whole row.
	 */
	setQty: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setQty(buildCtx(locals.user!.id), Number(formData.get('id')), Number(formData.get('qty')));
			return { success: true, action: 'setQty' };
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
	},
	createLocation: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createLocation(buildCtx(locals.user!.id), {
				name: formData.get('heading'),
				parentId: formData.get('parentId'),
				notes: formData.get('notes')
			});
			return { success: true, action: 'createLocation' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateLocation: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateLocation(buildCtx(locals.user!.id), Number(formData.get('id')), {
				name: formData.get('heading'),
				parentId: formData.get('parentId'),
				notes: formData.get('notes')
			});
			return { success: true, action: 'updateLocation' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteLocation: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteLocation(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true, action: 'deleteLocation' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * Where a thing lives. An empty value takes its address away.
	 *
	 * Its own action rather than a field on `update`, because this is what a
	 * drag posts: one item, one location, nothing else touched — and `update`
	 * re-parses the whole row, which would mean a drag re-sending a name and a
	 * price to move something into a drawer.
	 */
	putItem: async ({ request, locals }) => {
		const formData = await request.formData();
		const raw = String(formData.get('locationId') ?? '');
		try {
			setItemLocation(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				raw === '' ? null : Number(raw)
			);
			return { success: true, action: 'putItem' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setFields: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setItemAttributes(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				fieldsFrom(formData)
			);
			return { success: true, action: 'setFields' };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
