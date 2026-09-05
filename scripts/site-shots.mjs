#!/usr/bin/env node
/**
 * The screenshots ontoplano.com shows: the hero carousel, and the phone.
 *
 * They are pictures of the app, so they are taken from the app — a throwaway
 * instance, seeded with the same synthetic week the dev database gets, driven
 * by Playwright. Rebuilding them after a UI change is one command instead of
 * an afternoon of cropping:
 *
 *     make shots                                 # in the SITE repo, which owns the assets
 *     SHOT_DIR=/tmp/look node scripts/site-shots.mjs   # somewhere else first
 *
 * Needs `cwebp` (apt: webp) — the site serves webp — and ImageMagick's
 * `montage` for the three-phones slide. The video slide is not touched here;
 * that one is a recording, and `ontoplano-site/Makefile`'s `video` target owns
 * it.
 *
 * A script rather than a build step, on purpose: it writes into another
 * repository's assets, and a build must never change the tree it builds from.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = process.env.SHOT_DIR ?? join(ROOT, '..', 'ontoplano-site', 'assets');
const PORT = 4189;
const ORIGIN = `http://localhost:${PORT}`;

for (const tool of ['cwebp', 'montage']) {
	try {
		execFileSync('which', [tool], { stdio: 'ignore' });
	} catch {
		console.error(`${tool} is not installed (apt: webp, imagemagick)`);
		process.exit(1);
	}
}
mkdirSync(OUT, { recursive: true });

const work = mkdtempSync(join(tmpdir(), 'ontoplano-shots-'));
const dbPath = join(work, 'shots.db');
const configDir = join(work, 'config');

console.log('preparing a throwaway instance…');
execFileSync('npx', ['drizzle-kit', 'push', '--force'], {
	env: { ...process.env, DATABASE_URL: dbPath },
	stdio: 'ignore',
	cwd: ROOT
});
mkdirSync(configDir, { recursive: true });
writeFileSync(
	join(configDir, 'config.toml'),
	'[server]\nhost = "127.0.0.1"\nport = "' +
		PORT +
		'"\n\n[database]\n\n[week]\nfirst_day = "0"\ngenerate_day = "6"\n\n[registration]\nmode = "open"\n'
);

const server = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], {
	cwd: ROOT,
	detached: true,
	env: {
		...process.env,
		DATABASE_URL: dbPath,
		ONTOPLANO_CONFIG_DIR: configDir,
		ORIGIN,
		BETTER_AUTH_SECRET: 'site-shots-secret-site-shots-secret',
		ONTOPLANO_SELF_HOST: 'true',
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

async function waitForServer() {
	for (let i = 0; i < 120; i++) {
		try {
			if ((await fetch(`${ORIGIN}/login`)).ok) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error('the dev server never answered');
}

async function register(email, name) {
	const signUp = await fetch(`${ORIGIN}/api/auth/sign-up/email`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Origin: ORIGIN,
			'x-forwarded-for': '203.0.113.9'
		},
		body: JSON.stringify({ email, password: 'site-shots-password', name })
	});
	if (!signUp.ok) throw new Error(`sign-up failed: ${await signUp.text()}`);
	const cookie = (signUp.headers.get('set-cookie') ?? '').split(';')[0].trim();
	await fetch(`${ORIGIN}/welcome`, {
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
const cookie = await register('dev@semotina.user', 'Ana');
execFileSync('node', ['scripts/seed-dev.mjs', dbPath, 'dev@semotina.user'], {
	stdio: 'inherit',
	cwd: ROOT
});

const browser = await chromium.launch();

/** One page per look, cookie carried over. */
async function pageAt(viewport, dark = false) {
	const context = await browser.newContext({
		viewport,
		deviceScaleFactor: 2,
		colorScheme: dark ? 'dark' : 'light',
		...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {})
	});
	const [name, value] = cookie.split('=');
	await context.addCookies([{ name, value, url: ORIGIN }]);
	return context.newPage();
}

/** PNG from Playwright, webp on disk — the only format the site serves. */
function toWebp(png, name) {
	execFileSync('cwebp', ['-quiet', '-q', '88', png, '-o', join(OUT, name)]);
	console.log(`wrote ${join(OUT, name)}`);
}

const DESKTOP = { width: 1400, height: 900 };
const png = (name) => join(work, `${name}.png`);

/*
 * The carousel, in `content.mjs` order. Each entry is a path and a moment to
 * wait for; the alt texts over there describe these exact screens, so a new
 * page here means updating both.
 */
const slides = [
	['app-planner', '/planner/plan?view=week', '.ec-event'],
	['app-notebook', null, null], // below: needs a click into a notebook
	['app-goals', '/goals', 'main'],
	['app-people', '/diary/people', 'main'],
	['app-shopping', '/shopping', 'main'],
	['app-recipes', '/kitchen/recipes', 'main'],
	['app-health', '/health/habits', 'main']
];

const page = await pageAt(DESKTOP);
for (const [name, path, waitFor] of slides) {
	if (!path) continue;
	await page.goto(`${ORIGIN}${path}`);
	if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
	await page.waitForTimeout(1200);
	await page.screenshot({ path: png(name) });
	toWebp(png(name), `${name}.webp`);
}

// The notebook slide is a notebook open, not the shelf.
await page.goto(`${ORIGIN}/diary/notebooks`);
await page.waitForTimeout(800);
const firstNotebook = page.locator('a[href*="/diary/notebooks/"]').first();
if (await firstNotebook.count()) {
	await firstNotebook.click();
	await page.waitForTimeout(1200);
}
await page.screenshot({ path: png('app-notebook') });
toWebp(png('app-notebook'), 'app-notebook.webp');

/*
 * Three phones side by side: the day, the todo list, the shopping list.
 * One frame each, montaged — a single portrait shot in a landscape slide is
 * a strip with a desert either side of it.
 */
const PHONE = { width: 390, height: 800 };
const phoneShots = [
	['phone-a', '/planner/plan'],
	['phone-b', '/planner/todo'],
	['phone-c', '/shopping']
];
const phone = await pageAt(PHONE);
for (const [name, path] of phoneShots) {
	await phone.goto(`${ORIGIN}${path}`);
	await phone.waitForTimeout(1500);
	await phone.screenshot({ path: png(name) });
}
execFileSync('montage', [
	png('phone-a'),
	png('phone-b'),
	png('phone-c'),
	'-tile',
	'3x1',
	'-geometry',
	'+24+24',
	'-background',
	'#111827',
	png('app-phones')
]);
toWebp(png('app-phones'), 'app-phones.webp');

/*
 * The phone at the bottom of the page: dark, with the wheel open. The wheel
 * opens on a press of the thumb button; a tap leaves it open (see
 * capture.e2e.ts, "a tap opens the pie and it stays open").
 */
const night = await pageAt(PHONE, true);
await night.goto(`${ORIGIN}/planner/board`);
await night.waitForTimeout(1500);
// The phone bar's own trigger — the header carries a second one that is
// hidden at this width, so "first match" would be an invisible button.
const trigger = night.locator('button.pie-handle:visible').first();
if (await trigger.count()) {
	await trigger.tap();
	await night.waitForTimeout(700);
}
await night.screenshot({ path: png('phone-pie') });
toWebp(png('phone-pie'), 'phone-pie.webp');

await browser.close();
stop();
console.log(`\nall shots in ${OUT} — look at them before committing the site repo.`);
process.exit(0);
