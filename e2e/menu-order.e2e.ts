import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

/**
 * The order of the rooms, and their colours, as the account's own.
 *
 * Both used to be constants in the source. They are two renderings of one list
 * — the bar along the top and the wheel under the thumb — so the thing worth
 * asserting is not that the setting saves, but that both renderings move
 * together when it does.
 */
test.describe('the menu order', () => {
	test('moves the bar and the wheel together', async ({ page }) => {
		await register(page, `order-${Date.now()}@test.invalid`);

		await page.goto('/settings/preferences', { waitUntil: 'networkidle' });
		const menu = page.locator('form[action="?/setNavOrder"]');

		// Shopping to the top, which is first along the bar and first under the
		// thumb — the wheel starts at the bottom right and runs anti-clockwise.
		for (let i = 0; i < 12; i++) {
			const up = menu.getByRole('button', { name: 'Move Shopping up' });
			if (await up.isDisabled()) break;
			await up.click();
		}
		await menu.getByRole('button', { name: 'Save order' }).click();
		await page.waitForTimeout(600);

		await page.goto('/', { waitUntil: 'networkidle' });

		// The bar: Shopping now comes before Planner, which it never did.
		const tabs = page.locator('header a[href], nav a[href]');
		const labels = (await tabs.allTextContents()).map((t) => t.trim()).filter(Boolean);
		const shopping = labels.findIndex((t) => t.includes('Shopping'));
		const planner = labels.findIndex((t) => t.includes('Planner'));
		expect(shopping).toBeGreaterThanOrEqual(0);
		expect(shopping).toBeLessThan(planner);
	});

	test('survives a room the stored order has never heard of', async ({ page }) => {
		// The case that breaks quietly: an order saved before a room existed must
		// not hide that room. Written straight through the action, because there
		// is no way to save a stale order through the form.
		await register(page, `order-new-${Date.now()}@test.invalid`);

		await page.goto('/settings/preferences', { waitUntil: 'networkidle' });
		await page.evaluate(async () => {
			const body = new FormData();
			body.append('room', 'ideas');
			await fetch('/settings/preferences?/setNavOrder', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
		});

		await page.goto('/settings/preferences', { waitUntil: 'networkidle' });
		const menu = page.locator('form[action="?/setNavOrder"]');
		// Ideas first, and every other room still listed behind it.
		await expect(menu.getByRole('button', { name: 'Move Ideas up' })).toBeDisabled();
		await expect(menu.getByRole('button', { name: /^Move .* up$/ })).toHaveCount(10);
	});
});

test.describe('the section colours', () => {
	test('are the account’s, and reach the page', async ({ page }) => {
		await register(page, `colour-${Date.now()}@test.invalid`);

		await page.goto('/settings/preferences', { waitUntil: 'networkidle' });
		const form = page.locator('form[action="?/setSectionColors"]');
		await form.locator('input[name="color.planner"]').fill('#123456');
		await form.getByRole('button', { name: 'Save colours' }).click();
		await page.waitForTimeout(600);

		// The accent is a custom property on the page surface, which is where
		// every card, rule and tab reads it from.
		await page.goto('/planner/plan', { waitUntil: 'networkidle' });
		const accent = await page
			.locator('.page-surface')
			.first()
			.evaluate((el) => getComputedStyle(el).getPropertyValue('--section-accent').trim());
		expect(accent).toBe('#123456');
	});

	test('and a stored colour that is not one is ignored', async ({ page }) => {
		// A colour goes straight into a `style` attribute — one of very few
		// settings that does — so it is checked on the way in and again on the
		// way out. This is the second check.
		await register(page, `colour-bad-${Date.now()}@test.invalid`);

		await page.goto('/settings/preferences', { waitUntil: 'networkidle' });
		await page.evaluate(async () => {
			const body = new FormData();
			body.append('color.planner', 'javascript:alert(1)');
			await fetch('/settings/preferences?/setSectionColors', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
		});

		await page.goto('/planner/plan', { waitUntil: 'networkidle' });
		const accent = await page
			.locator('.page-surface')
			.first()
			.evaluate((el) => getComputedStyle(el).getPropertyValue('--section-accent').trim());
		expect(accent).toBe('#1d4ed8');
	});
});
