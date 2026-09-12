import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildCtx } from '$lib/services/ctx';
import { recordBugReport } from '$lib/server/services/client-errors';
import { toJsonError } from '$lib/http-errors';
import { ForbiddenError, UnauthorizedError } from '$lib/services/errors';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * How much one account may say per hour.
 *
 * Enough for somebody hitting a bad afternoon and reporting every wall they
 * walk into; not enough to be a way of posting into the operator's mailbox
 * at will, which is what this endpoint becomes without a number here — each
 * report is a mail the instance sends on the sender's say-so.
 */
const REPORTS_PER_HOUR = 20;
const REPORT_WINDOW_MS = 60 * 60 * 1000;

/**
 * "Something here is wrong" — or "this could be better" — from wherever
 * somebody noticed it.
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

		const { allowed, retryAfterSeconds } = rateLimit(
			`report:${locals.user.id}`,
			REPORTS_PER_HOUR,
			REPORT_WINDOW_MS
		);
		if (!allowed)
			throw new ForbiddenError(
				`That is a lot of reports at once. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`
			);

		const body = (await request.json()) as Record<string, unknown>;
		recordBugReport(
			buildCtx(locals.user.id),
			{
				message: body.message,
				url: body.url,
				userAgent: request.headers.get('user-agent')
			},
			body.kind === 'suggestion' ? 'suggestion' : 'report'
		);
		return json({ ok: true });
	} catch (e) {
		return toJsonError(e);
	}
};
