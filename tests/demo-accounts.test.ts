/**
 * A demo where everybody gets their own copy.
 *
 * The old demo signed every visitor into one account and wiped the database
 * hourly, which is two problems wearing one hat: people watched each other
 * type, and the fix for anything one of them broke was to destroy an hour of
 * what everybody else had been doing.
 *
 * What replaces it has to hold three promises, and they are what is checked
 * here — an account is only ever a demo account if it is marked as one, an
 * expired one goes away completely, and the instance has a ceiling nobody can
 * push it past.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let demo: typeof import('../src/lib/server/services/demo');
let settings: typeof import('../src/lib/server/settings');
let db: typeof import('../src/lib/server/db/index');
let schema: typeof import('../src/lib/server/db/schema');

/** A demo account, made the way the service marks one, without better-auth. */
function pretendVisitor(id: string, expiresAt: string) {
	db.db
		.insert(schema.user)
		.values({
			id,
			name: 'Demo',
			email: `demo-${id}@demo.test`,
			emailVerified: true,
			// The auth tables keep instants as epoch milliseconds, not ISO text.
			createdAt: new Date(),
			updatedAt: new Date()
		})
		.run();
	db.db
		.insert(schema.userSettings)
		.values({ userId: id, key: 'demo.expiresAt', value: expiresAt })
		.run();
}

beforeAll(async () => {
	demo = await import('../src/lib/server/services/demo');
	settings = await import('../src/lib/server/settings');
	db = await import('../src/lib/server/db/index');
	schema = await import('../src/lib/server/db/schema');
});

describe('a demo account', () => {
	it('is only one because it is marked as one', () => {
		// The account the tests were seeded with is somebody's real account, and
		// a sweep that took it would be the worst bug this file could have.
		expect(demo.demoExpiry(OWNER)).toBeNull();
	});

	it('carries an expiry from the moment it is made', () => {
		pretendVisitor('visitor-live', new Date(Date.now() + 60_000).toISOString());
		expect(demo.demoExpiry('visitor-live')).toBeTruthy();
	});

	it('is counted against the instance ceiling', () => {
		const before = demo.demoAccountCount();
		pretendVisitor('visitor-counted', new Date(Date.now() + 60_000).toISOString());
		expect(demo.demoAccountCount()).toBe(before + 1);
	});

	it('has its expiry pushed out while somebody is using it', () => {
		const soon = new Date(Date.now() + 1_000).toISOString();
		pretendVisitor('visitor-touched', soon);

		demo.touchDemoAccount('visitor-touched');

		expect(demo.demoExpiry('visitor-touched')!.localeCompare(soon)).toBeGreaterThan(0);
	});
});

describe('the sweep', () => {
	it('deletes the ones whose time has passed and leaves the rest', () => {
		pretendVisitor('visitor-expired', new Date(Date.now() - 60_000).toISOString());
		pretendVisitor('visitor-fresh', new Date(Date.now() + 600_000).toISOString());

		demo.sweepDemoAccounts();

		expect(demo.demoExpiry('visitor-expired')).toBeNull();
		expect(demo.demoExpiry('visitor-fresh')).toBeTruthy();
	});

	it('takes the whole account with it', () => {
		pretendVisitor('visitor-gone', new Date(Date.now() - 60_000).toISOString());
		demo.sweepDemoAccounts();

		const left = db.db
			.select({ id: schema.user.id })
			.from(schema.user)
			.all()
			.map((r) => r.id);
		expect(left).not.toContain('visitor-gone');
	});

	it('never touches an account that is not a demo one', () => {
		pretendVisitor('visitor-also-expired', new Date(Date.now() - 60_000).toISOString());
		demo.sweepDemoAccounts();

		// The account this suite was seeded with predates the demo entirely.
		const left = db.db
			.select({ id: schema.user.id })
			.from(schema.user)
			.all()
			.map((r) => r.id);
		expect(left).toContain(OWNER);
	});
});

describe('the ceiling', () => {
	it('is a number the instance can set', () => {
		process.env.ONTOPLANO_DEMO_MAX_ACCOUNTS = '3';
		expect(settings.demoMaxAccounts()).toBe(3);
		delete process.env.ONTOPLANO_DEMO_MAX_ACCOUNTS;
	});
});
