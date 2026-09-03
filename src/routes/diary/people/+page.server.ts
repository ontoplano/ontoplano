import { fail } from '@sveltejs/kit';
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
import { mediaLimits, removePersonPicture, setPersonPicture } from '$lib/server/services/media';

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	const selected = Number(url.searchParams.get('person'));

	return {
		people: listPeople(ctx),
		// What the instance allows, so the browser can refuse an over-large file
		// before sending a body the server would reject before reading it.
		pictureKilobytes: mediaLimits().maxKilobytes,
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
				remindOnBirthday: formData.get('tellMe'),
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
				remindOnBirthday: formData.get('tellMe'),
				phone: formData.get('theirPhone'),
				email: formData.get('theirEmail'),
				notes: formData.get('notes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/*
	 * A face, in one gesture.
	 *
	 * Choosing the file is the whole act — there is no second button — and the
	 * size is checked in the browser first, because a body over the adapter's
	 * limit is refused before this code runs and answers with something no form
	 * can read.
	 */
	setPicture: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const file = formData.get('file');
		if (!id) return fail(400, { message: 'No person' });
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { message: 'Choose a picture first.' });

		try {
			setPersonPicture(buildCtx(locals.user!.id), id, {
				bytes: Buffer.from(await file.arrayBuffer()),
				filename: file.name,
				alt: String(formData.get('name') ?? '')
			});
			return { success: true, action: 'setPicture' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	removePicture: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			removePersonPicture(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true, action: 'removePicture' };
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
