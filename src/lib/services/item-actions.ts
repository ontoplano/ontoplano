import type { Actions, RequestEvent } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	createItem,
	deleteItem,
	recordPaid,
	restockItem,
	setItemAttributes,
	setItemLocation,
	setQty,
	toggleBought,
	toggleSnoozed,
	updateItem
} from '$lib/services/inventory';

/**
 * Everything that can be done to an inventory item, wherever the row is.
 *
 * The Inventory room shows everything; a notebook shows what is filed under
 * it, and ticking something bought there has to mean the same thing. The
 * notebook mounts these under a prefix — see `$lib/services/scoped-actions`.
 *
 * What is not here is the room's own furniture: sections, locations, the
 * attribute vocabulary. Those are the room managing itself, and a notebook has
 * no business offering them.
 */
type Event = Pick<RequestEvent, 'request'> & { locals: App.Locals };

/**
 * The thing's own fields, as a form sends them.
 *
 * Two parallel lists rather than indexed names, for the same reason a workout
 * session's lines are: a row is added and removed in the browser, and
 * `fieldName[3]` left behind by a removed row is a hole to code around.
 */
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

export const itemHandlers = {
	create: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			const name = formData.get('label');
			const ctx = buildCtx(locals.user!.id);
			const { alreadyHad, id } = createItem(ctx, {
				name,
				type: formData.get('type'),
				notes: formData.get('notes'),
				price: formData.get('price'),
				inventoryCategoryId: formData.get('inventoryCategoryId'),
				locationId: formData.get('locationId'),
				idealQty: formData.get('idealQty'),
				// `has` rather than `get`: the room's form says nothing about a
				// notebook and must not be read as taking the item out of one.
				...(formData.has('notebookId') ? { notebookId: formData.get('notebookId') } : {})
			});

			/*
			 * Attributes, when the form carried any.
			 *
			 * Only when something was written: they are replaced wholesale, and
			 * adding a thing that is already on the list must not wipe what the
			 * row already says about itself.
			 */
			const attributes = fieldsFrom(formData);
			if (Object.keys(attributes).length > 0) setItemAttributes(ctx, id, attributes);

			return {
				success: true,
				action: 'create',
				// The id comes back so a receipt can offer a way straight into it.
				id,
				notice: alreadyHad
					? `${String(name).trim()} was already on the list, so it is back on it.`
					: null
			};
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			const ctx = buildCtx(locals.user!.id);
			const id = Number(formData.get('id'));
			updateItem(ctx, id, {
				name: formData.get('label'),
				type: formData.get('type'),
				notes: formData.get('notes'),
				price: formData.get('price'),
				inventoryCategoryId: formData.get('inventoryCategoryId'),
				idealQty: formData.get('idealQty'),
				...(formData.has('notebookId') ? { notebookId: formData.get('notebookId') } : {})
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
	setQty: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			setQty(buildCtx(locals.user!.id), Number(formData.get('id')), Number(formData.get('qty')));
			return { success: true, action: 'setQty' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleBought: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			toggleBought(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** What you actually paid. Never part of the tick, which has to stay one press. */
	paid: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			recordPaid(buildCtx(locals.user!.id), Number(formData.get('id')), formData.get('paid'));
			return { success: true, action: 'paid' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			deleteItem(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	restock: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			restockItem(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** The thing's own fields, written from the panel rather than the editor. */
	setFields: async ({ request, locals }: Event) => {
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

	toggleSnoozed: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			toggleSnoozed(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
} satisfies Actions;
