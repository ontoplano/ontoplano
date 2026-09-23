import { error } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

import { findClient } from '$lib/server/services/oauth';

/**
 * The last step, and the only reason it exists is the browser's rules.
 *
 * `form-action 'self'` — right for every form in the app — also governs where
 * a form's *redirect* may land, so the consent screen cannot send anybody
 * straight back to the assistant. This page is what it sends them to instead,
 * and the hand-back from here is an ordinary navigation.
 *
 * Which makes this an open redirect unless it is careful, so it is: the
 * address must be one the named client registered, compared against the list
 * rather than sniffed for a hostname.
 */
export const load: PageServerLoad = async ({ url }) => {
	const to = url.searchParams.get('to') ?? '';
	const clientId = url.searchParams.get('client_id') ?? '';
	const client = clientId ? findClient(clientId) : null;
	if (!client) error(400, 'That assistant is not registered with this instance.');

	let target: URL;
	try {
		target = new URL(to);
	} catch {
		error(400, 'That is not an address to be sent to.');
	}

	/*
	 * The code and the state are on the query, so what is compared is the
	 * address without it — against the whole of each registered one, never a
	 * prefix of it.
	 */
	const bare = `${target.origin}${target.pathname}`;
	const registered = client.redirectUris.some((one) => {
		const known = new URL(one);
		return `${known.origin}${known.pathname}` === bare;
	});
	if (!registered) error(400, 'That assistant never registered that address.');

	return { to: target.toString(), client: client.name };
};
