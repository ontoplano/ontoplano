import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';
import { changeMenu, menuList } from './helpers/menu';

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
		await register(page, testEmail('order'));

		await visit(page, '/settings/preferences');
		const menu = page.locator('form[action="?/saveMenu"]');

		// Inventory to the top, which is first along the bar and first under the
		// thumb — the wheel starts at the bottom right and runs anti-clockwise.
		await changeMenu(page, async () => {
			for (let i = 0; i < 12; i++) {
				const up = menu.getByRole('button', { name: 'Move Inventory up' });
				if (await up.isDisabled()) break;
				await up.click();
			}
		});

		await visit(page, '/');

		// The bar: Inventory now comes before Calendar, which it never did.
		const tabs = page.locator('header a[href], nav a[href]');
		const labels = (await tabs.allTextContents()).map((t) => t.trim()).filter(Boolean);
		const inventory = labels.findIndex((t) => t.includes('Inventory'));
		const planner = labels.findIndex((t) => t.includes('Calendar'));
		expect(inventory).toBeGreaterThanOrEqual(0);
		expect(inventory).toBeLessThan(planner);
	});

	test('survives a room the stored order has never heard of', async ({ page }) => {
		// The case that breaks quietly: an order saved before a room existed must
		// not hide that room. Written straight through the action, because there
		// is no way to save a stale order through the form.
		await register(page, testEmail('order-new'));

		await visit(page, '/settings/preferences');
		await page.evaluate(async () => {
			const body = new FormData();
			body.append('room', 'inventory');
			await fetch('/settings/preferences?/saveMenu', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
		});

		await visit(page, '/settings/preferences');
		const menu = page.locator('form[action="?/saveMenu"]');
		// Inventory first, and every other room still listed behind it.
		await expect(menu.getByRole('button', { name: 'Move Inventory up' })).toBeDisabled();
		// Every room but Home, which is never listed: it is always on and is not
		// on the wheel, so a row for it would be one with nothing to change.
		// Eight, since People became a tab of Notebooks, Recipes one of Health,
		// and Ideas one of Notebooks.
		await expect(menu.getByRole('button', { name: /^Move .* up$/ })).toHaveCount(8);
	});
});

