import { expect, test } from '@playwright/test';
import { LOCATION_PANEL_WIDTH } from '../src/lib/services/settings';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The house down the left is as wide as the reader needs it.
 *
 * A location's name is whatever somebody typed, and a fixed column turns half
 * of them into "asf 1213 21321 a…" with no way to read the rest. Two answers,
 * both here: the name is its own tooltip, and the divider between the panel
 * and the list is a handle that takes width off the list.
 */
const LONG = 'asf 1213 21321 and a much longer one still';

async function addLocation(page: import('@playwright/test').Page, name: string, inside?: string) {
	await page.getByRole('button', { name: 'New location' }).click();
	const d = page.getByRole('dialog', { name: 'New location' });
	await d.locator('[name="heading"]').fill(name);
	if (inside) await d.locator('[name="parentId"]').selectOption({ label: inside });
	await d.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
}

test.describe('where things live', () => {
	test.use({ viewport: { width: 1400, height: 820 } });

	test('a name too long for the column is readable, and the column can grow', async ({ page }) => {
		test.setTimeout(120_000);
		await register(page, `locpanel-${Date.now()}@test.invalid`);
		await visit(page, '/inventory');
		await addLocation(page, 'adsfasd sdaf');
		await addLocation(page, LONG, 'adsfasd sdaf');

		// Truncated on screen, whole in the tooltip.
		const name = page.locator(`span[title="${LONG}"]`);
		await expect(name).toHaveText(LONG);

		const handle = page.getByRole('separator', { name: /locations panel/ });
		const before = (await handle.boundingBox())!;

		await page.mouse.move(before.x + 1, before.y + 100);
		await page.mouse.down();
		await page.mouse.move(before.x + 160, before.y + 100, { steps: 12 });
		await page.mouse.up();

		const after = (await handle.boundingBox())!;
		expect(after.x).toBeGreaterThan(before.x + 100);

		// And it is still there on the next visit: a width you have to set every
		// time is not a setting.
		await page.reload();
		await expect(page.getByRole('separator', { name: /locations panel/ })).toBeVisible();
		const remembered = (await page
			.getByRole('separator', { name: /locations panel/ })
			.boundingBox())!;
		expect(Math.abs(remembered.x - after.x)).toBeLessThan(4);
	});

	test('the handle refuses to squeeze the list out of existence', async ({ page }) => {
		test.setTimeout(120_000);
		await register(page, `locpanel-max-${Date.now()}@test.invalid`);
		await visit(page, '/inventory');

		const handle = page.getByRole('separator', { name: /locations panel/ });
		const start = (await handle.boundingBox())!;
		await page.mouse.move(start.x + 1, start.y + 100);
		await page.mouse.down();
		await page.mouse.move(start.x + 1200, start.y + 100, { steps: 8 });
		await page.mouse.up();

		const panel = (await page
			.locator('section:has-text("Where things live")')
			.first()
			.boundingBox())!;
		const rem = 16;
		expect(panel.width).toBeLessThanOrEqual(LOCATION_PANEL_WIDTH.max * rem + 2);
	});
});

/**
 * On a phone the panel sits above the list, where there is no width to take
 * from anything — and a two-pixel drag target under a finger is a scroll that
 * does not happen.
 */
test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 780 } });

	test('there is no divider to drag', async ({ page }) => {
		test.setTimeout(120_000);
		await register(page, `locpanel-phone-${Date.now()}@test.invalid`);
		await visit(page, '/inventory');
		await expect(page.getByRole('separator', { name: /locations panel/ })).toBeHidden();
	});
});
