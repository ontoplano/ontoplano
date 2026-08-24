import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import {
	createEntry,
	createWins,
	deleteEntry,
	listEntries,
	listTags,
	updateEntry
} from '$lib/server/services/diary';
import { toActionFailure } from '$lib/server/services/errors';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return { entries: listEntries(ctx), allTags: listTags(ctx) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createEntry(buildCtx(locals.user!.id), {
				content: formData.get('content'),
				tags: formData.get('tags')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	createWins: async ({ request, locals }) => {
		const formData = await request.formData();
		// The form numbers its rows, and can grow one; take them in order until
		// the numbering stops.
		const wins: FormDataEntryValue[] = [];
		for (let i = 0; formData.has(`win_${i}`); i++) wins.push(formData.get(`win_${i}`)!);

		try {
			createWins(buildCtx(locals.user!.id), {
				wins,
				tags: formData.get('tags'),
				forDate: formData.get('forDate')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateEntry(buildCtx(locals.user!.id), Number(formData.get('id')), {
				content: formData.get('content'),
				tags: formData.get('tags')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteEntry(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
