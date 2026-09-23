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
let schema: typeof import('../src/lib/db/schema');

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
	schema = await import('../src/lib/db/schema');
});

describe('a demo account', () => {
	it('is only one because it is marked as one', async () => {
		// The account the tests were seeded with is somebody's real account, and
		// a sweep that took it would be the worst bug this file could have.
		expect(demo.demoExpiry(OWNER)).toBeNull();
	});

	it('carries an expiry from the moment it is made', async () => {
		pretendVisitor('visitor-live', new Date(Date.now() + 60_000).toISOString());
		expect(demo.demoExpiry('visitor-live')).toBeTruthy();
	});

	it('is counted against the instance ceiling', async () => {
		const before = demo.demoAccountCount();
		pretendVisitor('visitor-counted', new Date(Date.now() + 60_000).toISOString());
		expect(demo.demoAccountCount()).toBe(before + 1);
	});

	it('has its expiry pushed out while somebody is using it', async () => {
		const soon = new Date(Date.now() + 1_000).toISOString();
		pretendVisitor('visitor-touched', soon);

		demo.touchDemoAccount('visitor-touched');

		expect(demo.demoExpiry('visitor-touched')!.localeCompare(soon)).toBeGreaterThan(0);
	});
});

describe('resetting', () => {
	/*
	 * The half that was never checked, and the half somebody presses.
	 *
	 * "It refuses a real account" was the only thing asserted here, which is
	 * the guard rather than the feature: a reset that threw on every demo
	 * account would have passed this file. The menu offering it is gated on
	 * the same `isDemoAccount` the service checks — the operator signed into
	 * their own account on the demo instance was shown a button that could
	 * only fail.
	 */
	it('empties a demo account and lays the fixtures down again', async () => {
		pretendVisitor('visitor-reset', new Date(Date.now() + 600_000).toISOString());

		const { buildCtx } = await import('../src/lib/services/ctx');
		const notebooks = await import('../src/lib/services/notebooks');
		const ctx = buildCtx('visitor-reset', { tz: 'UTC' });
		notebooks.createNotebook(ctx, { title: 'The mess somebody made' });

		await demo.resetDemoAccount('visitor-reset');

		const left = notebooks.listNotebooks(ctx).map((one) => one.title);
		expect(left).not.toContain('The mess somebody made');
		// And it is the fixtures, not an empty account: the seed is what the
		// next visitor would have been handed.
		expect(left.length).toBeGreaterThan(0);

		// And away again: the fixtures include pictures, and the sweep's own
		// test asserts on the whole media table.
		settings.setUserSetting('visitor-reset', 'demo.expiresAt', new Date(0).toISOString());
		demo.sweepDemoAccounts();
	}, 45_000);

	it('refuses an account that does not carry the demo stamp', async () => {
		// This is the one function that empties a whole account. It is only
		// ever handed demo accounts today, but "the callers are careful" is
		// not a guard — the stamp is.
		await expect(demo.resetDemoAccount(OWNER)).rejects.toThrow(/not found/);
	});
});

