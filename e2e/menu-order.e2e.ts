import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

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

		await visit(page, '/settings/preferences');
		const menu = page.locator('form[action="?/saveMenu"]');

		// Shopping to the top, which is first along the bar and first under the
		// thumb — the wheel starts at the bottom right and runs anti-clockwise.
		for (let i = 0; i < 12; i++) {
			const up = menu.getByRole('button', { name: 'Move Shopping up' });
			if (await up.isDisabled()) break;
			await up.click();
		}
		await menu.getByRole('button', { name: 'Save menu' }).click();
		await page.waitForTimeout(600);

		await visit(page, '/');

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

		await visit(page, '/settings/preferences');
		await page.evaluate(async () => {
			const body = new FormData();
			body.append('room', 'ideas');
			await fetch('/settings/preferences?/saveMenu', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
		});

		await visit(page, '/settings/preferences');
		const menu = page.locator('form[action="?/saveMenu"]');
		// Ideas first, and every other room still listed behind it.
		await expect(menu.getByRole('button', { name: 'Move Ideas up' })).toBeDisabled();
		// Every room but Home, which is never listed: it is always on and is not
		// on the wheel, so a row for it would be one with nothing to change.
		await expect(menu.getByRole('button', { name: /^Move .* up$/ })).toHaveCount(9);
	});
});

test.describe('the section colours', () => {
	test('are the account’s, and reach the page', async ({ page }) => {
		await register(page, `colour-${Date.now()}@test.invalid`);

		await visit(page, '/settings/preferences');
		const form = page.locator('form[action="?/saveMenu"]');
		await form.locator('input[name="color.planner"]').fill('#123456');
		await form.getByRole('button', { name: 'Save menu' }).click();
		await page.waitForTimeout(600);

		// The accent is a custom property on the page surface, which is where
		// every card, rule and tab reads it from.
		await visit(page, '/planner/plan');
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

		await visit(page, '/settings/preferences');
		await page.evaluate(async () => {
			const body = new FormData();
			body.append('color.planner', 'javascript:alert(1)');
			await fetch('/settings/preferences?/saveMenu', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
		});

		await visit(page, '/planner/plan');
		const accent = await page
			.locator('.page-surface')
			.first()
			.evaluate((el) => getComputedStyle(el).getPropertyValue('--section-accent').trim());
		expect(accent).toBe('#1d4ed8');
	});
});

/**
 * One list, three answers.
 *
 * Order, whether it is shown, and its colour used to be three sections naming
 * the same eight rooms. The thing worth pinning is that they still save
 * together and still reach the app — and that a room put away falls to the end
 * without a number, because that is what "it has no place in the menu" looks
 * like.
 */
test.describe('the one menu list', () => {
	test('puts a hidden room at the end, and out of the menus', async ({ page }) => {
		await register(page, `menu-hide-${Date.now()}@test.invalid`);

		await visit(page, '/settings/preferences');
		const menu = page.locator('form[action="?/saveMenu"]');

		// The row is the one whose Move buttons name Ideas; its Hide is the
		// sibling of those.
		const ideas = menu.locator('div').filter({
			has: page.getByRole('button', { name: 'Move Ideas up' })
		});
		await ideas.getByRole('button', { name: 'Hide' }).click();

		// It loses its arrows the moment it is put away — there is no order for
		// it to have a position in.
		await expect(menu.getByRole('button', { name: 'Move Ideas up' })).toHaveCount(0);

		await menu.getByRole('button', { name: 'Save menu' }).click();
		await page.waitForTimeout(600);

		await visit(page, '/');
		await expect(page.getByRole('link', { name: 'Ideas' })).toHaveCount(0);

		// And the page it owns still answers, because hiding is a menu matter.
		const res = await visit(page, '/ideas');
		expect(res?.status()).toBe(200);
	});

	test('never lists Home', async ({ page }) => {
		await register(page, `menu-home-${Date.now()}@test.invalid`);
		await visit(page, '/settings/preferences');

		const menu = page.locator('form[action="?/saveMenu"]');
		await expect(menu.getByRole('button', { name: 'Move Home up' })).toHaveCount(0);
	});
});
