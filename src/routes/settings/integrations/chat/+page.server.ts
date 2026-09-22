import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

/**
 * The chat's settings moved onto the AI tab.
 *
 * They were a tab of their own beside it, which made three tabs where the
 * first two were both about the assistant. The address stays because things
 * link to it — the chat itself does, when it has no model to run on.
 */
export const load: PageServerLoad = () => {
	redirect(308, '/settings/integrations#chat');
};
