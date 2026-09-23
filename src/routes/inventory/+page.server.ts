import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { itemHandlers } from '$lib/services/item-actions';
import { host } from '$lib/services/host';
import { toActionFailure } from '$lib/http-errors';
import { recipesByItem } from '$lib/services/recipes';
import {
	listAttributes,
	removeAttribute,
	renameAttribute,
	renameAttributeValue,
	setAttributeColor
} from '$lib/services/attributes';
import {
	createLocation,
	deleteLocation,
	listLocations,
	locationTree,
	updateLocation
} from '$lib/services/locations';
import {
	getCurrency,
	getPanelWidth,
	setPanelWidth,
	LOCATION_PANEL_WIDTH_KEY
} from '$lib/services/settings';
import {
	createCategory,
	deleteCategory,
	renameCategory,
	setCategoryShared,
	listCategories,
	setCategoryFood,
	listItems,
	shoppingRun,
	setItemLocation
} from '$lib/services/inventory';

export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		items: listItems(ctx),
		// What a trip to the shop actually looks like: see `shoppingRun`.
		run: shoppingRun(ctx),
		// The other axis the same rows are read on: where each thing lives.
		locationTree: locationTree(ctx),
		locations: listLocations(ctx),
		/** Which recipes use each item — the other half of the ingredient link. */
		usedIn: recipesByItem(ctx),
		inventoryCategories: listCategories(ctx),
		currency: getCurrency(ctx.userId),
		// Where the handle between the panel and the list was left.
		locationPanelRem: getPanelWidth(ctx.userId, LOCATION_PANEL_WIDTH_KEY),
		// Whether the share-with-family switch has anybody to share with.
		onFamilyPlan: host.familyUserIds(ctx.userId).length > 1,
		// What the things say about themselves, for the Attributes screen and for
		// the filters — both are lists of what has actually been typed.
		attributes: listAttributes(ctx)
	};
};

/**
 * Every action here is the same shape: read the form, call the service, map errors.
 *
 * What an item itself can be asked to do is in `$lib/services/item-actions`,
 * spread in below — a notebook's Inventory tab mounts the same handlers, so
 * ticking something bought there is the same code as ticking it here. What
 * stays is the room managing itself: its sections, its locations, and the
 * vocabulary its things describe themselves with.
 */
export const actions = {
	/** Rename an attribute everywhere it is used — or merge it into another. */
	renameAttribute: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			renameAttribute(buildCtx(locals.user!.id), formData.get('from'), formData.get('to'));
			return { success: true, action: 'renameAttribute' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Rename one value of one, wherever a thing says it. */
	renameAttributeValue: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			renameAttributeValue(
				buildCtx(locals.user!.id),
				formData.get('key'),
				formData.get('from'),
				formData.get('to')
			);
			return { success: true, action: 'renameAttributeValue' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Take an attribute off everything that has it. The things stay. */
	removeAttribute: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			removeAttribute(buildCtx(locals.user!.id), formData.get('key'));
			return { success: true, action: 'removeAttribute' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** A colour on an attribute, or on one of its values. Empty takes it off. */
	setAttributeColor: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			setAttributeColor(
				buildCtx(locals.user!.id),
				formData.get('key'),
				formData.get('value') ?? '',
				formData.get('color') ?? ''
			);
			return { success: true, action: 'setAttributeColor' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Which categories hold food, and therefore what can be an ingredient. */
	/** One tick, saved as it lands — the modal has no save button any more. */
	setCategoryFood: async ({ request, locals }: IsolatedEvent) => {
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
	setCategoryShared: async ({ request, locals }: IsolatedEvent) => {
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

	renameCategory: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			renameCategory(buildCtx(locals.user!.id), Number(formData.get('id')), formData.get('name'));
			return { success: true, action: 'renameCategory' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteCategory: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			deleteCategory(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true, action: 'deleteCategory' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	saveCategories: async ({ request, locals }: IsolatedEvent) => {
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
	createCategory: async ({ request, locals }: IsolatedEvent) => {
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

	...itemHandlers,

	createLocation: async ({ request, locals }: IsolatedEvent) => {
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

	updateLocation: async ({ request, locals }: IsolatedEvent) => {
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

	deleteLocation: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			deleteLocation(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true, action: 'deleteLocation' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Where the reader dragged the divider. Posted once, when they let go. */
	setLocationPanelWidth: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		try {
			setPanelWidth(locals.user!.id, LOCATION_PANEL_WIDTH_KEY, Number(formData.get('rem')));
			return { success: true, action: 'setLocationPanelWidth' };
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
	putItem: async ({ request, locals }: IsolatedEvent) => {
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
	}
};
