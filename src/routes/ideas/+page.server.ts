import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import {
	createIdea,
	deleteIdea,
	listIdeas,
	listTags,
	toggleApplied,
	toggleFavorite,
	updateAppliedNote,
	updateIdea
} from '$lib/server/services/ideas';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return { ideas: listIdeas(ctx), allTags: listTags(ctx) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createIdea(buildCtx(locals.user!.id), {
				content: formData.get('content'),
				tags: formData.get('tags')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateIdea(buildCtx(locals.user!.id), Number(formData.get('id')), {
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
			deleteIdea(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleApplied: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			toggleApplied(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('appliedNote')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateAppliedNote: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateAppliedNote(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('appliedNote')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleFavorite: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			toggleFavorite(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
