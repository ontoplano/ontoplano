import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import {
	createPerson,
	deletePerson,
	entriesAbout,
	listPeople,
	updatePerson
} from '$lib/server/services/people';

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	const selected = Number(url.searchParams.get('person'));

	return {
		people: listPeople(ctx),
		// The whole point of a person having a page: everything you wrote that
		// mentioned them, in one place.
		selected: Number.isFinite(selected) && selected > 0 ? selected : null,
		entries: Number.isFinite(selected) && selected > 0 ? entriesAbout(ctx, selected) : []
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createPerson(buildCtx(locals.user!.id), {
				name: formData.get('label'),
				relationship: formData.get('relationship'),
				birthday: formData.get('bornOn'),
				phone: formData.get('theirPhone'),
				email: formData.get('theirEmail'),
				notes: formData.get('notes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updatePerson(buildCtx(locals.user!.id), Number(formData.get('id')), {
				name: formData.get('label'),
				relationship: formData.get('relationship'),
				birthday: formData.get('bornOn'),
				phone: formData.get('theirPhone'),
				email: formData.get('theirEmail'),
				notes: formData.get('notes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deletePerson(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
