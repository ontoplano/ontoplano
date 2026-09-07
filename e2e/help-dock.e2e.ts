import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The corner where help lives, and the button for when none of it helped.
 *
 * On a phone the row was four squares across the bottom right of every screen,
 * over whatever was under it. Folded it is one, and it says which one it is.
 */
test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('the dock is one button until it is opened, and folds again', async ({ page }) => {
		await register(page, `dock-${Date.now()}@test.invalid`);
		await visit(page, '/');

		const fold = page.getByRole('button', { name: 'Help', exact: true });
		await expect(fold).toBeVisible();
		await expect(page.getByRole('link', { name: 'The documentation' })).toBeHidden();

		await fold.click();
		await expect(page.getByRole('link', { name: 'The documentation' })).toBeVisible();

		await page.getByRole('button', { name: 'Hide help' }).click();
		await expect(page.getByRole('link', { name: 'The documentation' })).toBeHidden();
	});
});

test('on a wide screen the row is simply there, with no fold to press', async ({ page }) => {
	await register(page, `dock-wide-${Date.now()}@test.invalid`);
	await visit(page, '/');

	await expect(page.getByRole('link', { name: 'The documentation' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Help', exact: true })).toBeHidden();
});

/**
 * A bug, reported by somebody who hit one.
 *
 * It reaches the admin page, which is the only reason to have the button:
 * a report nobody reads is a form that wastes the reporter's time.
 */
test('a reported problem reaches the admin page', async ({ page }) => {
	const mark = `the plan draws nothing ${Date.now()}`;
	await register(page, `dock-report-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/plan');

	await page.getByRole('button', { name: 'Report a problem with this screen' }).click();
	const dialog = page.getByRole('dialog', { name: 'Something wrong here?' });
	await dialog.locator('textarea').fill(mark);
	await dialog.getByRole('button', { name: 'Send' }).click();
	await expect(dialog).toContainText('Thank you');

	// The report carries where it came from, which is the first thing anybody
	// reading them wants to know.
	const seen = await page.evaluate(async () => {
		const res = await fetch('/api/report', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'a second one', url: '/tasks/plan' })
		});
		return res.status;
	});
	expect(seen).toBe(200);
});
