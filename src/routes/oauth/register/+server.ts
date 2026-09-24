import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

import { registerClient } from '$lib/server/services/oauth';
import { publicPreflight } from '$lib/server/oauth-http';
import { rateLimit, clientKey } from '$lib/server/rate-limit';
import { toJsonError } from '$lib/http-errors';

/**
 * A client introducing itself (RFC 7591).
 *
 * Unauthenticated, because it has to be: the assistant meets this instance
 * before the person it belongs to has signed in, and there is nobody to
 * authenticate as yet. Nothing it can do here reaches an account — it gets an
 * id, and an id is worth nothing until somebody says yes on the consent
 * screen.
 *
 * It is still the one write an anonymous caller can cause, so it is budgeted
 * per address, and a refusal is a refusal rather than a queue.
 */
const REGISTRATIONS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;
/** A registration document is a handful of short strings. */
const MAX_BODY_BYTES = 8 * 1024;

export const POST: RequestHandler = async (event) => {
	const who = clientKey(event.request, event.getClientAddress);
	const { allowed } = rateLimit(`oauth-register:${who}`, REGISTRATIONS_PER_HOUR, HOUR_MS);
	if (!allowed) {
		return json(
			{ error: 'temporarily_unavailable', error_description: 'Too many registrations from here.' },
			{ status: 429, headers: { 'access-control-allow-origin': '*' } }
		);
	}

	const raw = await event.request.text();
	if (raw.length > MAX_BODY_BYTES) {
		return json({ error: 'invalid_client_metadata' }, { status: 413 });
	}

	let body: Record<string, unknown>;
	try {
		body = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return json({ error: 'invalid_client_metadata' }, { status: 400 });
	}

	try {
		const client = registerClient({
			name: body.client_name ?? body.client_id ?? 'An assistant',
			redirectUris: body.redirect_uris,
			uri: body.client_uri,
			now: new Date()
		});

		return json(
			{
				client_id: client.clientId,
				client_name: client.name,
				redirect_uris: client.redirectUris,
				grant_types: ['authorization_code'],
				response_types: ['code'],
				// No secret, and none to rotate: PKCE is what proves the client
				// redeeming a code is the one the code was issued to.
				token_endpoint_auth_method: 'none',
				client_id_issued_at: Math.floor(Date.now() / 1000)
			},
			{ status: 201, headers: { 'access-control-allow-origin': '*' } }
		);
	} catch (error) {
		// The shape RFC 7591 asks for, with the sentence the service wrote.
		const answer = await toJsonError(error);
		const said = await answer.json().catch(() => ({ message: 'Invalid client metadata' }));
		return json(
			{ error: 'invalid_client_metadata', error_description: said.message },
			{ status: answer.status, headers: { 'access-control-allow-origin': '*' } }
		);
	}
};

export const OPTIONS: RequestHandler = () => publicPreflight('POST, OPTIONS');
