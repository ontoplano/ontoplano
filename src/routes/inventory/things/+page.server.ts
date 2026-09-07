import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import {
	createLocation,
	deleteLocation,
	locationTree,
	listLocations,
	updateLocation
} from '$lib/server/services/locations';
import {
	createOwnedThing,
	listItems,
	setItemAttributes,
	setItemLocation
} from '$lib/server/services/shopping';

/**
 * The half of the room that answers "where is it".
 *
 * The tree and every item in one load: a house is tens of locations and
 * hundreds of things, which is one query each, and paging a drawer would be
 * the wrong shape for something people scan rather than read.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		tree: locationTree(ctx),
		locations: listLocations(ctx),
		items: listItems(ctx)
	};
};

/** The fields form posts `field-name` and `field-value` pairs, in order. */
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

	/** Put a thing somewhere, or take its address away with an empty value. */
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
	},

	/**
	 * Something you own that was never on a list.
	 *
	 * The list's own form is for things to buy; this one is for the tape that
	 * has been in the drawer for ten years. Same table, already bought, filed
	 * where you said — so it never appears as something to get.
	 */
	createThing: async ({ request, locals }) => {
		const formData = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		const raw = String(formData.get('locationId') ?? '');
		try {
			const id = createOwnedThing(ctx, {
				name: formData.get('heading'),
				notes: formData.get('notes')
			});
			setItemLocation(ctx, id, raw === '' ? null : Number(raw));
			return { success: true, action: 'createThing' };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
