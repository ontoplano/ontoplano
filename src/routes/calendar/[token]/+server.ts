import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/server/services/ctx';
import { buildFeed } from '$lib/server/services/calendar-feed';
import { paymentHoldFor } from '$lib/server/services/access';
import { authenticateToken } from '$lib/server/services/tokens';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * The plan, as a calendar anybody's software can subscribe to.
 *
 * Unauthenticated in the session sense on purpose: this URL is pasted into
 * Google Calendar or an iPhone, which will fetch it from their own servers with
 * no cookie, no header and no way to be asked anything. The secret is the URL —
 * the same bargain Google makes with its own "secret address in iCal format".
 *
 * Which is why the token in the path must hold `calendar:read` and **nothing
 * else**. A URL is written into config files, walked past by every proxy in
 * between, and sometimes handed to a partner; the one thing that keeps that
 * bounded is that the credential it carries cannot do anything but this. A
 * powerful token pasted here is refused rather than honoured, so nobody can
 * arrive at a working feed with a key that also writes.
 */

/**
 * How often one link may be fetched.
 *
 * Calendar clients poll, and several of them poll harder than they admit — but
 * this generates a window of a plan on every hit, so an unthrottled link is a
 * free way to make the box work. Generous enough that no honest client notices.
 */
const FEED_LIMIT = 60;
const WINDOW_MS = 60_000;

export const GET: RequestHandler = async ({ params, url, setHeaders }) => {
	const now = new Date();

	let token;
	try {
		token = authenticateToken(params.token, now);
	} catch {
		// Deliberately the same answer as a token that is real but wrong-scoped,
		// below: telling the difference is telling somebody which half of a
		// guessed URL they got right.
		return notFound();
	}

	// Exactly this scope. Not "at least" — see the note above.
	if (token.scopes.length !== 1 || token.scopes[0] !== 'calendar:read') return notFound();

	const budget = rateLimit(`feed:${token.tokenId}`, FEED_LIMIT, WINDOW_MS);
	if (!budget.allowed) {
		return new Response('Too many requests\n', {
			status: 429,
			headers: { 'retry-after': String(budget.retryAfterSeconds) }
		});
	}

	// An account that has stopped paying stops publishing, the same as its
	// pages and its API. Its data is untouched and the link works again the
	// moment the account does.
	if (paymentHoldFor(token.userId) !== null) return notFound();

	const feed = buildFeed(buildCtx(token.userId, { now }), {
		host: url.hostname,
		calendarName: 'Ontoplano'
	});

	setHeaders({
		'content-type': 'text/calendar; charset=utf-8',
		// Named, so a client that offers to save it does not call it `[token]`.
		'content-disposition': 'inline; filename="ontoplano.ics"',
		// A plan changes through the day; an hour is what the feed itself asks
		// for in REFRESH-INTERVAL and the two should not disagree.
		'cache-control': 'private, max-age=3600',
		/*
		 * This URL is a credential, so it stays out of search results if it is
		 * ever posted somewhere public.
		 *
		 * There is deliberately no `Referrer-Policy` here: `hooks.server.ts` sets
		 * `same-origin` on every response and wins, so writing `no-referrer`
		 * would be a line that reads like a guarantee and is not one. It costs
		 * nothing anyway — this response is `text/calendar`, which no browser
		 * renders and from which nothing is ever navigated.
		 */
		'x-robots-tag': 'noindex, nofollow'
	});

	return new Response(feed);
};

/** One answer for every way of not being allowed in. */
function notFound(): Response {
	return new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain' } });
}
