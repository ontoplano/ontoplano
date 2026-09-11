import { expect, test } from '@playwright/test';

/**
 * Install it and it works: no sign-up, no password, no server.
 *
 * This drives the artefact a phone actually ships — the static build over
 * the on-device database — so what passes here is the product's first
 * promise. The dashboard on the first paint, a todo written through the real
 * form, and the row still there after the page is torn down and reopened.
 */
test('the app opens onto a working instance and keeps what it is told', async ({ page }) => {
	test.setTimeout(120_000);
	page.on('pageerror', (e) => console.log('PAGEERROR ' + String(e).slice(0, 300)));

	await page.goto('/');
	// No login, no welcome: the holder of the device is the account.
	await expect(page.getByText("TODAY'S TASKS")).toBeVisible({ timeout: 60_000 });

	// The first open is shown around, exactly like a first visit anywhere;
	// dismissing it is remembered by the device, so it happens once.
	const tour = page.getByRole('dialog', { name: 'Tutorial' });
	await expect(tour).toBeVisible({ timeout: 15_000 });
	await tour.getByRole('button', { name: 'Dismiss' }).click();
	await tour.getByRole('button', { name: 'Okay, dismiss!' }).click();
	await expect(tour).toBeHidden();

	// A write through the app's own form, into OPFS. Straight to the todo
	// list — the planner tab is not ported yet, and the point here is the
	// write path, not coverage.
	await page.goto('/tasks/todo');
	const title = `installed and working ${Date.now()}`;
	const field = page.locator('[name="heading"]');
	await expect(async () => {
		await page
			.getByRole('button', { name: /New to-do/ })
			.first()
			.click();
		await expect(field).toBeVisible({ timeout: 2000 });
	}).toPass({ timeout: 30000 });
	await field.fill(title);
	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });

	// The only test that matters for a record of a life: close it, open it,
	// it is still there.
	await page.reload({ waitUntil: 'load' });
	await expect(page.getByText(title)).toBeVisible({ timeout: 60_000 });
	// And the tour does not come back: its dismissal was a write too.
	await expect(page.getByRole('dialog', { name: 'Tutorial' })).toBeHidden();
});
