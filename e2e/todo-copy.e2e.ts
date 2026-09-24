import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

test('copying selected task text does not complete it', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('todo-copy'));
	await visit(page, '/tasks/todo');
	await page.getByRole('button', { name: /^New task(?: n)?$/ }).click();
	const title = 'Select this task text to copy';
	await page.locator('#todo-form [name="heading"]').fill(title);
	await page.getByRole('button', { name: 'Create task', exact: true }).click();
	const text = page.getByText(title, { exact: true });
	await expect(text).toBeVisible();
	await text.evaluate((element) => {
		const selection = window.getSelection();
		selection?.selectAllChildren(element);
	});
	await page.keyboard.press('Control+c');
	await expect(page.getByRole('button', { name: 'Mark complete', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mark incomplete', exact: true })).toHaveCount(0);
});
