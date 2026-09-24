import { expect, test } from '@playwright/test';

test('task batch actions persist on the isolated instance', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/');
	const tour = page.getByRole('dialog', { name: 'Tutorial' });
	await expect(tour).toBeVisible({ timeout: 60_000 });
	await tour.getByRole('button', { name: 'Dismiss' }).click();
	await page.goto('/tasks/todo');
	for (const title of ['Device first', 'Device second']) {
		await page.getByRole('button', { name: /^New task(?: n)?$/ }).click();
		await page.locator('#todo-form [name="heading"]').fill(title);
		await page.getByRole('button', { name: 'Create task', exact: true }).click();
		await expect(page.locator('[data-todo-id]').filter({ hasText: title })).toBeVisible();
	}
	await page.getByRole('button', { name: 'Select many', exact: true }).click();
	for (const title of ['Device first', 'Device second'])
		await page.getByRole('checkbox', { name: `Select ${title}`, exact: true }).click();
	await page.getByRole('button', { name: 'Mark selected as', exact: true }).click();
	await page.locator('#todo-batch-form [name="status"]').selectOption('doing');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('[data-todo-id].is-doing')).toHaveCount(2);
	await page.reload();
	await expect(page.locator('[data-todo-id].is-doing')).toHaveCount(2);
});
