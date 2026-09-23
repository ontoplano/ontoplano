import { json } from '@sveltejs/kit';

/**
 * The discovery documents are read by anything, from anywhere.
 *
 * A connector screen in a browser fetches these cross-origin before anybody
 * has signed in or any token exists, so they answer every origin and say so
 * for a day. There is nothing here that is not already public: two addresses
 * and a list of permission names.
 */
export function publicJson(body: unknown): Response {
	return json(body, {
		headers: {
			'access-control-allow-origin': '*',
			'access-control-allow-headers': '*',
			'cache-control': 'public, max-age=86400'
		}
	});
}

/** The preflight those cross-origin reads send first. */
export function publicPreflight(methods: string): Response {
	return new Response(null, {
		status: 204,
		headers: {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': methods,
			'access-control-allow-headers': '*',
			'access-control-max-age': '86400'
		}
	});
}
