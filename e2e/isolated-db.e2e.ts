import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The app's own services, against a real database, on the device — and still
 * there afterwards.
 *
 * Everything the isolated instance will be rests on this working, and three
 * parts of it are not obvious. SQLite is WebAssembly, which the app's own CSP
 * refuses unless `wasm-unsafe-eval` is granted. Its OPFS backend needs
 * `createSyncAccessHandle`, which exists in a dedicated worker and nowhere
 * else — not on the page, not in the service worker — so the database is a
 * worker, the services run beside it, and everything talks to them by
 * message. And the `sahpool` backend is the one that does not demand
 * cross-origin isolation, which matters because those headers would break the
 * payment overlay on /buy.
 *
 * What runs in the worker is not a test double: `createTodo` and `listTodos`
 * from $lib/services, over Drizzle's better-sqlite3 driver, over the WASM
 * client. The page never touches SQL.
 */
test('the services run on the device and their writes survive a reload', async ({ page }) => {
	test.setTimeout(120_000);
	page.on('console', (m) => {
		if (m.type() === 'error') console.log('CONSOLE ' + m.text().slice(0, 200));
	});

	await register(page, testEmail('localdb'));
	await visit(page, '/demo/isolated-db');
	await expect(page.getByTestId('todos')).not.toHaveText('-1', { timeout: 30_000 });

	await expect(page.getByTestId('error')).toHaveText('');
	// The backend that needs no cross-origin isolation, with the app's own
	// migrations applied — not a table invented for the test.
	await expect(page.getByTestId('vfs')).toContainText('opfs-sahpool');
	const tables = Number((await page.getByTestId('vfs').textContent())?.match(/(\d+) tables/)?.[1]);
	expect(tables).toBeGreaterThan(50);

	// A real service call round-tripped: validated title, ownership stamped,
	// row read back by the same query the todo page uses.
	await expect(page.getByTestId('latest')).toHaveText('written on the device');
	const first = Number(await page.getByTestId('todos').textContent());
	expect(first).toBeGreaterThan(0);

	// The one that matters. A database that starts empty every time is a cache.
	await page.reload({ waitUntil: 'load' });
	await expect(page.getByTestId('todos')).not.toHaveText('-1', { timeout: 30_000 });
	expect(Number(await page.getByTestId('todos').textContent())).toBe(first + 1);
});
