import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { and, eq, isNull, lt } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { oauthClients, oauthCodes } from '$lib/db/schema';
import { ValidationError } from '$lib/services/errors.js';
import { str } from '$lib/services/validate.js';
import { ASSISTANT_SCOPES } from '$lib/server/mcp/tools';
import { ALL_SCOPES } from './tokens.js';

/**
 * Connecting an assistant without anybody handling a key.
 *
 * The flow is the one Claude, ChatGPT and the MCP clients already walk: the
 * client discovers this instance is protected, registers itself, sends the
 * person here to say yes, and swaps the code it gets back for a token. What
 * this file owns is the middle — clients, codes and the rules about both. The
 * token at the end is an ordinary `api_tokens` row minted by `tokens.ts`, so
 * revoking a connected assistant is the same button as revoking a key.
 *
 * Deliberately small: authorization code grant with PKCE and nothing else. No
 * implicit grant (removed in OAuth 2.1), no client secrets (every client here
 * is a public one — a desktop app cannot keep a secret), no refresh tokens,
 * because the token this issues does not expire and a refresh of a token that
 * never goes stale is a round trip that buys nothing.
 */

/** Long enough to be unguessable; the same shape a token uses. */
const CODE_BYTES = 32;
/** The spec says ten minutes at the outside. Five is plenty for a redirect. */
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_CLIENT_NAME = 120;
const MAX_URI_LENGTH = 500;
const MAX_REDIRECT_URIS = 10;
/** S256 only. `plain` is in the spec and is not PKCE in any useful sense. */
export const CODE_CHALLENGE_METHOD = 'S256';

export type OAuthClient = {
	clientId: string;
	name: string;
	redirectUris: string[];
	uri: string | null;
};

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

/**
 * Where a code may be sent back to.
 *
 * `https` anywhere, and `http` only on this machine — which is not a loophole
 * but the ordinary case: a desktop client listens on `http://127.0.0.1:PORT`
 * because there is nothing to encrypt between a process and itself. Anything
 * else is a native app's own scheme (`cursor://`, `com.example.app:/cb`),
 * allowed because the protection here is the exact match at both doors, not
 * the scheme.
 */
export function isUsableRedirect(raw: string): boolean {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	if (url.hash) return false;
	if (url.protocol === 'https:') return true;
	if (url.protocol === 'http:')
		return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
	// A private-use scheme, per RFC 8252. Not http, so not the web's problem.
	return url.protocol !== 'http:' && url.protocol.endsWith(':');
}

/**
 * A client registering itself, which happens before anybody has signed in.
 *
 * Anonymous by design (RFC 7591): the assistant has no account here and the
 * person it belongs to has not arrived yet. That makes this the one write in
 * the app an unauthenticated caller can cause, so the route in front of it
 * rate limits, and everything stored is bounded and never trusted as words:
 * the name lands on a consent screen and is the client's claim about itself,
 * not ours about it.
 */
export function registerClient(input: {
	name: unknown;
	redirectUris: unknown;
	uri?: unknown;
	now: Date;
}): OAuthClient {
	const name = str(input.name ?? 'An assistant', 'client name', { max: MAX_CLIENT_NAME });

	const asked = Array.isArray(input.redirectUris) ? input.redirectUris : [];
	if (asked.length === 0) throw new ValidationError({ key: 'errors.oauth.redirectUrisIsRequired' });
	if (asked.length > MAX_REDIRECT_URIS)
		throw new ValidationError({ key: 'errors.oauth.tooManyRedirectUris' });

	const redirectUris = asked.map((one) => {
		const uri = str(one, 'redirect_uri', { max: MAX_URI_LENGTH });
		if (!isUsableRedirect(uri)) throw new ValidationError(`Unusable redirect_uri: ${uri}`);
		return uri;
	});

	const uri =
		input.uri === undefined || input.uri === null || input.uri === ''
			? null
			: str(input.uri, 'client_uri', { max: MAX_URI_LENGTH });

	const clientId = randomBytes(16).toString('hex');
	const stamp = input.now.toISOString();
	db.insert(oauthClients)
		.values({
			clientId,
			name,
			redirectUris: JSON.stringify(redirectUris),
			uri,
			createdAt: stamp,
			updatedAt: stamp
		})
		.run();

	return { clientId, name, redirectUris, uri };
}

export function findClient(clientId: string): OAuthClient | null {
	const row = db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).get();
	if (!row) return null;
	let redirectUris: string[] = [];
	try {
		const parsed: unknown = JSON.parse(row.redirectUris);
		if (Array.isArray(parsed))
			redirectUris = parsed.filter((u): u is string => typeof u === 'string');
	} catch {
		redirectUris = [];
	}
	return { clientId: row.clientId, name: row.name, redirectUris, uri: row.uri };
}

