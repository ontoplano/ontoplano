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
	delete process.env.ONTOPLANO_DEMO_EMAIL;
	delete process.env.ONTOPLANO_DEMO_PASSWORD;
});

describe('whether this deployment is the demo', () => {
	it('is not, unless it says so', async () => {
		expect((await settings()).isDemo()).toBe(false);
	});

	it('is not, when the flag is on but no account is named', async () => {
		process.env.ONTOPLANO_DEMO = 'true';
		// The dangerous half-state: auto-sign-in with nobody to sign in as.
		expect((await settings()).isDemo()).toBe(false);
	});

	it('is, with a flag and an account', async () => {
		process.env.ONTOPLANO_DEMO = 'true';
		process.env.ONTOPLANO_DEMO_EMAIL = 'demo@example.test';
		process.env.ONTOPLANO_DEMO_PASSWORD = 'not-a-secret';
		const s = await settings();
		expect(s.isDemo()).toBe(true);
		expect(s.demoAccount()).toEqual({
			email: 'demo@example.test',
			password: 'not-a-secret'
		});
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

	it('cover every way to lock the shared account out', () => {
		for (const path of [
			'/api/auth/change-password',
			'/api/auth/change-email',
			'/api/auth/delete-user'
		]) {
			expect(hooks, `${path} is not refused on the demo`).toContain(path);
		}
	});
});
