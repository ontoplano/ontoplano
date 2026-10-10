import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A block goes back to being a task — a repeating one too, which ends its
 * repeat and so asks first. And the plan's strip of tasks has no tick: a task
 * finished there vanished to a page nobody had open.
 */
test('a repeating block goes back to the to-do list, after one confirmation', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1400, height: 950 });
	await register(page, testEmail('block-back'));
	await visit(page, '/tasks/calendar');

	await page.getByRole('button', { name: 'New task block' }).click();
	await page.getByRole('button', { name: 'Mode' }).click();
	await page.getByRole('option', { name: 'Category' }).click();
	const label = page.locator('dialog[open] [name="label"]');
	if (await label.count()) await label.fill('water the plants');
	await page
		.getByRole('dialog', { name: 'New task block' })
		.getByRole('button', { name: 'Add', exact: true })
		.click();
	const block = page.locator('.ec-event').filter({ hasText: 'water the plants' }).first();
	await expect(block).toBeVisible({ timeout: 30_000 });

	await block.click();
	await page.getByRole('button', { name: 'Back to tasks' }).click();
	const end = page.getByRole('button', { name: 'End the repeat' });
	await expect(end).toBeVisible();
	await page.waitForTimeout(500);
	await end.click();
	await expect(page.locator('.ec-event').filter({ hasText: 'water the plants' })).toHaveCount(0, {
		timeout: 30_000
	});

	await visit(page, '/tasks/todo');
	await expect(page.locator('.row-card').filter({ hasText: 'water the plants' })).toBeVisible();

	// On the plan's strip it can be placed, and not finished.
	await visit(page, '/tasks/calendar');
	await page
		.getByRole('button', { name: /^Tasks$/ })
		.last()
		.click();
	const card = page
		.locator('[role="button"][aria-pressed]')
		.filter({ hasText: 'water the plants' });
	await expect(card).toBeVisible();
	await expect(card.getByRole('button', { name: 'Mark complete' })).toHaveCount(0);
});
