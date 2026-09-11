import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A real page of the app, served by the device.
 *
 * `?selfContained` (honoured because the test build sets
 * PUBLIC_ONTOPLANO_SELF_CONTAINED_OPT_IN) installs the fetch bridge, after which the
 * to-do page's own form and its own data requests are answered by the worker
 * out of the on-device database — same route file, same services, no server.
 * The server stays reachable throughout, which is exactly what makes the
 * proof sharp: anything the bridge missed would land in the server account,
 * and the last assertion is that nothing did.
 *
 * One hybrid-harness caveat: the first paint of a `?selfContained` page is still the
 * server's render, so local rows appear on the next client-side data fetch —
 * an action settling, or a navigation. The real self-contained build has no SSR and
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
	await visit(page, '/tasks/todo?selfContained=1');

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

	// The other ported routes answer from the device too: each client-side
	// navigation here is a __data.json the bridge resolves in the worker, and
	// a route whose self-contained twin broke would 500 instead of rendering.
	for (const [name, path] of [
		['Board', '/tasks/board'],
		['Goals', '/goals'],
		['Ideas', '/ideas'],
		['Plan', '/tasks/plan'],
		['Notebooks', '/notebooks'],
		['Inventory', '/inventory'],
		['Finance', '/finance/bills'],
		['Health', '/health/habits'],
		// The wordmark is the desktop way home; the Home tab lives in the
		// phone's bottom bar.
		['ontoplano', '/']
	] as const) {
		await visit(page, '/tasks/todo?selfContained=1');
		await page.getByRole('link', { name, exact: true }).first().click();
		await page.waitForURL(`**${path}`);
		await expect(page.locator('body')).not.toContainText('Internal Error');
	}

	// Reminders are the device's own business: set through the self-contained page,
	// found due by the layout's poll of /api/reminders — which the bridge
	// answers from the worker — and marked delivered back into OPFS.
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	await visit(page, '/reminders?selfContained=1');
	await page.locator('[name="day"]').fill(yesterday.toISOString().slice(0, 10));
	await page.locator('[name="time"]').fill('09:00');
	await page.locator('[name="label"]').first().fill('set on the device');
	await page.getByRole('button', { name: 'Set it' }).click();
	// Flipping to the past view is a client-side navigation, so the list it
	// draws comes through the bridge. (A full reload here would be the
	// server's render — the hybrid caveat from the top of this file.)
	await page.getByRole('button', { name: 'Past', exact: true }).click();
	await page.waitForURL((u) => u.searchParams.get('past') === '1');
	await expect(page.getByText('set on the device')).toBeVisible({ timeout: 30_000 });

	// The server's own render of the same page has never seen the row. This
	// is the whole claim: self-contained mode did not leak a single write.
	await visit(page, '/tasks/todo');
	await expect(page.getByRole('button', { name: /New to-do/ }).first()).toBeVisible();
	await expect(page.getByText(title)).toHaveCount(0);
	await visit(page, '/reminders?days=7&past=1');
	await expect(page.locator('main')).toBeVisible();
	await expect(page.getByText('set on the device')).toHaveCount(0);
});
