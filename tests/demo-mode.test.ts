/**
 * The public demo.
 *
 * One account that every visitor arrives already signed into, wiped back to a
 * seeded week every hour. Two properties keep that from being reckless, and
 * both are checked here because both failed once while it was being built:
 *
 *  - a half-configured demo is not a demo. `ONTOPLANO_DEMO=true` with no
 *    account named would otherwise mean "sign everybody in as nobody".
 *  - the refusals sit in FRONT of better-auth. It answers everything under
 *    /api/auth inside its own handle, so a guard placed after it never sees
 *    those requests — the demo's password could be changed by anybody who
 *    knew the endpoint, and the demo would be dead until the next reset.
 */
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { makeDatabase } from './helpers/db';
import { demoRefusal } from '../src/lib/server/demo-guard';

// Importing the settings module reaches the database module, which refuses to
// load against a database behind the code — so this file gets one of its own.
const database = makeDatabase();
afterAll(() => database.remove());

const hooks = readFileSync('src/hooks.server.ts', 'utf8');

async function settings() {
	const { vi } = await import('vitest');
	vi.resetModules();
	return import('../src/lib/server/settings');
}

afterEach(() => {
	delete process.env.ONTOPLANO_DEMO;
	delete process.env.ONTOPLANO_DEMO_TTL_MINUTES;
	delete process.env.ONTOPLANO_DEMO_MAX_ACCOUNTS;
});

describe('whether this deployment is the demo', () => {
	it('is not, unless it says so', async () => {
		expect((await settings()).isDemo()).toBe(false);
	});

	it('is, on the flag alone', async () => {
		// There is no shared account to name any more — every visitor gets one
		// of their own — so the flag is the whole switch.
		process.env.ONTOPLANO_DEMO = 'true';
		expect((await settings()).isDemo()).toBe(true);
	});
});

describe('how long a demo account lives, and how many there may be', () => {
	it('has answers without being told', async () => {
		const s = await settings();
		expect(s.demoLifetimeMinutes()).toBeGreaterThan(0);
		expect(s.demoMaxAccounts()).toBeGreaterThan(0);
	});

	it('takes the instance at its word for both', async () => {
		process.env.ONTOPLANO_DEMO_TTL_MINUTES = '45';
		process.env.ONTOPLANO_DEMO_MAX_ACCOUNTS = '12';
		const s = await settings();
		expect(s.demoLifetimeMinutes()).toBe(45);
		expect(s.demoMaxAccounts()).toBe(12);
	});

	it('ignores a value that is not one', async () => {
		// A ceiling of zero is a demo that refuses everybody, and "abc" minutes
		// is an account that expires in the past.
		process.env.ONTOPLANO_DEMO_TTL_MINUTES = 'soon';
		process.env.ONTOPLANO_DEMO_MAX_ACCOUNTS = '0';
		const s = await settings();
		expect(s.demoLifetimeMinutes()).toBeGreaterThan(0);
		expect(s.demoMaxAccounts()).toBeGreaterThan(0);
	});
});

describe('the demo refusals', () => {
	it('run before better-auth answers for itself', () => {
		const order = ['handleDemoGuard', 'handleBetterAuth'].map((name) =>
			hooks.indexOf(`\t${name},`)
		);
		expect(order[0], 'handleDemoGuard is not in the handle sequence').toBeGreaterThan(-1);
		expect(order[1], 'handleBetterAuth is not in the handle sequence').toBeGreaterThan(-1);
		expect(order[0], 'the guard must come first or /api/auth never reaches it').toBeLessThan(
			order[1]
		);
	});

	it('leave the administration pages readable', () => {
		// Deliberate: somebody deciding whether to run this themselves should see
		// what administering it looks like.
		expect(demoRefusal('GET', '/admin')).toBeNull();
		expect(demoRefusal('GET', '/settings/instance')).toBeNull();
		expect(demoRefusal('GET', '/admin/abc123')).toBeNull();
	});

	it('refuse every write behind them', () => {
		for (const path of ['/admin', '/admin/abc123', '/settings/instance']) {
			expect(demoRefusal('POST', path), `${path} is writable on the demo`).toMatch(/demo/i);
		}
	});

	it('still let somebody stop impersonating', () => {
		// The way back from being impersonated has to work wherever
		// impersonation does, or a visitor is stuck as somebody else.
		expect(demoRefusal('POST', '/admin/stop')).toBeNull();
	});

	it('leave the rest of the app alone', () => {
		// The demo is a playground: everything that is not the box or the
		// account must still be usable, or there is nothing to look at.
		for (const path of ['/planner/plan', '/shopping', '/diary', '/settings/preferences']) {
			expect(demoRefusal('POST', path), `${path} is refused on the demo`).toBeNull();
		}
	});

	it("refuse the account page's own delete, by the action it names", () => {
		expect(demoRefusal('POST', '/settings/account', '?/delete')).toMatch(/deletes itself/);
		// And leave the rest of that page working.
		expect(demoRefusal('POST', '/settings/account', '?/rename')).toBeNull();
	});

	it('cover every way to lock the shared account out', () => {
		for (const path of [
			'/api/auth/change-password',
			'/api/auth/change-email',
			'/api/auth/delete-user',
			'/api/auth/update-user',
			'/api/auth/revoke-sessions'
		]) {
			// Whatever the method: better-auth accepts some of these as GET.
			expect(demoRefusal('POST', path), `${path} is not refused`).toMatch(/demo/i);
			expect(demoRefusal('GET', path), `${path} is not refused on GET`).toMatch(/demo/i);
		}

		// And signing in is not one of them — it is how the demo works at all.
		expect(demoRefusal('POST', '/api/auth/sign-in/email')).toBeNull();
	});
});
