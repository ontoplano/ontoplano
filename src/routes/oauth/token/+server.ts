import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/services/ctx';
import { createToken } from '$lib/server/services/tokens';
import { findClient, redeemCode } from '$lib/server/services/oauth';
import { publicPreflight } from '$lib/server/oauth-http';
import { record } from '$lib/services/audit';
import { ServiceError } from '$lib/services/errors';

/**
 * A code, spent for a key.
 *
 * What comes out is an ordinary `api_tokens` row — the same thing the key form
 * makes, carrying the scopes the person agreed to and named after the client
 * that asked, so it stands in the list under Settings → AI & Integrations with
 * a revoke button beside it. An assistant connected this way is not a second
 * kind of access with a second way to take it away.
 *
 * The token does not expire, so no refresh token is issued: a refresh of
 * something that never goes stale is a round trip that buys nobody anything.
 * Revoking is what ends it.
 */
const BAD_GRANT = { error: 'invalid_grant', error_description: 'That code cannot be redeemed.' };
/** Form bodies here are four short fields. */
const MAX_BODY_BYTES = 8 * 1024;

function oauthError(body: Record<string, string>, status = 400): Response {
	return json(body, {
		status,
		// No caching of anything on this door, ever.
		headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' }
	});
}

export const POST: RequestHandler = async (event) => {
	const raw = await event.request.text();
	if (raw.length > MAX_BODY_BYTES) return oauthError({ error: 'invalid_request' }, 413);

	const form = new URLSearchParams(raw);
	const grantType = form.get('grant_type') ?? '';
	if (grantType !== 'authorization_code') {
		return oauthError({
			error: 'unsupported_grant_type',
			error_description: 'Only authorization_code is supported.'
		});
	}

	const code = form.get('code') ?? '';
	const clientId = form.get('client_id') ?? '';
	const redirectUri = form.get('redirect_uri') ?? '';
	const verifier = form.get('code_verifier') ?? '';
	if (!code || !clientId || !redirectUri || !verifier) {
		return oauthError({ error: 'invalid_request', error_description: 'A field is missing.' });
	}

	const client = findClient(clientId);
	if (!client) return oauthError({ error: 'invalid_client' }, 401);

	const redeemed = redeemCode({ code, clientId, redirectUri, verifier, now: new Date() });
	// One refusal for every way this can fail: a token endpoint that says which
	// half was wrong is a token endpoint that can be asked.
	if (!redeemed) return oauthError(BAD_GRANT);

	try {
		const ctx = buildCtx(redeemed.userId);
		const minted = createToken(ctx, {
			// Named after whoever asked, with the id's tail so connecting the
			// same client twice does not collide with the first one.
			name: `${client.name} (${client.clientId.slice(0, 6)})`,
			scopes: redeemed.scopes
		});
		record(redeemed.userId, 'assistant_connected', {
			detail: { client: client.name, clientId: client.clientId, scopes: redeemed.scopes }
		});

		return json(
			{
				access_token: minted.plaintext,
				token_type: 'Bearer',
				scope: redeemed.scopes.join(' ')
			},
			{ headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } }
		);
	} catch (error) {
		/*
		 * The account cannot hold another key — a plan without them, or twenty
		 * already. Said plainly, because this one is the person's to fix and
		 * the client will show them the sentence.
		 */
		if (error instanceof ServiceError) {
			return oauthError({ error: 'access_denied', error_description: error.message }, 403);
		}
		console.error('oauth: minting failed', error);
		return oauthError({ error: 'server_error' }, 500);
	}
};

export const OPTIONS: RequestHandler = () => publicPreflight('POST, OPTIONS');
