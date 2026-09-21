import type { Actions, PageServerLoad } from './$types';

import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	describeModelKey,
	removeModelKey,
	saveModelKey
} from '$lib/server/services/model-keys';
import { PROVIDERS } from '$lib/assistant-providers';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		configured: describeModelKey(ctx),
		/*
		 * The provider list rides down with the page rather than being imported
		 * by it, so the form and the service can only ever disagree about a
		 * provider by disagreeing with the same file.
		 */
		providers: PROVIDERS
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		try {
			const saved = saveModelKey(ctx, {
				provider: form.get('provider'),
				key: form.get('key'),
				model: form.get('model'),
				baseUrl: form.get('baseUrl')
			});
			return { success: true, saved };
		} catch (error) {
			return toActionFailure(error);
		}
	},

	remove: async ({ locals }) => {
		const ctx = buildCtx(locals.user!.id);
		try {
			removeModelKey(ctx);
		} catch (error) {
			return toActionFailure(error);
		}
		return { success: true };
	}
};
