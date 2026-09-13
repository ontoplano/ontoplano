import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PAGE_TURN_DEFAULTS } from '../src/lib/page-turn';

import { visit } from './helpers/visit';

/**
 * Setting how the page turns, while watching it turn.
 *
 * "Hardness 30" means nothing written down: the only way to choose these three
 * numbers is to see the screen do it. So the controls put a value in force the
 * moment it moves — the whole running app dissolves by it from then on — and
 * "Show me" plays a turn on the spot rather than sending somebody off to
 * another screen to find out what they just changed.
 *
 * It lives on the Instance page because it is the instance's feel rather than
 * an account's setting: everybody who opens this copy gets the same dissolve.
 */
test.use({ viewport: { width: 1280, height: 950 } });

// Both cases write to the one config file the server is running against.
test.describe.configure({ mode: 'serial' });

const tuner = 'form[action="?/setPageTurn"]';

/**
 * Open the Instance page as whoever owns this instance.
 *
 * The page is the owner's — the first account — and everybody else gets a 404,
 * so registering a fresh account here would land on nothing. Which account
 * that is depends on whichever file ran first, so it is looked up rather than
 * assumed and tried against both passwords the suite uses — the same thing
 * `admin.e2e.ts` does, and this file runs in that project for the same reason:
 * "the oldest account" is a moving target while `app` is still making them.
 */
let ownerSignIns = 0;

async function openTheInstancePage(page: import('@playwright/test').Page) {
	const db = new Database(process.env.PLAYWRIGHT_DB ?? join(tmpdir(), 'ontoplano-e2e.db'));
	const first = db.prepare('select email from user order by created_at limit 1').get() as
		| { email: string }
		| undefined;
	db.close();
	expect(first, 'no accounts in the test database').toBeTruthy();

	// A fresh address per attempt: credential submission is rate limited per
	// client, and two tests each trying two passwords from one address spends
	// that budget and fails on the limiter rather than on anything real.
	let signedIn = false;
	for (const password of ['smoke-test-password', 'hunter2hunter2']) {
		ownerSignIns += 1;
		const res = await page.request.post('/api/auth/sign-in/email', {
			headers: { 'x-forwarded-for': `10.32.0.${ownerSignIns}` },
			data: { email: first!.email, password }
		});
		if (res.ok()) {
			signedIn = true;
			break;
		}
	}
	expect(signedIn, `could not sign in as ${first!.email}`).toBe(true);

	await visit(page, '/settings/instance');
	await expect(page.locator(tuner)).toBeVisible();
}

async function slide(page: import('@playwright/test').Page, name: string, to: string) {
	const dial = page.locator(`${tuner} input[name="${name}"]`);
	await dial.fill(to);
	await dial.dispatchEvent('input');
}

test('the sliders change the running app, and saving keeps them', async ({ page }) => {
	test.setTimeout(120_000);
	await openTheInstancePage(page);

	// It opens on what the instance is actually set to, whatever that is: this
	// writes to config.toml, so the suite does not get a fresh one each time.
	await expect(page.locator(`${tuner} input[name="grain"]`)).toHaveValue(
		await page.locator('feTurbulence').first().getAttribute('baseFrequency')
	);

	await slide(page, 'durationMs', '800');
	await slide(page, 'grain', '1.5');

	/*
	 * In force, not merely displayed. The filter the whole app is drawn through
	 * is the thing being read here, and the duration the rest of the app times
	 * itself by — a preview that only moved a preview would be no help at all.
	 */
	await expect(page.locator('feTurbulence').first()).toHaveAttribute('baseFrequency', '1.5');
	expect(
		await page.evaluate(() =>
			getComputedStyle(document.documentElement).getPropertyValue('--page-turn').trim()
		)
	).toBe('800ms');

	// And it can be watched here rather than somewhere else.
	await page.getByRole('button', { name: 'Show me' }).click();
	await expect
		.poll(async () =>
			page.evaluate(() =>
				[...document.querySelectorAll('div')].some((d) =>
					(d as HTMLElement).style.filter.includes('url(')
				)
			)
		)
		.toBe(true);

	await page.locator(`${tuner} button.btn-primary`).click();
	await page.reload();
	await expect(page.locator(`${tuner} input[name="grain"]`)).toHaveValue('1.5');
	await expect(page.locator('feTurbulence').first()).toHaveAttribute('baseFrequency', '1.5');

	// Put the instance back: config.toml outlives this test.
	await page.getByRole('button', { name: 'Back to the defaults' }).click();
	await page.locator(`${tuner} button.btn-primary`).click();
	await page.reload();
	await expect(page.locator(`${tuner} input[name="grain"]`)).toHaveValue(
		String(PAGE_TURN_DEFAULTS.grain)
	);
});

test('there is a way back to the numbers it shipped with', async ({ page }) => {
	test.setTimeout(120_000);
	await openTheInstancePage(page);

	const back = page.getByRole('button', { name: 'Back to the defaults' });

	await slide(page, 'hardness', '70');
	await expect(back).toBeEnabled();

	await back.click();
	await expect(page.locator(`${tuner} input[name="hardness"]`)).toHaveValue(
		String(PAGE_TURN_DEFAULTS.hardness)
	);
	await expect(back).toBeDisabled();
});