test.describe('the section colours', () => {
	test('are the account’s, and reach the page', async ({ page }) => {
		await register(page, testEmail('colour'));

		await visit(page, '/settings/preferences');
		const form = page.locator('form[action="?/saveMenu"]');
		await changeMenu(page, () => form.locator('input[name="color.planner"]').fill('#123456'));

		// The accent is a custom property on the page surface, which is where
		// every card, rule and tab reads it from.
		await visit(page, '/calendar/calendar');
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
		await register(page, testEmail('colour-bad'));

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

		await visit(page, '/calendar/calendar');
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
 * together and still reach the app — and that a room put away loses its
 * number but keeps its row, because a row that leaves from under the thumb
 * hands the next press to whichever room slid into its place.
 */
test.describe('the one menu list', () => {
	test('puts a hidden room out of the menus', async ({ page }) => {
		await register(page, testEmail('menu-hide'));

		await visit(page, '/settings/preferences');
		const menu = page.locator('form[action="?/saveMenu"]');

		// Ticked means the room is there — see `ToggleRow`, the same control a
		// notebook's "what it holds" list uses.
		await changeMenu(page, async () => {
			await menu.getByRole('checkbox', { name: 'Inventory' }).uncheck();
			// It loses its arrows the moment it is put away — there is no order
			// for it to have a position in.
			await expect(menu.getByRole('button', { name: 'Move Inventory up' })).toHaveCount(0);
		});

		await visit(page, '/');
		await expect(page.getByRole('link', { name: 'Ideas' })).toHaveCount(0);

		// And the page it owns still answers, because hiding is a menu matter.
		const res = await visit(page, '/notebooks/ideas');
		expect(res?.status()).toBe(200);
	});

	test('never lists Home', async ({ page }) => {
		await register(page, testEmail('menu-home'));
		await visit(page, '/settings/preferences');

		const menu = page.locator('form[action="?/saveMenu"]');
		await expect(menu.getByRole('button', { name: 'Move Home up' })).toHaveCount(0);
	});
});

/**
 * Changing the menu on a phone.
 *
 * Reported as "things move when I tick them" and "I cannot turn a room back
 * on". The first was the row dropping to the end of the list; the second was
 * the room's tabs being saved as put away with it, so the room came back
 * empty and every tab had to be found and ticked as well.
 */
test.describe('the menu list on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('a room put away and brought back keeps its row and its tabs', async ({ page }) => {
		await register(page, testEmail('menu-phone'));
		await visit(page, '/settings/preferences');
		const menu = menuList(page);

		const health = menu.getByRole('checkbox', { name: 'Health', exact: true });
		const recipes = menu.getByRole('checkbox', { name: 'Recipes', exact: true });
		await health.scrollIntoViewIfNeeded();
		const before = (await health.boundingBox())!;
		const recipesLabel = menu.getByText('Recipes', { exact: true });
		const tabBefore = (await recipesLabel.boundingBox())!;

		await changeMenu(page, () => health.uncheck());

		// Nothing under the thumb moved: the room, or the tab below it.
		const after = (await health.boundingBox())!;
		expect(after.y).toBe(before.y);
		expect(after.x).toBe(before.x);
		const tabAfter = (await recipesLabel.boundingBox())!;
		expect(tabAfter.y).toBe(tabBefore.y);
		expect(tabAfter.x).toBe(tabBefore.x);

		// Saved away, still where it was.
		await visit(page, '/settings/preferences');
		await expect(health).not.toBeChecked();
		await health.scrollIntoViewIfNeeded();

		// And it comes back whole, without its tabs having to be found one by one.
		await changeMenu(page, () => health.check());
		await expect(recipes).toBeChecked();
		await visit(page, '/settings/preferences');
		await expect(health).toBeChecked();
		await expect(recipes).toBeChecked();
		await expect(menu.getByRole('checkbox', { name: 'Workouts', exact: true })).toBeChecked();
	});

	test('a room that was saved with every tab away comes back with them', async ({ page }) => {
		// How accounts were left by the old form, which posted every tab of a
		// room put away as put away itself. Written through the action, since
		// the form no longer does it.
		await register(page, testEmail('menu-empty'));
		await visit(page, '/settings/preferences');
		await page.evaluate(async () => {
			const body = new FormData();
			for (const id of ['health', 'recipes', 'habits', 'workouts']) body.append('hidden', id);
			await fetch('/settings/preferences?/saveMenu', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
		});

		await visit(page, '/settings/preferences');
		const menu = menuList(page);
		await changeMenu(page, () =>
			menu.getByRole('checkbox', { name: 'Health', exact: true }).check()
		);
		await visit(page, '/settings/preferences');
		for (const tab of ['Recipes', 'Habits', 'Workouts']) {
			await expect(menu.getByRole('checkbox', { name: tab, exact: true })).toBeChecked();
		}
	});

	test('a tab starts under its room’s name, and the arrows share a column', async ({ page }) => {
		await register(page, testEmail('menu-align'));
		await visit(page, '/settings/preferences');
		const menu = menuList(page);

		const roomLabel = menu.getByText('Health', { exact: true });
		const tabBox = menu.getByRole('checkbox', { name: 'Recipes', exact: true });
		expect((await tabBox.boundingBox())!.x).toBe((await roomLabel.boundingBox())!.x);

		// A room that is always on and one that can be put away end alike.
		const xs = await Promise.all(
			['Calendar', 'Notebooks', 'Health', 'Finance'].map(
				async (room) =>
					(await menu.getByRole('button', { name: `Move ${room} down` }).boundingBox())!.x
			)
		);
		expect(new Set(xs).size).toBe(1);

		// And no name is cut short at this width.
		for (const room of ['Calendar', 'Notebooks', 'Inventory']) {
			const clipped = await menu
				.getByText(room, { exact: true })
				.evaluate((el) => el.scrollWidth > el.clientWidth);
			expect(clipped, room).toBe(false);
		}
	});
});
