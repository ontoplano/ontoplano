import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A real page of the app, served by the device.
 *
 * `?local` (honoured because the test build sets
 * PUBLIC_ONTOPLANO_LOCAL_OPT_IN) installs the fetch bridge, after which the
 * to-do page's own form and its own data requests are answered by the worker
 * out of the on-device database — same route file, same services, no server.
 * The server stays reachable throughout, which is exactly what makes the
 * proof sharp: anything the bridge missed would land in the server account,
 * and the last assertion is that nothing did.
 *
 * One hybrid-harness caveat: the first paint of a `?local` page is still the
 * server's render, so local rows appear on the next client-side data fetch —
 * an action settling, or a navigation. The real local build has no SSR and
 * no caveat.
 */
test('the todo page runs against the device, and the server never hears of it', async ({
	page
}) => {
	test.setTimeout(180_000);
	page.on('console', (m) => {
		if (m.type() === 'error') console.log('CONSOLE ' + m.text().slice(0, 300));
	});

	await register(page, `localmode-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/todo?local=1');

	// Create through the page's own form. The bridge answers the POST from
	// the worker; the invalidation that follows re-reads the list from the
	// device database.
	const title = 'kept on the device';
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

	// Navigating away and back stays on the bridge, and the row is still
	// there: the write went to OPFS, not to the page's memory.
	await page.getByRole('link', { name: 'Board' }).first().click();
	await page.waitForURL('**/tasks/board');
	await page.goBack();
	await expect(page.getByText(title)).toBeVisible({ timeout: 30_000 });

	// The server's own render of the same page has never seen the row. This
	// is the whole claim: local mode did not leak a single write.
	await visit(page, '/tasks/todo');
	await expect(page.getByRole('button', { name: /New to-do/ }).first()).toBeVisible();
	await expect(page.getByText(title)).toHaveCount(0);
});
