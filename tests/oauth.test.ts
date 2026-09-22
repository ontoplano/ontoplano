/**
 * Connecting an assistant without anybody handling a key.
 *
 * The parts worth pinning are the refusals: a code is single-use, dies after
 * five minutes, belongs to one client and one redirect address, and is worth
 * nothing without the verifier it was born expecting. Each of those is a way
 * somebody else ends up holding a key to this account.
 */
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, makeDatabase, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let oauth: typeof import('../src/lib/server/services/oauth');

beforeAll(async () => {
	oauth = await import('../src/lib/server/services/oauth');
});

const NOW = new Date('2026-09-22T10:00:00Z');
const LATER = (ms: number) => new Date(NOW.getTime() + ms);

const verifier = () => randomBytes(32).toString('base64url');
const challengeOf = (v: string) => createHash('sha256').update(v).digest('base64url');

function connected(redirectUri = 'https://claude.ai/api/mcp/auth_callback') {
	const client = oauth.registerClient({
		name: 'Claude',
		redirectUris: [redirectUri],
		now: NOW
	});
	const v = verifier();
	const code = oauth.issueCode({
		clientId: client.clientId,
		userId: OWNER,
		scopes: ['tasks:read', 'tasks:write'],
		codeChallenge: challengeOf(v),
		redirectUri,
		now: NOW
	});
	return { client, code, verifier: v, redirectUri };
}

describe('registering', () => {
	it('takes a name and where to come back to', () => {
		const client = oauth.registerClient({
			name: 'Claude',
			redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
			now: NOW
		});
		expect(client.clientId).toMatch(/^[0-9a-f]{32}$/);
		expect(oauth.findClient(client.clientId)?.name).toBe('Claude');
	});

	it('refuses an address a code must never be sent to', () => {
		// Plain http off this machine: the code would cross the network in the
		// clear, which is the one thing the redirect is carrying.
		expect(oauth.isUsableRedirect('http://example.test/cb')).toBe(false);
		expect(oauth.isUsableRedirect('https://example.test/cb')).toBe(true);
		// A desktop client listening on its own machine is the ordinary case.
		expect(oauth.isUsableRedirect('http://127.0.0.1:6274/callback')).toBe(true);
		expect(oauth.isUsableRedirect('http://localhost:33418/oauth/callback')).toBe(true);
		// A native app's own scheme, per RFC 8252.
		expect(oauth.isUsableRedirect('cursor://anysphere.cursor-mcp/oauth/callback')).toBe(true);
		expect(oauth.isUsableRedirect('not a url')).toBe(false);

		expect(() =>
			oauth.registerClient({ name: 'Sketchy', redirectUris: ['http://evil.test/cb'], now: NOW })
		).toThrow();
		expect(() => oauth.registerClient({ name: 'Nowhere', redirectUris: [], now: NOW })).toThrow();
	});
});

describe('redeeming a code', () => {
	it('works once, with the verifier it was born expecting', () => {
		const { client, code, verifier: v, redirectUri } = connected();
		const first = oauth.redeemCode({
			code,
			clientId: client.clientId,
			redirectUri,
			verifier: v,
			now: NOW
		});
		expect(first?.userId).toBe(OWNER);
		expect(first?.scopes).toEqual(['tasks:read', 'tasks:write']);

		// Replayed inside its five minutes, by whoever else has it.
		const second = oauth.redeemCode({
			code,
			clientId: client.clientId,
			redirectUri,
			verifier: v,
			now: NOW
		});
		expect(second).toBeNull();
	});

	it('is worth nothing to somebody who intercepted it', () => {
		const { client, code, redirectUri } = connected();
		// The whole point of PKCE: the code alone does not open the door.
		expect(
			oauth.redeemCode({
				code,
				clientId: client.clientId,
				redirectUri,
				verifier: verifier(),
				now: NOW
			})
		).toBeNull();
	});

	it('refuses another client holding it', () => {
		const { code, verifier: v, redirectUri } = connected();
		const other = oauth.registerClient({
			name: 'Somebody else',
			redirectUris: [redirectUri],
			now: NOW
		});
		expect(
			oauth.redeemCode({ code, clientId: other.clientId, redirectUri, verifier: v, now: NOW })
		).toBeNull();
	});

	it('refuses a different address than the one it was issued for', () => {
		const { client, code, verifier: v } = connected();
		expect(
			oauth.redeemCode({
				code,
				clientId: client.clientId,
				redirectUri: 'https://claude.ai/elsewhere',
				verifier: v,
				now: NOW
			})
		).toBeNull();
	});

	it('goes stale', () => {
		const { client, code, verifier: v, redirectUri } = connected();
		expect(
			oauth.redeemCode({
				code,
				clientId: client.clientId,
				redirectUri,
				verifier: v,
				now: LATER(6 * 60 * 1000)
			})
		).toBeNull();
	});
});

describe('what it comes out holding', () => {
	it('is everything an assistant does, and not deleting', () => {
		const scopes = oauth.scopesFor(null, false);
		expect(scopes).toContain('tasks:write');
		expect(scopes).not.toContain('destructive');
	});

	it('deletes only where the consent screen said so', () => {
		expect(oauth.scopesFor(null, true)).toContain('destructive');
	});

	it('honours a client asking for less', () => {
		expect(oauth.scopesFor('today:read', false)).toEqual(['today:read']);
	});

	it('never lets a client ask for more than it was offered', () => {
		// Asking for the deleting grant in the URL does not grant it: that
		// answer belongs to the person on the consent screen.
		expect(oauth.scopesFor('tasks:read destructive', false)).toEqual(['tasks:read']);
		expect(oauth.scopesFor('tokens:write', false)).not.toContain('tokens:write');
	});
});

describe('the documents a client reads before it has met us', () => {
	it('point at the MCP endpoint and at this instance', () => {
		const resource = oauth.protectedResourceMetadata('https://app.ontoplano.com');
		expect(resource.resource).toBe('https://app.ontoplano.com/api/mcp');
		expect(resource.authorization_servers).toEqual(['https://app.ontoplano.com']);

		const server = oauth.authorizationServerMetadata('https://app.ontoplano.com');
		expect(server.authorization_endpoint).toBe('https://app.ontoplano.com/oauth/authorize');
		expect(server.token_endpoint).toBe('https://app.ontoplano.com/oauth/token');
		expect(server.registration_endpoint).toBe('https://app.ontoplano.com/oauth/register');
		// S256 and nothing else: `plain` is PKCE in name only.
		expect(server.code_challenge_methods_supported).toEqual(['S256']);
	});
});
