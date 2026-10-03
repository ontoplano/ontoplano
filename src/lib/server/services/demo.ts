import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { and, eq, like, lt, sql } from 'drizzle-orm';

import { auth } from '../auth.js';
import { loadConfig } from '../config.js';
import { db } from '$lib/db/index.js';
import { user, userSettings } from '$lib/db/schema.js';
import { demoLifetimeMinutes, demoMaxAccounts } from '../settings.js';
import { USER_TABLES } from './account.js';
import { NotFoundError } from '$lib/services/errors.js';
import { deleteAccount } from './account.js';
import { forgetUserSettings } from '$lib/services/settings.js';

const run = promisify(execFile);

/**
 * A demo where everybody gets their own copy.
 *
 * The first version signed every visitor into one shared account and wiped the
 * database hourly. That is simple and it is also the worst of both worlds: two
 * people looking at once each watch the other type, one person can rename
 * everything for everybody, and the only way to make it safe again is to
 * destroy an hour of somebody else's poking about.
 *
 * So a visitor gets an account of their own, seeded with the same week the
 * development database has, and it is deleted when it has been left alone long
 * enough. Nothing is shared, nothing has to be wiped on a timer, and somebody
 * who comes back within the hour finds their own changes where they left them.
 *
 * Three things keep that from being a way to fill a disk: an account is only
 * ever made for a page view (never for an asset or an API call), the instance
 * has a ceiling on how many may exist at once, and every one of them has an
 * expiry from the moment it is made.
 */

/** The marker that makes an account a demo account, and says when it lapses. */
const EXPIRES_KEY = 'demo.expiresAt';

/** Addresses are `demo-<random>@<host>`, which is also how they are found. */
const EMAIL_PREFIX = 'demo-';

export type DemoAccount = { email: string; password: string; userId: string };

/**
 * The domain part, which only has to parse.
 *
 * Nothing is ever sent to these addresses. The instance's own host is used
 * where it is a domain — `demo-a1b2c3@demo.ontoplano.com` is recognisable in a
 * list — and `demo.invalid` where it is not, because `demo-a1b2c3@localhost`
 * is not an address as far as the validator is concerned, and a demo that
 * cannot make an account on a developer's machine is a demo nobody can work on.
 * `.invalid` is reserved for exactly this by RFC 2606.
 */
function domainFor(host: string): string {
	return host.includes('.') && !host.endsWith('.localhost') ? host : 'demo.invalid';
}

function emailFor(host: string): string {
	return `${EMAIL_PREFIX}${randomBytes(6).toString('hex')}@${domainFor(host)}`;
}

/** How many demo accounts exist right now. */
export function demoAccountCount(): number {
	return db
		.select({ userId: userSettings.userId })
		.from(userSettings)
		.where(eq(userSettings.key, EXPIRES_KEY))
		.all().length;
}

/**
 * Make one, seed it, and hand back what to sign in with.
 *
 * The password is generated and never shown: the session cookie is how the
 * visitor stays in, and an address nobody can read mail for cannot be recovered
 * anyway. Returning it is only so the caller can complete the sign-in in the
 * same request.
 *
 * Returns null when the instance is at its ceiling — the caller then shows the
 * front page rather than a broken app, which is the honest failure for "the
 * demo is busy".
 */
/**
 * How many demo accounts one address may be given, and how quickly.
 *
 * A person opening the demo, closing it and opening it again wants a handful;
 * a script wants thousands. Both are answered by the same number — and it
 * lives here rather than beside one caller, because there are two ways in: the
 * hook that signs a returning visitor in, and the waiting room that makes the
 * account for a new one.
 */
export { DEMO_ACCOUNTS_PER_ADDRESS, DEMO_WINDOW_MS } from '$lib/demo-limits';

export async function createDemoAccount(
	host: string,
	make: (host: string) => Promise<DemoAccount | null> = makeDemoAccount
): Promise<DemoAccount | null> {
	const started = Date.now();
	const spare = takeSpare();
	// Queued behind whatever seed is running, and a spare made while it waited
	// is taken rather than a second account seeded.
	const account = spare ?? (await inLane(async () => takeSpare() ?? make(host)));
	console.log(
		`demo: ${account ? 'account handed over' : 'no account to hand over'} in ${Date.now() - started}ms` +
			` (${spare ? 'spare' : 'made while waiting'}; ${demoAccountCount()} out, ${spares.length} spare)`
	);
	void fillDemoSpares(host, make);
	return account;
}

/**
 * One seed at a time, whoever asked for it.
 *
 * A seed is a child Node process, and the demo's box has under a gigabyte. A
 * link posted somewhere sends a crowd in the same minute; with the spares gone,
 * every one of them started a seed of its own, the box ran out of memory and
 * the demo went down for everybody — the visitors waiting included. In a line,
 * the tenth visitor waits for nine seeds, and the box stays up to finish them.
 */
let lane: Promise<unknown> = Promise.resolve();

function inLane<T>(work: () => Promise<T>): Promise<T> {
	const turn = lane.then(work, work);
	lane = turn.catch(() => undefined);
	return turn;
}

