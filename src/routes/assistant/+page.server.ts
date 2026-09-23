import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

import { buildCtx } from '$lib/services/ctx';
import { describeModelKey } from '$lib/server/services/model-keys';
import { providerOf } from '$lib/assistant-providers';
import { CHAT_IN_APP } from '$lib/features';

export const load: PageServerLoad = async ({ locals }) => {
	// Switched off while the shape of it is decided; see `$lib/features`.
	if (!CHAT_IN_APP) redirect(302, '/settings/integrations');

	const ctx = buildCtx(locals.user!.id);
	const configured = describeModelKey(ctx);
	/*
	 * No key, no chat. The room does not exist until one is brought, and the
	 * way in is the screen that takes one — not an empty chat explaining
	 * itself.
	 */
	if (!configured) redirect(302, '/settings/integrations#chat');

	const meta = providerOf(configured.provider);
	return {
		provider: meta?.label ?? configured.provider,
		model: configured.model ?? meta?.defaultModel ?? ''
	};
};
