import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { itemHandlers } from '$lib/services/item-actions';
import { toActionFailure } from '$lib/http-errors';
import {
	removeAttribute,
	removeAttributeValue,
	renameAttribute,
	renameAttributeValue,
	setAttributeColor
} from '$lib/services/attributes';
import { createLocation, deleteLocation, updateLocation } from '$lib/services/locations';
import { setPanelWidth, LOCATION_PANEL_WIDTH_KEY } from '$lib/services/settings';
import { formAction } from '$lib/services/scoped-actions';
import {
	createCategory,
	deleteCategory,
	moveCategory,
	renameCategory,
	setCategoryColor,
	setCategoryShared,
	listCategories,
	setCategoryFood,
	setItemLocation
} from '$lib/services/inventory';

/**
 * Every action here is the same shape: read the form, call the service, map errors.
 *
 * What an item itself can be asked to do is in `$lib/services/item-actions`,
 * spread in below — a notebook's Inventory tab mounts the same handlers, so
 * ticking something bought there is the same code as ticking it here. What
 * stays is the room managing itself: its sections, its locations, and the
 * vocabulary its things describe themselves with.
 */
export const inventoryActions = {
	/** Rename an attribute everywhere it is used — or merge it into another. */
	renameAttribute: formAction((ctx, formData) => {
		renameAttribute(ctx, formData.get('from'), formData.get('to'));
		return { success: true, action: 'renameAttribute' };
	}),

	/** Rename one value of one, wherever a thing says it. */
	renameAttributeValue: formAction((ctx, formData) => {
		renameAttributeValue(ctx, formData.get('key'), formData.get('from'), formData.get('to'));
		return { success: true, action: 'renameAttributeValue' };
	}),

	/** Take an attribute off everything that has it. The things stay. */
	removeAttribute: formAction((ctx, formData) => {
		removeAttribute(ctx, formData.get('key'));
		return { success: true, action: 'removeAttribute' };
	}),

	/** Take one value off everything that says it. The attribute stays on the rest. */
	removeAttributeValue: formAction((ctx, formData) => {
		removeAttributeValue(ctx, formData.get('key'), formData.get('value'));
		return { success: true, action: 'removeAttributeValue' };
	}),

	/** A colour on an attribute, or on one of its values. Empty takes it off. */
	setAttributeColor: formAction((ctx, formData) => {
		setAttributeColor(
			ctx,
			formData.get('key'),
			formData.get('value') ?? '',
			formData.get('color') ?? ''
		);
		return { success: true, action: 'setAttributeColor' };
	}),

	/** Which categories hold food, and therefore what can be an ingredient. */
	/** One tick, saved as it lands — the modal has no save button any more. */
	setCategoryFood: formAction((ctx, formData) => {
		setCategoryFood(ctx, Number(formData.get('id')), formData.get('isFood') === 'true');
		return { success: true, action: 'setCategoryFood' };
	}),

	/** The owner's switch: the family sees the section and fills it. */
	setCategoryShared: formAction((ctx, formData) => {
		setCategoryShared(ctx, Number(formData.get('id')), formData.get('shared') === 'true');
		return { success: true, action: 'setCategoryShared' };
	}),

	renameCategory: formAction((ctx, formData) => {
		renameCategory(ctx, Number(formData.get('id')), formData.get('name'));
		return { success: true, action: 'renameCategory' };
	}),

	/** The colour a category's cards wear. Empty takes it off. */
	setCategoryColor: formAction((ctx, formData) => {
		setCategoryColor(ctx, Number(formData.get('id')), formData.get('color'));
		return { success: true, action: 'setCategoryColor' };
	}),

	/** One place up (-1) or down (1) the order the cards are drawn in. */
	moveCategory: formAction((ctx, formData) => {
		moveCategory(ctx, Number(formData.get('id')), Number(formData.get('delta')));
		return { success: true, action: 'moveCategory' };
	}),

	deleteCategory: formAction((ctx, formData) => {
		deleteCategory(ctx, Number(formData.get('id')));
		return { success: true, action: 'deleteCategory' };
	}),

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
	createCategory: formAction((ctx, formData) => {
		createCategory(ctx, {
			name: formData.get('label'),
			isFood: formData.get('isFood') === 'true'
		});
		return { success: true, action: 'createCategory' };
	}),

	...itemHandlers,

	createLocation: formAction((ctx, formData) => {
		createLocation(ctx, {
			name: formData.get('heading'),
			parentId: formData.get('parentId'),
			notes: formData.get('notes')
		});
		return { success: true, action: 'createLocation' };
	}),

	updateLocation: formAction((ctx, formData) => {
		updateLocation(ctx, Number(formData.get('id')), {
			name: formData.get('heading'),
			parentId: formData.get('parentId'),
			notes: formData.get('notes')
		});
		return { success: true, action: 'updateLocation' };
	}),

	deleteLocation: formAction((ctx, formData) => {
		deleteLocation(ctx, Number(formData.get('id')));
		return { success: true, action: 'deleteLocation' };
	}),

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
