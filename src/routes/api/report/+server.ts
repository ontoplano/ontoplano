import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { recordBugReport } from '$lib/server/services/client-errors';
import { toJsonError } from '$lib/server/http-errors';
import { UnauthorizedError } from '$lib/server/services/errors';

/**
 * "Something here is wrong", from wherever somebody noticed it.
 *
 * The address of the page comes with it, because the first question anybody
 * reading these asks is "where", and the person reporting should not have to
 * describe the screen they are looking at.
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
