/**
 * The screenshots the app itself shows in its help.
 *
 * One of them: the Family tab, shown on the billing page to somebody whose
 * partner is the one paying, so they can see what to ask for instead of buying
 * a second subscription. A picture of the real page, taken from the real code,
 * so it cannot describe a screen that no longer exists — and a script rather
 * than a build step, because it writes into `static/` and a build must never
 * change the tree it builds from.
 *
 *     node scripts/help-shots.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';

const PORT = 4174;
const ORIGIN = `http://localhost:${PORT}`;
const work = mkdtempSync(join(tmpdir(), 'ontoplano-shots-'));
const dbPath = join(work, 'shots.db');
const configDir = join(work, 'config');

console.log('preparing a throwaway instance…');
execFileSync('npx', ['drizzle-kit', 'push', '--force'], {
	env: { ...process.env, DATABASE_URL: dbPath },
	stdio: 'ignore'
});
mkdirSync(configDir, { recursive: true });
writeFileSync(
	join(configDir, 'config.toml'),
	'[server]\nhost = "127.0.0.1"\nport = "' +
		PORT +
		'"\n\n[database]\n\n[week]\nfirst_day = "0"\ngenerate_day = "6"\n\n[registration]\nmode = "open"\n'
);

// Its own process group: `npx` is a shell around vite, and killing the shell
// leaves the server holding the port for the next run.
const server = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], {
	detached: true,
	env: {
		...process.env,
		DATABASE_URL: dbPath,
		ONTOPLANO_CONFIG_DIR: configDir,
		ORIGIN,
		BETTER_AUTH_SECRET: 'help-shots-secret-help-shots-secret',
		// The pages being photographed only exist off a self-hosted box. Selling
		// stays off: an instance that means to sell and has no provider refuses
		// to register anybody, which is the point of that refusal.
		ONTOPLANO_SELF_HOST: 'false',
		// Three accounts in three seconds is exactly what the per-address limit
		// is there to stop, so each one arrives from an address of its own.
		ONTOPLANO_TRUST_PROXY: 'true',
		TZ: 'UTC'
	},
	stdio: 'ignore'
});

const stop = () => {
	try {
		process.kill(-server.pid, 'SIGTERM');
	} catch {
		/* already gone */
	}
	rmSync(work, { recursive: true, force: true });
};
process.on('exit', stop);

/** Wait for the dev server to answer, rather than guessing at a delay. */
async function waitForServer() {
	for (let i = 0; i < 120; i++) {
		try {
			const res = await fetch(`${ORIGIN}/login`);
			if (res.ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error('the dev server never answered');
}

/** Make an account and walk it past the welcome step. */
let client = 0;
async function register(email, name) {
	const from = `203.0.113.${++client}`;
	const signUp = await fetch(`${ORIGIN}/api/auth/sign-up/email`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'x-forwarded-for': from },
		body: JSON.stringify({ email, password: 'help-shots-password', name })
	});
	if (!signUp.ok) throw new Error(`sign-up failed: ${await signUp.text()}`);
	const cookie = (signUp.headers.get('set-cookie') ?? '').split(';')[0].trim();
	await fetch(`${ORIGIN}/welcome?/finish`, {
		method: 'POST',
		headers: {
			Origin: ORIGIN,
			Cookie: cookie,
			'x-sveltekit-action': 'true',
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			timezone: 'UTC',
			firstDay: '0',
			generateDay: '6',
			template: 'blank'
		})
	});
	return cookie;
}

await waitForServer();

const payer = await register('ana@example.com', 'Ana');
await register('bruno@example.com', 'Bruno');
await register('clara@example.com', 'Clara');

/*
 * The plan itself is written straight into the database. Buying one needs a
 * payment provider, and a screenshot is not worth a sandbox checkout.
 */
const db = new Database(dbPath);
const ids = db.prepare('select id, email from user').all();
const idOf = (email) => ids.find((row) => row.email === email).id;
db.prepare(
	`insert into subscriptions (user_id, plan, status, provider, provider_subscription_id, current_period_end, seats)
	 values (?, 'pro', 'active', 'paddle', 'sub_help_shot', '2126-01-01T00:00:00.000Z', 5)
	 on conflict(user_id) do update set
	   plan = 'pro', status = 'active', provider = 'paddle',
	   provider_subscription_id = 'sub_help_shot',
	   current_period_end = '2126-01-01T00:00:00.000Z', seats = 5`
).run(idOf('ana@example.com'));
for (const member of ['bruno@example.com', 'clara@example.com']) {
	db.prepare('insert into plan_members (owner_id, member_id) values (?, ?)').run(
		idOf('ana@example.com'),
		idOf(member)
	);
}
db.close();

const browser = await chromium.launch();
const context = await browser.newContext({
	// Wide enough for the desktop layout, and short enough that the picture is
	// the tab row and the card rather than a screen of background.
	viewport: { width: 1200, height: 640 },
	deviceScaleFactor: 2
});
const [cookieName, cookieValue] = payer.split('=');
await context.addCookies([{ name: cookieName, value: cookieValue, url: ORIGIN }]);
const page = await context.newPage();

await page.goto(`${ORIGIN}/settings/family`);
await page.getByRole('heading', { name: 'Who is on your plan' }).waitFor();
mkdirSync('static/help', { recursive: true });
// Clipped to the tab row and the card: the app header adds nothing to a
// picture whose whole job is to say where the button is.
await page.screenshot({
	path: 'static/help/family-seat.png',
	clip: { x: 24, y: 110, width: 1152, height: 380 }
});
console.log('wrote static/help/family-seat.png');

await browser.close();
stop();
process.exit(0);
