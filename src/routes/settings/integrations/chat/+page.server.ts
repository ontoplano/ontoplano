import type { Actions, PageServerLoad } from './$types';

import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	configuredModelKey,
	describeModelKey,
	removeModelKey,
	saveModelKey
} from '$lib/server/services/model-keys';
import { listModels } from '$lib/server/services/model-catalog';
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from '$lib/assistant-providers';
import { getChatMayDelete } from '$lib/services/settings';
import { setAssistantMayDelete } from '$lib/services/preferences';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		configured: describeModelKey(ctx),
		/*
		 * Whether the chat holds the deleting grant. Off unless somebody said
		 * otherwise — and theirs to say, which is the whole point of it being
		 * here rather than decided in the route that answers a chat turn.
		 */
		mayDelete: getChatMayDelete(locals.user!.id),
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

	/**
	 * What this provider will answer to, asked with the key on the form.
	 *
	 * The key may not be saved yet — somebody pastes one and wants to see the
	 * models before committing to it — so the form sends what it is holding.
	 * Where the field is empty and a key is already stored, the stored one is
	 * used, which is how "Replace" can browse without retyping.
	 */
	models: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		const provider = String(form.get('provider') ?? '');
		if (!(PROVIDER_IDS as readonly string[]).includes(provider))
			return { success: false, action: 'models', message: 'Unknown provider' };

		try {
			const typed = String(form.get('key') ?? '').trim();
			const stored = typed ? null : configuredModelKey(ctx);
			const key = typed || (stored?.provider === provider ? stored.key : '');
			const models = await listModels(
				provider as ProviderId,
				key,
				String(form.get('baseUrl') ?? '') || null
			);
			return { success: true, action: 'models', models };
		} catch (error) {
			return toActionFailure(error);
		}
	},

	/** The one grant the chat has to be given rather than born with. */
	permissions: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		try {
			setAssistantMayDelete(ctx, form.get('mayDelete'));
		} catch (error) {
			return toActionFailure(error);
		}
		return { success: true, action: 'permissions' };
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