/**
 * Accounts made and seeded before anybody asked for them.
 *
 * Seeding a week takes seconds — it is a child process writing a few hundred
 * rows — and a visitor used to sit through all of it in the waiting room. So
 * the demo keeps a couple ready: pressing the button takes one, which is a
 * sign-in and nothing more, and the next is seeded behind the scenes.
 *
 * Kept in memory, because the password is what a spare is handed over with
 * and a password is not written down anywhere. A restart forgets them; they
 * carry an expiry like any demo account, so the sweep collects them.
 */
const DEMO_SPARES = 2;
const spares: DemoAccount[] = [];
let filling: Promise<void> | null = null;

/** The oldest spare that still exists, its clock started from now. */
function takeSpare(): DemoAccount | null {
	for (let spare = spares.shift(); spare; spare = spares.shift()) {
		if (!isDemoAccount(spare.userId)) continue;
		touchDemoAccount(spare.userId);
		return spare;
	}
	return null;
}

/** How many are waiting, for the tests and the operator's curiosity. */
export function demoSpareCount(): number {
	return spares.length;
}

/**
 * Top the spares up, one at a time, in the background.
 *
 * One fill at a time: two visitors in the same second must not start four
 * seeds. A failure is logged and ends the fill — the next request tries again.
 */
export function fillDemoSpares(
	host: string,
	make: (host: string) => Promise<DemoAccount | null> = makeDemoAccount
): Promise<void> {
	if (filling) return filling;
	const fill = async () => {
		try {
			while (spares.length < DEMO_SPARES) {
				const account = await inLane(() => make(host));
				if (!account) return;
				spares.push(account);
			}
		} catch (e) {
			console.error('demo: making a spare failed:', e instanceof Error ? e.message : e);
		}
	};
	// Cleared in `.finally`, which always runs after this assignment — clearing
	// it inside `fill` would happen first when there is nothing to make, and
	// leave a settled promise here that no later call could get past.
	filling = fill().finally(() => {
		filling = null;
	});
	return filling;
}

async function makeDemoAccount(host: string): Promise<DemoAccount | null> {
	if (demoAccountCount() >= demoMaxAccounts()) return null;

	const email = emailFor(host);
	const password = randomBytes(24).toString('base64url');

	const created = await auth.api.signUpEmail({
		body: { email, password, name: 'Demo' }
	});
	const userId = created?.user?.id;
	if (!userId) return null;

	const expiresAt = new Date(Date.now() + demoLifetimeMinutes() * 60_000).toISOString();
	db.insert(userSettings)
		.values({ userId, key: EXPIRES_KEY, value: expiresAt })
		.onConflictDoUpdate({
			target: [userSettings.userId, userSettings.key],
			set: { value: expiresAt }
		})
		.run();
	forgetUserSettings(userId);

	await seed(email);

	return { email, password, userId };
}

/**
 * Fill it with a week worth looking at.
 *
 * The seed is `scripts/seed-dev.mjs`, run as a child process against the same
 * database file. It is the same script the development database uses and the
 * same one the old hourly reset ran, so there is one set of fixtures and one
 * place to extend when a feature is added — a demo that shows empty sections is
 * a demo of the empty states.
 *
 * A failure here is not fatal: an account with nothing in it is a worse demo
 * than a full one, and a better one than an error page.
 */
async function seed(email: string): Promise<void> {
	const path = loadConfig().database.path;
	const script = 'scripts/seed-dev.mjs';
	if (!existsSync(script)) {
		console.error('demo: no seed script beside the app; the account will be empty');
		return;
	}

	try {
		await run(process.execPath, [script, path, email], { timeout: 30_000 });
	} catch (e) {
		console.error('demo: seeding failed', e);
	}
}

/**
 * Put one demo account back the way it arrived.
 *
 * Everything the account owns is deleted and the fixtures are laid down again —
 * the same script, so what somebody resets to is exactly what the next visitor
 * would have been given. The account itself, its address and its session all
 * survive: the point is to undo a mess, not to sign somebody out of a demo they
 * cannot sign back into.
 *
 * The timer is reset with it, because somebody who just asked for a fresh demo
 * is somebody who intends to keep looking.
 */
export async function resetDemoAccount(userId: string): Promise<void> {
	// The one function that wipes a whole account, so it checks its own
	// premise rather than trusting every caller forever: only an account
	// carrying the demo stamp may be emptied here.
	if (!isDemoAccount(userId)) throw new NotFoundError('account');

	const account = db.select({ email: user.email }).from(user).where(eq(user.id, userId)).get();
	if (!account) throw new NotFoundError('account');

	db.transaction((tx) => {
		// Parents last, the way deleting an account does it — a child row whose
		// parent is already gone is a foreign key that cannot be satisfied.
		for (const table of USER_TABLES) table.remove(tx, userId);
	});

	touchDemoAccount(userId);
	await seed(account.email);
}

