import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { recordBugReport } from '$lib/server/services/client-errors';
import { toJsonError } from '$lib/server/http-errors';
import { UnauthorizedError } from '$lib/server/services/errors';

/**
 * "Something here is wrong", from wherever somebody noticed it.
 *
 * Four things travel: the account, the sentence, the page, and the browser.
 * The page because the first question anybody reading these asks is "where",
 * and the browser because the second is "on what" — Firefox 151 on Linux is
 * the difference between a bug and a rendering quirk.
 *
 * The dialog in `HelpDock.svelte` names all four. It said "nothing else" while
 * this quietly attached a user agent, which is the kind of promise that is
 * worse than saying nothing: anything added here has to be added there in the
 * same edit.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		if (!locals.user) throw new UnauthorizedError('Sign in first');
		const body = (await request.json()) as Record<string, unknown>;
		recordBugReport(buildCtx(locals.user.id), {
			message: body.message,
			url: body.url,
			userAgent: request.headers.get('user-agent')
		});
		return json({ ok: true });
	} catch (e) {
		return toJsonError(e);
	}
};
