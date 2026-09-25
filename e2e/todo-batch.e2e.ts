import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

async function add(page: Page, title: string) {
	await page.getByRole('button', { name: /^New task(?: n)?$/ }).click();
	await page.locator('#todo-form [name="heading"]').fill(title);
	await page.getByRole('button', { name: 'Create task', exact: true }).click();
	await expect(page.locator('[data-todo-id]').filter({ hasText: title })).toBeVisible();
}
async function select(page: Page, titles: string[]) {
	await page.getByRole('button', { name: 'Select many', exact: true }).click();
	for (const title of titles)
		await page.getByRole('checkbox', { name: `Select ${title}`, exact: true }).click();
}

test('selection changes tags, status, notebook and deletes only selected tasks', async ({
	page
}) => {
	test.setTimeout(120_000);
	await register(page, testEmail('batch'));
	await page.request.post('/notebooks?/create', {
		headers: { Origin: new URL(page.url()).origin, 'x-sveltekit-action': 'true' },
		form: { heading: 'Destination' }
	});
	await visit(page, '/tasks/todo');
	for (const title of ['First batch task', 'Second batch task', 'Keep this task'])
		await add(page, title);
	await select(page, ['First batch task', 'Second batch task']);
	await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Tag selected tasks', exact: true }).click();
	await page.locator('#todo-batch-form [name="add"]').fill('batch');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('dialog')).not.toBeVisible();
	for (const title of ['First batch task', 'Second batch task']) {
		await expect(
			page.locator('[data-todo-id]').filter({ hasText: title }).getByText('#batch', { exact: true })
		).toBeVisible();
	}
	await expect(
		page
			.locator('[data-todo-id]')
			.filter({ hasText: 'Keep this task' })
			.getByText('#batch', { exact: true })
	).toHaveCount(0);
	await select(page, ['First batch task', 'Second batch task']);
	await page.getByRole('button', { name: 'Mark selected as', exact: true }).click();
	await page.locator('#todo-batch-form [name="status"]').selectOption('doing');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('[data-todo-id].is-doing')).toHaveCount(2);
	await select(page, ['First batch task', 'Second batch task']);
	await page.getByRole('button', { name: 'Move selected tasks', exact: true }).click();
	await page.locator('#todo-batch-form [name="notebookId"]').selectOption({ label: 'Destination' });
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('dialog')).not.toBeVisible();
	await visit(page, '/notebooks');
	await page.getByRole('button', { name: /^Tasks \d/ }).click();
	await expect(page.locator('[data-todo-id]')).toHaveCount(2);
	await select(page, ['First batch task', 'Second batch task']);
	await page.getByRole('button', { name: 'Delete selected tasks', exact: true }).click();
	await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
	await expect(page.locator('[data-todo-id]')).toHaveCount(2);
	await page.getByRole('button', { name: 'Delete selected tasks', exact: true }).click();
	// armed intentionally ignores a reflex click for 450ms.
	await page.waitForTimeout(500);
	await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
	await expect(page.locator('[data-todo-id]')).toHaveCount(0);
	await visit(page, '/tasks/todo');
	await expect(page.locator('[data-todo-id]')).toHaveCount(1);
	await expect(page.getByText('Keep this task', { exact: true })).toBeVisible();
});

test('circles select without completion; filtering drops hidden selections and layout stays still', async ({
	page
}, info) => {
	test.setTimeout(120_000);
	await register(page, testEmail('batch-layout'));
	await visit(page, '/tasks/todo');
	await add(page, 'Visible task');
	await add(page, 'Hidden task');
	for (const width of [390, 2000]) {
		await page.setViewportSize({ width, height: 844 });
		for (const theme of ['light', 'dark']) {
			await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
			const row = page.locator('[data-todo-id]').first();
			const before = await row.boundingBox();
			await select(page, ['Visible task', 'Hidden task']);
			expect((await row.boundingBox())?.y).toBe(before?.y);
			await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(2);
			const circle = page.getByRole('checkbox').first().locator('span');
			await expect(circle).toHaveCSS('border-radius', '50%');
			await page.screenshot({
				path: info.outputPath(`selection-${width}-${theme}.png`),
				fullPage: true
			});
			await page.keyboard.press('Escape');
			await expect(page.getByRole('button', { name: 'Mark complete', exact: true })).toHaveCount(2);
		}
	}
	await select(page, ['Visible task', 'Hidden task']);
	await page.getByRole('searchbox', { name: 'Search these tasks' }).fill('Visible task');
	await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
	await page.getByRole('searchbox', { name: 'Search these tasks' }).fill('');
	await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(1);
	await page.getByRole('button', { name: 'Select all visible tasks', exact: true }).click();
	await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(2);
	await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
	await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0);
});

test('Space selects the row under j/k even when another row checkbox has focus', async ({
	page
}) => {
	test.setTimeout(120_000);
	await register(page, testEmail('batch-keyboard-cursor'));
	await visit(page, '/tasks/todo');
	await add(page, 'Keyboard first task');
	await add(page, 'Keyboard second task');
	await page.getByRole('button', { name: 'Select many', exact: true }).click();

	const first = page.locator('[data-todo-id]').nth(0);
	const second = page.locator('[data-todo-id]').nth(1);
	await first.getByRole('checkbox').click();
	await page.keyboard.press('j');
	await expect(second).toHaveClass(/kb-cursor/);
	await page.keyboard.press('Space');

	await expect(first.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
	await expect(second.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
});
