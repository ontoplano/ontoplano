import type { LocalRouteEvent } from '$lib/local/routes';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	createIdea,
	deleteIdea,
	listIdeas,
	listTags,
	toggleApplied,
	toggleFavorite,
	updateAppliedNote,
	updateIdea
} from '$lib/services/ideas';

export const load = async ({ locals }: LocalRouteEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return { ideas: listIdeas(ctx), allTags: listTags(ctx) };
};

export const actions = {
	create: async ({ request, locals }: LocalRouteEvent) => {
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

	update: async ({ request, locals }: LocalRouteEvent) => {
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

	delete: async ({ request, locals }: LocalRouteEvent) => {
		const formData = await request.formData();
		try {
			deleteIdea(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleApplied: async ({ request, locals }: LocalRouteEvent) => {
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

	updateAppliedNote: async ({ request, locals }: LocalRouteEvent) => {
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

	toggleFavorite: async ({ request, locals }: LocalRouteEvent) => {
		const formData = await request.formData();
		try {
			toggleFavorite(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
