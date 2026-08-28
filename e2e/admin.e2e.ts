import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The administration area, as somebody arrives at it.
 *
 * Two things here were reported by a person using the app rather than by a
 * test: Administration was a tab you could enter and not leave, and the page
 * said nothing about the layer in front of it. Both are checked from the tab
 * row down, because both were invisible to assertions about a single page.
 *
 * It runs after `app`, since the administrator is the oldest account and the
 * other project is what makes accounts.
 */

const ORIGIN = 'http://localhost:4173';

let attempt = 0;

/** Whoever signed up first owns the instance, and the suite uses two passwords. */
async function signInAsOwner(page: import('@playwright/test').Page): Promise<void> {
	// Not read-only: the server keeps this in WAL mode, and a read-only handle
	// cannot attach to the shared-memory index — it would see a snapshot from
	// before the accounts this depends on.
	const db = new Database(process.env.PLAYWRIGHT_DB ?? join(tmpdir(), 'ontoplano-e2e.db'));
	const first = db.prepare('select email from user order by created_at limit 1').get() as
		| { email: string }
		| undefined;
	db.close();
	expect(first, 'no accounts in the test database').toBeTruthy();

	// A fresh address per attempt: credential submission is rate limited per
	// client, and two tests each trying two passwords from one address is enough
	// to spend that budget and fail on the limiter rather than on the bug.
	for (const password of ['smoke-test-password', 'hunter2hunter2']) {
		attempt += 1;
		const res = await page.request.post('/api/auth/sign-in/email', {
			headers: { Origin: ORIGIN, 'x-forwarded-for': `10.31.0.${attempt}` },
			data: { email: first!.email, password }
		});
		if (res.ok()) return;
	}
	throw new Error(`could not sign in as ${first!.email}`);
}

test('administration is a tab you can leave again', async ({ page }) => {
	await signInAsOwner(page);
	await page.goto('/admin');

	// The tab row is there, and it knows where you are.
	const current = page.locator('[aria-current="page"]');
	await expect(current).toHaveText('Administration');

	// And the way back is a click, not a trip through the menu.
	await page.getByRole('link', { name: 'Account', exact: true }).click();
	await expect(page).toHaveURL(/\/settings\/account$/);
	await expect(page.locator('[aria-current="page"]')).toHaveText('Account');
});

test('says what the box has turned away', async ({ page }) => {
	await signInAsOwner(page);
	await page.goto('/admin');

	// The fixture log `e2e/prepare.mjs` writes, read through the same path a
	// real instance uses.
	const blocked = page.locator('section, article, div').filter({ hasText: 'Blocked' }).last();
	await expect(blocked).toContainText('203.0.113.7');
	await expect(blocked).toContainText('ontoplano-web');
});
