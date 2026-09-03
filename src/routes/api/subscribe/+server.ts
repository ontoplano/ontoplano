import { json, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clientKey, rateLimit } from '$lib/server/rate-limit';
import { ValidationError } from '$lib/server/services/errors';
import { newsletterEnabled, newsletterOrigin, subscribe } from '$lib/server/services/newsletter';

/**
 * The one public endpoint the newsletter form posts to.
 *
 * The form is in the footer of ontoplano.com, which is a different origin from
 * this app and a directory of static files with nothing behind it — so the
 * post comes here, cross-origin, and the browser will not send it without
 * being told. Which origin is allowed is the instance's own setting, echoed
 * back only when it matches exactly: an `Access-Control-Allow-Origin` that
 * reflects whatever asked is not a CORS policy.
 *
 * On an instance with no newsletter this route is a 404 in both methods, so a
 * self-hosted install does not advertise an endpoint it will refuse.
 *
 * ## What it answers
 *
 * The same thing, always: accepted. Whether the address was new, already on
 * the list, or previously unsubscribed is not the form's to disclose — the
 * moment those answers differ the form is a way to ask "is this person a
 * subscriber?" about anybody.
 */

/**
 * Two a minute, ten an hour, per address.
 *
 * Each accepted post sends one mail to an address somebody typed, which is the
 * shape of a thing used to send mail to people who did not ask. The service
 * refuses to write twice to an address that is already confirmed; this is the
 * layer in front of that, for the addresses that are not.
 */
const PER_MINUTE = 2;
const PER_HOUR = 10;

function corsHeaders(request: Request): Record<string, string> {
	const allowed = newsletterOrigin();
	const asked = request.headers.get('origin');

	// Echoed only on an exact match, and `Vary` because the answer depends on
	// the request — without it a cache can serve one origin's header to another.
	if (!allowed || asked !== allowed) return { vary: 'origin' };

	return {
		vary: 'origin',
		'access-control-allow-origin': allowed,
		'access-control-allow-methods': 'POST, OPTIONS',
		'access-control-allow-headers': 'content-type',
		'access-control-max-age': '86400'
	};
}

export const OPTIONS: RequestHandler = async ({ request }) => {
	if (!newsletterEnabled()) return text('Not found', { status: 404 });
	return new Response(null, { status: 204, headers: corsHeaders(request) });
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!newsletterEnabled()) return text('Not found', { status: 404 });

	const headers = corsHeaders(request);
	const key = clientKey(request, getClientAddress);

	for (const [limit, window] of [
		[PER_MINUTE, 60_000],
		[PER_HOUR, 3_600_000]
	] as const) {
		const budget = rateLimit(`subscribe:${window}:${key}`, limit, window);
		if (!budget.allowed) {
			return json(
				{ ok: false, message: 'Too many tries. Give it a minute.' },
				{
					status: 429,
					headers: { ...headers, 'retry-after': String(budget.retryAfterSeconds) }
				}
			);
		}
	}

	// Both shapes, because the form works with and without JavaScript: a plain
	// `<form>` sends urlencoded and `fetch` sends JSON.
	let email: unknown;
	const contentType = request.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		email = await request
			.json()
			.then((body) => (body as { email?: unknown })?.email)
			.catch(() => undefined);
	} else {
		email = (await request.formData().catch(() => null))?.get('email');
	}

	try {
		await subscribe(email, 'site');
	} catch (error) {
		if (error instanceof ValidationError) {
			return json({ ok: false, message: error.message }, { status: 400, headers });
		}
		throw error;
	}

	return json(
		{ ok: true, message: 'Check your inbox — there is one link to follow.' },
		{ headers }
	);
};
