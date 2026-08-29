import type { Actions } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import { createToken } from '$lib/server/services/tokens';

/**
 * Where the phone widget connects itself.
 *
 * The widget used to ask for an address and a pasted token, which is asking a
 * person to do a key exchange by hand. Now its Connect button opens this page
 * in the browser — where a session already exists — one tap mints the key, and
 * the app link on the way back carries it home. Nobody sees a token.
 */
export const actions: Actions = {
	connect: async ({ locals, url }) => {
		const ctx = buildCtx(locals.user!.id);

		try {
			// `today:read` and nothing else: a widget sitting on a lock screen
			// should not carry a key to the diary.
			const token = createToken(ctx, { name: 'Phone widget', scopes: ['today:read'] });
			return { success: true, token: token.plaintext, origin: url.origin };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