describe('the sweep', () => {
	it('deletes the ones whose time has passed and leaves the rest', async () => {
		pretendVisitor('visitor-expired', new Date(Date.now() - 60_000).toISOString());
		pretendVisitor('visitor-fresh', new Date(Date.now() + 600_000).toISOString());

		demo.sweepDemoAccounts();

		expect(demo.demoExpiry('visitor-expired')).toBeNull();
		expect(demo.demoExpiry('visitor-fresh')).toBeTruthy();
	});

	/**
	 * Including the bytes.
	 *
	 * A picture is a blob in the same file as everything else, so a demo account
	 * nobody deleted properly is disk that never comes back — and unlike a row
	 * of text, one photograph is half a megabyte. `USER_TABLES` in
	 * `services/account.ts` is what makes this true, and the guard beside it
	 * fails when a new table with a `user_id` is not on that list; this is the
	 * same promise asserted from the other end.
	 */
	it('takes their pictures with it', async () => {
		const media = await import('../src/lib/services/media');
		const { buildCtx } = await import('../src/lib/services/ctx');

		pretendVisitor('visitor-with-photos', new Date(Date.now() - 60_000).toISOString());
		const ctx = buildCtx('visitor-with-photos');
		// A real PNG header is all the sniffing needs; the rest is padding.
		const bytes = Buffer.concat([
			Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
			Buffer.alloc(64, 3)
		]);
		await media.store(ctx, { bytes, filename: 'holiday.png' });
		expect(media.list(ctx)).toHaveLength(1);

		demo.sweepDemoAccounts();

		const left = db.db.select({ id: schema.media.id }).from(schema.media).all();
		expect(
			left.length,
			'a swept demo account left its pictures behind, and nothing will ever collect them'
		).toBe(0);
	});

	it('takes the whole account with it', async () => {
		pretendVisitor('visitor-gone', new Date(Date.now() - 60_000).toISOString());
		demo.sweepDemoAccounts();

		const left = db.db
			.select({ id: schema.user.id })
			.from(schema.user)
			.all()
			.map((r) => r.id);
		expect(left).not.toContain('visitor-gone');
	});

	it('never touches an account that is not a demo one', async () => {
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

/**
 * The sweep runs on its own, rather than only when a stranger arrives.
 *
 * Reported from the live demo: an account was not being wiped after its half
 * hour. It was not the timer — it was that the only caller of the sweep sat
 * inside the branch that hands a *new* visitor an account, so a demo nobody
 * new came to never cleaned up, and the one person refreshing the page kept
 * their own expired session alive indefinitely.
 */
describe('the sweep, unprompted', () => {
	it('runs on a request that creates nothing', async () => {
		pretendVisitor('visitor-stale', new Date(Date.now() - 60_000).toISOString());

		// The throttle is per-process and other tests have already tripped it,
		// so this asks for a time far enough ahead to be allowed through.
		demo.maybeSweepDemoAccounts(new Date(Date.now() + 10 * 60_000));

		expect(demo.demoExpiry('visitor-stale')).toBeNull();
	});

	it('does not run twice in the same minute', async () => {
		const at = new Date(Date.now() + 40 * 60_000);
		demo.maybeSweepDemoAccounts(at);

		pretendVisitor('visitor-just-expired', new Date(Date.now() - 60_000).toISOString());
		// One second later: too soon, so this one survives until the next minute.
		demo.maybeSweepDemoAccounts(new Date(at.getTime() + 1000));
		expect(demo.demoExpiry('visitor-just-expired')).toBeTruthy();

		demo.maybeSweepDemoAccounts(new Date(at.getTime() + 61_000));
		expect(demo.demoExpiry('visitor-just-expired')).toBeNull();
	});
});

describe('the operator way in', () => {
	// /login bounces a signed-in session to the dashboard everywhere else —
	// on the demo that made the sign-in form unreachable, because every
	// visitor arrives already wearing a minted session and cannot sign out.
	const event = (userId: string | null) =>
		({
			locals: userId ? { user: { id: userId } } : {},
			url: new URL('https://demo.example/login'),
			cookies: { get: () => undefined, set: () => {} }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		}) as any;

	it('shows the form to a minted visitor instead of bouncing them home', async () => {
		process.env.ONTOPLANO_DEMO = 'true';
		try {
			pretendVisitor('demo-at-login', new Date(Date.now() + 60_000).toISOString());
			const { load } = await import('../src/routes/login/+page.server');
			const data = (await load(event('demo-at-login'))) as { canRegister?: boolean };
			expect(data).toHaveProperty('canRegister');
		} finally {
			delete process.env.ONTOPLANO_DEMO;
		}
	});

	it('still sends an account with a password of its own home', async () => {
		process.env.ONTOPLANO_DEMO = 'true';
		try {
			const { load } = await import('../src/routes/login/+page.server');
			const result = await Promise.resolve(load(event(OWNER))).catch((thrown: unknown) => thrown);
			expect((result as { status?: number }).status).toBe(302);
		} finally {
			delete process.env.ONTOPLANO_DEMO;
		}
	});
});

describe('the ceiling', () => {
	it('is a number the instance can set', async () => {
		process.env.ONTOPLANO_DEMO_MAX_ACCOUNTS = '3';
		expect(settings.demoMaxAccounts()).toBe(3);
		delete process.env.ONTOPLANO_DEMO_MAX_ACCOUNTS;
	});
});
