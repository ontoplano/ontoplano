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

/** The sentence alone, as the old API returned — most tests only read it. */
const said = (...args: Parameters<typeof demoRefusal>) => demoRefusal(...args)?.said ?? null;

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

	/**
	 * The rules bind the throwaway copies, not the box.
	 *
	 * The operator's account — made deliberately, no expiry stamp, a password
	 * somebody knows — signs in, signs out, and manages itself like any
	 * account; the sweep cannot eat it because the stamp is what the sweep
	 * eats. Only the admin-page write lock binds everyone: a box wiped hourly
	 * is not the place anybody administers from.
	 */
	it('scope the identity and exit rules to demo accounts, and the admin lock to everyone', () => {
		expect(demoRefusal('POST', '/api/auth/change-password')?.scope).toBe('demo-account');
		expect(demoRefusal('POST', '/api/auth/sign-out')?.scope).toBe('demo-account');
		expect(demoRefusal('POST', '/settings/integrations')?.scope).toBe('demo-account');
		expect(demoRefusal('POST', '/admin')?.scope).toBe('everyone');
	});

	it('leave the administration pages readable', () => {
		// Deliberate: somebody deciding whether to run this themselves should see
		// what administering it looks like.
		expect(said('GET', '/admin')).toBeNull();
		expect(said('GET', '/settings/instance')).toBeNull();
		expect(said('GET', '/admin/abc123')).toBeNull();
	});

	it('refuse every write behind them', () => {
		for (const path of ['/admin', '/admin/abc123', '/settings/instance']) {
			expect(said('POST', path), `${path} is writable on the demo`).toMatch(/demo/i);
		}
	});

	/**
	 * The integrations page, which is worth showing and not worth handing over.
	 *
	 * A token minted on the demo is a working key to that account's API for as
	 * long as it lives, and the same page mints calendar links and pairs a
	 * phone. So the page opens — it is part of what somebody is deciding about —
	 * and everything on it refuses, in the words somebody reads on a toast.
	 */
	it('show the integrations page and refuse everything on it', () => {
		expect(said('GET', '/settings/integrations')).toBeNull();

		for (const path of [
			'/settings/integrations',
			'/settings/integrations/widget',
			'/settings/integrations/calendar'
		]) {
			expect(said('POST', path), `${path} is writable on the demo`).toBe(
				"You're not allowed to do that in the demo."
			);
		}
	});

	/**
	 * Signing out of the demo is signing out for good.
	 *
	 * The account was handed over by a cookie and has no password anybody knows,
	 * so the way out has no way back — somebody who pressed it found the demo
	 * simply over. Both doors: better-auth's endpoint, and the form action the
	 * menu posts to.
	 */
	it('refuse to let somebody lock themselves out of the demo', () => {
		expect(said('POST', '/api/auth/sign-out')).toMatch(/no way back in/);
		expect(said('POST', '/login', '?/signOut')).toMatch(/no way back in/);
		// Signing *in* is how somebody arrives; only the way out is closed.
		expect(said('POST', '/login')).toBeNull();
	});

	it('leave the rest of the app alone', () => {
		// The demo is a playground: everything that is not the box or the
		// account must still be usable, or there is nothing to look at.
		for (const path of ['/tasks/plan', '/shopping', '/notebooks/diary', '/settings/preferences']) {
			expect(said('POST', path), `${path} is refused on the demo`).toBeNull();
		}
	});

	it("refuse the account page's own delete, by the action it names", () => {
		expect(said('POST', '/settings/account', '?/delete')).toMatch(/deletes itself/);
		// And leave the rest of that page working.
		expect(said('POST', '/settings/account', '?/rename')).toBeNull();
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
			expect(said('POST', path), `${path} is not refused`).toMatch(/demo/i);
			expect(said('GET', path), `${path} is not refused on GET`).toMatch(/demo/i);
		}

		// And signing in is not one of them — it is how the demo works at all.
		expect(said('POST', '/api/auth/sign-in/email')).toBeNull();
	});
});

/**
 * The waiting room.
 *
 * Making a demo account writes a row and seeds a week, which took seconds
 * behind a blank page. `/demo` is the screen that wait is spent on — and it is
 * a page anybody signed out can reach and can POST to, which is exactly the
 * shape of thing that has to be nailed down: it exists only on the demo, and
 * it will only send somebody to a path on this instance.
 */
describe("the demo's front door", () => {
	async function door() {
		const { vi } = await import('vitest');
		vi.resetModules();
		return import('../src/routes/demo/+page.server');
	}

	it('is not there at all off a demo instance', async () => {
		const { load } = await door();
		await expect(async () =>
			load({ url: new URL('http://x/demo'), locals: {} } as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it('sends you on to where you were going', async () => {
		process.env.ONTOPLANO_DEMO = 'true';
		const { load } = await door();
		const data = await load({
			url: new URL('http://x/demo?next=/tasks/plan'),
			locals: {}
		} as never);
		expect(data).toEqual({ next: '/tasks/plan' });
	});

	it('and never off this instance', async () => {
		process.env.ONTOPLANO_DEMO = 'true';
		const { load } = await door();
		for (const next of ['https://elsewhere.example/', '//elsewhere.example/', 'javascript:1']) {
			const data = await load({
				url: new URL(`http://x/demo?next=${encodeURIComponent(next)}`),
				locals: {}
			} as never);
			expect(data, next).toEqual({ next: '/' });
		}
	});

	it('does not send you back to itself, which would start the wait again', async () => {
		process.env.ONTOPLANO_DEMO = 'true';
		const { load } = await door();
		expect(await load({ url: new URL('http://x/demo?next=/demo'), locals: {} } as never)).toEqual({
			next: '/'
		});
	});

	/*
	 * The door creates an account without one being signed in, which is the
	 * one place in the app where that is true. It has to carry the same budget
	 * the hook carries, or it is the way around it.
	 */
	it('is held to the same per-address budget as the hook', async () => {
		const door = readFileSync('src/routes/demo/+page.server.ts', 'utf8');
		expect(door).toContain('rateLimit(');
		expect(door).toContain('DEMO_ACCOUNTS_PER_ADDRESS');
		// One definition, imported by both — not two numbers to keep in step.
		expect(door).toContain("from '$lib/server/services/demo'");
		expect(hooks).toContain('DEMO_ACCOUNTS_PER_ADDRESS');
		expect(hooks).not.toMatch(/const DEMO_ACCOUNTS_PER_ADDRESS *=/);
	});

	/*
	 * And the two guards that let a signed-out visitor reach it at all. Both
	 * are lists in files this test does not import — the layout would pull the
	 * whole app in — so they are read as text, which is what `hooks` above does
	 * for the same reason.
	 */
	it('is reachable, and postable, by somebody with no account', () => {
		expect(readFileSync('src/routes/+layout.server.ts', 'utf8')).toContain("=== '/demo'");
		expect(hooks).toMatch(/PUBLIC_WRITES = \[[^\]]*'\/demo'/);
	});
});