/**
 * What an assistant connected this way may do.
 *
 * The same set the key form offers — everything an assistant reads and writes
 * — with deleting left out unless the person ticked it on the consent screen.
 * A client may ask for less by naming scopes; it may not ask for more than
 * this, and a scope nobody recognises is dropped rather than refused, because
 * a client guessing at names should still connect with what it can have.
 */
export function scopesFor(asked: string | null, mayDelete: boolean): string[] {
	const offered = new Set<string>(ASSISTANT_SCOPES);
	if (mayDelete) offered.add('destructive');

	const wanted = (asked ?? '').split(/[\s,]+/).filter(Boolean);
	const known = new Set<string>(ALL_SCOPES as readonly string[]);
	const narrowed = wanted.filter((one) => offered.has(one) && known.has(one));
	return narrowed.length > 0 ? narrowed : [...offered];
}

/** The code handed back through the browser, and its hash left here. */
export function issueCode(input: {
	clientId: string;
	userId: string;
	scopes: string[];
	codeChallenge: string;
	redirectUri: string;
	resource?: string | null;
	now: Date;
}): string {
	const code = randomBytes(CODE_BYTES).toString('base64url');
	db.insert(oauthCodes)
		.values({
			codeHash: sha256(code),
			clientId: input.clientId,
			userId: input.userId,
			scopes: input.scopes.join(','),
			codeChallenge: input.codeChallenge,
			redirectUri: input.redirectUri,
			resource: input.resource ?? null,
			expiresAt: new Date(input.now.getTime() + CODE_TTL_MS).toISOString(),
			usedAt: null,
			createdAt: input.now.toISOString()
		})
		.run();
	return code;
}

export type RedeemedCode = { userId: string; scopes: string[]; clientId: string };

/**
 * A code spent, once.
 *
 * Every refusal here is the same refusal on purpose — a token endpoint that
 * says which half was wrong is a token endpoint that can be asked. Marked used
 * before anything is minted, so two requests racing the same code cannot both
 * come out the other side with a token.
 */
export function redeemCode(input: {
	code: string;
	clientId: string;
	redirectUri: string;
	verifier: string;
	now: Date;
}): RedeemedCode | null {
	const row = db
		.select()
		.from(oauthCodes)
		.where(eq(oauthCodes.codeHash, sha256(input.code)))
		.get();
	if (!row) return null;
	if (row.usedAt) return null;
	if (new Date(row.expiresAt).getTime() <= input.now.getTime()) return null;
	if (row.clientId !== input.clientId) return null;
	if (row.redirectUri !== input.redirectUri) return null;

	// PKCE: the verifier this code was born expecting, compared without a
	// timing signal.
	const expected = Buffer.from(row.codeChallenge);
	const given = Buffer.from(createHash('sha256').update(input.verifier).digest('base64url'));
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

	const spent = db
		.update(oauthCodes)
		.set({ usedAt: input.now.toISOString() })
		// `isNull`, not `eq(..., null)`: SQL's `used_at = NULL` is never true,
		// so that spelling spent no code and refused every redemption.
		.where(and(eq(oauthCodes.id, row.id), isNull(oauthCodes.usedAt)))
		.run();
	if (spent.changes === 0) return null;

	return {
		userId: row.userId,
		clientId: row.clientId,
		scopes: row.scopes.split(',').filter(Boolean)
	};
}

/** Codes nobody came back for. Cheap, and run wherever one is issued. */
export function forgetStaleCodes(now: Date): void {
	db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, now.toISOString())).run();
}

/**
 * What this instance says about itself, to a client that has not met it.
 *
 * Two documents at two well-known addresses, and between them they are the
 * whole of "no configuration": the client is told where the MCP endpoint is,
 * which authorization server guards it, where to register, where to send the
 * person, and where to bring the code back. Nobody types anything but the
 * instance's address.
 */
export function protectedResourceMetadata(origin: string) {
	return {
		resource: `${origin}/api/mcp`,
		authorization_servers: [origin],
		scopes_supported: [...ASSISTANT_SCOPES, 'destructive'],
		bearer_methods_supported: ['header'],
		resource_name: 'ontoplano',
		resource_documentation: `${origin}/docs/ai-agents`
	};
}

export function authorizationServerMetadata(origin: string) {
	return {
		issuer: origin,
		authorization_endpoint: `${origin}/oauth/authorize`,
		token_endpoint: `${origin}/oauth/token`,
		registration_endpoint: `${origin}/oauth/register`,
		scopes_supported: [...ASSISTANT_SCOPES, 'destructive'],
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code'],
		code_challenge_methods_supported: [CODE_CHALLENGE_METHOD],
		// Every client here is a public one: a desktop app ships its secret to
		// everybody who installs it, which is not a secret. PKCE is what stands
		// in for one.
		token_endpoint_auth_methods_supported: ['none'],
		service_documentation: `${origin}/docs/ai-agents`
	};
}
