import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A home-screen widget showing one tab of one notebook.
 *
 * The phone half cannot run here — it is a launcher drawing Android views —
 * so this drives everything around it: the phone sending somebody to set a
 * widget up, the key going back to the device's copy of the app, the API that
 * key reads, the list where widgets are edited and deleted, and the notebook
 * opening on the tab and the task a widget's line was pressed for.
 */

/** Where the device's copy of the app lives — `DEVICE_ORIGIN`. */
const DEVICE = 'https://localhost';

async function post(page: Page, path: string, form: Record<string, string>) {
	const origin = new URL(page.url()).origin;
	const res = await page.request.post(path, {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form
	});
	expect(res.ok(), `${path}: ${res.status()}`).toBeTruthy();
}

async function notebookId(page: Page, title: string): Promise<number> {
	await visit(page, '/notebooks');
	// A notebook is reached as `/notebooks/<id>` or selected as `?notebook=<id>`.
	await page.getByRole('link', { name: title }).first().click();
	await page.waitForURL(/\/notebooks(\/|\?notebook=)\d+/);
	const url = new URL(page.url());
	return Number(url.searchParams.get('notebook') ?? url.pathname.split('/').pop());
}

for (const size of [
	{ name: 'desktop', width: 1280, height: 900 },
	{ name: 'phone', width: 390, height: 844 }
]) {
	test(`a notebook widget is set up, read, edited and deleted (${size.name})`, async ({ page }) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width: size.width, height: size.height });
		await register(page, testEmail(`widget-${size.name}`));

		await post(page, '/notebooks?/create', { heading: 'The flat', modules: 'notes,tasks' });
		const id = await notebookId(page, 'The flat');
		await post(page, '/tasks/todo?/create', { heading: 'Paint the hall', notebookId: String(id) });
		await post(page, '/tasks/todo?/create', { heading: 'Buy tiles', notebookId: String(id) });

		// The device's copy of the app is not running here; stand in for it and
		// keep the address it was sent, which is the whole handoff.
		let handedTo: URL | null = null;
		await page.route(`${DEVICE}/**`, (route) => {
			handedTo = new URL(route.request().url());
			return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>device</p>' });
		});

		// What the phone opens when a widget is dropped on the home screen.
		await visit(page, '/settings/integrations/widget?slot=7');
		const dialog = page.getByRole('dialog', { name: 'New widget' });
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('select[name="notebookId"]')).toBeFocused();
		await dialog.locator('select[name="notebookId"]').selectOption({ label: 'The flat' });
		await dialog.locator('select[name="section"]').selectOption('tasks');
		await dialog.locator('select[name="order"]').selectOption('created');
		await dialog.locator('select[name="direction"]').selectOption('asc');
		await page.screenshot({ path: `test-results/notebook-widget-form-${size.name}.png` });
		await dialog.getByRole('button', { name: 'Save' }).click();

		await expect.poll(() => handedTo?.pathname).toBe('/widget');
		const handed = handedTo as unknown as URL;
		expect(handed.searchParams.get('slot')).toBe('7');
		const key = handed.searchParams.get('key')!;
		expect(key).toMatch(/^onto_/);

		// The key reads that tab, in the order chosen, and nothing else.
		const answer = await page.request.get('/api/v1/widget', {
			headers: { authorization: `Bearer ${key}` }
		});
		expect(answer.ok()).toBeTruthy();
		const body = await answer.json();
		expect(body.notebook).toEqual({ id, title: 'The flat' });
		expect(body.items.map((one: { title: string }) => one.title)).toEqual([
			'Paint the hall',
			'Buy tiles'
		]);
		const elsewhere = await page.request.get('/api/v1/inventory', {
			headers: { authorization: `Bearer ${key}` }
		});
		expect(elsewhere.status()).toBe(403);

		// A line pressed on the phone opens that task, on its tab.
		const tiles = body.items[1];
		await visit(page, tiles.href);
		await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
		await expect(
			page.getByRole('dialog', { name: 'Edit task' }).locator('[name="heading"]')
		).toHaveValue('Buy tiles');

		// The list, with the whole verb set.
		await page.unroute(`${DEVICE}/**`);
		await visit(page, '/settings/integrations/widget');
		const row = page.locator('[data-widget-row]');
		await expect(row).toHaveCount(1);
		await expect(row).toContainText('The flat');
		await page.screenshot({ path: `test-results/notebook-widget-list-${size.name}.png` });

		await row.getByRole('button', { name: 'Edit' }).click();
		const edit = page.getByRole('dialog', { name: 'Edit widget' });
		await expect(edit).toBeVisible();
		await edit.locator('select[name="status"]').selectOption('all');
		await edit.locator('select[name="direction"]').selectOption('desc');
		await edit.getByRole('button', { name: 'Save' }).click();
		await expect(edit).toBeHidden();
		await expect(row).toContainText('Everything');

		const after = await page.request.get('/api/v1/widget', {
			headers: { authorization: `Bearer ${key}` }
		});
		expect((await after.json()).items.map((one: { title: string }) => one.title)).toEqual([
			'Buy tiles',
			'Paint the hall'
		]);

		await row.getByRole('button', { name: 'Delete' }).click();
		const confirm = page.getByRole('dialog', { name: 'Delete this widget?' });
		await expect(confirm).toBeVisible();
		await page.waitForTimeout(500);
		await confirm.getByRole('button', { name: 'Yes, delete' }).click();
		await expect(page.locator('[data-widget-row]')).toHaveCount(0);
		await expect(page.getByText('No notebook widgets yet')).toBeVisible();

		const gone = await page.request.get('/api/v1/widget', {
			headers: { authorization: `Bearer ${key}` }
		});
		expect(gone.status()).toBe(401);

		// Nothing on the page scrolls sideways at either size.
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
}