/** Whether this account is a demo one, and whether its time is up. */
/**
 * Whether an account is one of the demo's throwaway copies.
 *
 * The expiry stamp IS the distinction: a visitor's account carries one from
 * birth, and an account somebody made deliberately — the operator's — never
 * does. It is also why the sweep cannot eat the operator: it only ever
 * deletes what carries the stamp.
 */
export function isDemoAccount(userId: string): boolean {
	return demoExpiry(userId) !== null;
}

export function demoExpiry(userId: string): string | null {
	const row = db
		.select({ value: userSettings.value })
		.from(userSettings)
		.where(and(eq(userSettings.userId, userId), eq(userSettings.key, EXPIRES_KEY)))
		.get();
	return row?.value ?? null;
}

/**
 * Delete every demo account whose time has passed.
 *
 * Run from the box's timer, and also opportunistically when a new visitor
 * arrives — so a demo nobody has swept still cleans up after itself, and the
 * ceiling above is a ceiling on *live* accounts rather than on all the accounts
 * there have ever been.
 *
 * `deleteAccount` is the same function the account page calls, so a demo
 * account leaves exactly as thoroughly as a real one.
 */
/**
 * How often the sweep is worth running, at most.
 *
 * It is one indexed query when there is nothing to do, but it is on the path of
 * every request to a demo instance, and once a minute is far more often than
 * accounts expire.
 */
const SWEEP_EVERY_MS = 60_000;
let lastSweep = 0;

/**
 * Sweep, unless one just happened.
 *
 * This exists because the sweep used to run in exactly one place: the branch
 * that hands a *new* visitor an account. So a demo nobody new arrived at never
 * cleaned up — the accounts sat there past their expiry, and the one person
 * refreshing the page kept the instance alive without ever triggering the thing
 * that was supposed to end their session. Called from every demo request now,
 * which is the only place that is true whether or not anybody new shows up.
 */
export function maybeSweepDemoAccounts(now = new Date()): void {
	if (now.getTime() - lastSweep < SWEEP_EVERY_MS) return;
	lastSweep = now.getTime();
	try {
		// A spare nobody has taken yet is waiting, not abandoned.
		for (const spare of spares) touchDemoAccount(spare.userId, now);
		sweepDemoAccounts(now);
	} catch (e) {
		// A tidy-up that throws must not take the request with it.
		console.error('demo: sweep failed:', e instanceof Error ? e.message : e);
	}
}

export function sweepDemoAccounts(now = new Date()): number {
	const stamp = now.toISOString();
	const expired = db
		.select({ userId: userSettings.userId })
		.from(userSettings)
		.where(and(eq(userSettings.key, EXPIRES_KEY), lt(userSettings.value, stamp)))
		.all();

	for (const { userId } of expired) deleteAccount(userId);
	if (expired.length) {
		console.log(`demo: deleted ${expired.length} expired account(s)`);
		reclaimSpace();
	}
	return expired.length;
}

/**
 * How much of the demo's file may be free pages before it is vacuumed.
 *
 * A deleted account's pages stay in the file for SQLite to reuse; nothing
 * hands them back to the disk. With an account made per visitor and deleted
 * hours later, the demo's database reached 1.2 GB on a box with 25. A vacuum
 * pauses writes for as long as it takes, which on the demo is a price worth
 * paying and on a real instance is not — so this lives here and only here.
 */
const DEMO_VACUUM_FREE_SHARE = 0.25;

function reclaimSpace(): void {
	const pages = db.get<{ page_count: number }>(sql`PRAGMA page_count`)?.page_count ?? 0;
	const free = db.get<{ freelist_count: number }>(sql`PRAGMA freelist_count`)?.freelist_count ?? 0;
	if (pages === 0 || free / pages < DEMO_VACUUM_FREE_SHARE) return;
	db.run(sql`VACUUM`);
	console.log(`demo: vacuumed ${free} free page(s) of ${pages}`);
}

/**
 * Push an account's expiry out, because somebody is using it.
 *
 * The lifetime is "since last seen" rather than "since created": a visitor
 * reading carefully for two hours should not have the page taken away
 * mid-sentence, and one who left an hour ago is not coming back.
 */
export function touchDemoAccount(userId: string, now = new Date()): void {
	const expiresAt = new Date(now.getTime() + demoLifetimeMinutes() * 60_000).toISOString();
	db.update(userSettings)
		.set({ value: expiresAt })
		.where(and(eq(userSettings.userId, userId), eq(userSettings.key, EXPIRES_KEY)))
		.run();
}

/**
 * Demo accounts left behind by an older deployment, or by a crash mid-creation.
 *
 * An account whose address looks like ours but which carries no expiry would
 * otherwise live forever. Swept on the same pass, with the same reasoning: the
 * demo owns every address at this host.
 */
export function orphanedDemoAccounts(host: string): string[] {
	const rows = db
		.select({ id: user.id })
		.from(user)
		.where(like(user.email, `${EMAIL_PREFIX}%@${domainFor(host)}`))
		.all();

	return rows.map((r) => r.id).filter((id) => demoExpiry(id) === null);
}
