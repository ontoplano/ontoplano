import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A real database, on the device, that is still there afterwards.
 *
 * Everything the local instance will be rests on this working, and three parts
 * of it are not obvious. SQLite is WebAssembly, which the app's own CSP refuses
 * unless `wasm-unsafe-eval` is granted. Its OPFS backend needs
 * `createSyncAccessHandle`, which exists in a dedicated worker and nowhere else
 * — not on the page, not in the service worker — so the database has to be a
 * worker and everything talks to it by message. And the `sahpool` backend is
 * the one that does not demand cross-origin isolation, which matters because
 * those headers would break the payment overlay on /buy.
 *
 * Get any of the three wrong and this fails, which is the point of it.
 */
test('sqlite runs on the device and survives a reload', async ({ page }) => {
	test.setTimeout(120_000);
	page.on('console', (m) => {
		if (m.type() === 'error') console.log('CONSOLE ' + m.text().slice(0, 200));
	});
	page.on('response', (r) => {
		if (r.status() >= 400) console.log(`HTTP ${r.status()} ${r.url()}`);
	});
	page.on('requestfailed', (r) => console.log(`FAILED ${r.url()} ${r.failure()?.errorText}`));

	await register(page, `localdb-${Date.now()}@test.invalid`);
	await visit(page, '/demo/local-db');
	await expect(page.getByTestId('rows')).not.toHaveText('-1', { timeout: 30_000 });

	await expect(page.getByTestId('error')).toHaveText('');
	// The backend that needs no cross-origin isolation.
	// The app's own migrations applied, not a table invented for the test.
	await expect(page.getByTestId('vfs')).toContainText('opfs-sahpool');
	await expect(page.getByTestId('vfs')).toContainText('tables');
	// Every table the server has. A migration that quietly did nothing here
	// would be a schema that diverges the moment anybody adds a column.
	const tables = Number((await page.getByTestId('vfs').textContent())?.match(/(\d+) tables/)?.[1]);
	expect(tables).toBeGreaterThan(50);
	console.log('TABLES ' + tables);
	const first = Number(await page.getByTestId('rows').textContent());
	expect(first).toBeGreaterThan(0);

	// The one that matters. A database that starts empty every time is a cache.
	await page.reload({ waitUntil: 'load' });
	await expect(page.getByTestId('rows')).not.toHaveText('-1', { timeout: 30_000 });
	expect(Number(await page.getByTestId('rows').textContent())).toBe(first + 1);
});
