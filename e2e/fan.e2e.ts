import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The five small things, fanned above the thumb.
 *
 * Account, the tour of this screen, telling the operator something is wrong,
 * the documentation and supporting the thing. They were a square `?` docked in
 * the corner of every phone screen; they are one press on the bar's last
 * button now, chosen the way the wheel is — drag onto one and let go, or lift
 * and tap.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** The middle of the button that opens the fan. */
async function handle(page: import('@playwright/test').Page) {
	const button = page.getByRole('button', { name: 'Account and help' });
	const box = (await button.boundingBox())!;
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('the press that opens it chooses nothing, and the petals are above the hand', async ({
	page
}) => {
	await register(page, testEmail('fan-tap'));
	await visit(page, '/');

	const at = await handle(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.up();

	const petals = page.getByRole('menuitem');
	await expect(petals).toHaveCount(5);
	// Still where it was: a tap opens the menu and does nothing else, which is
	// the whole reason it flies up clear of the finger.
	expect(new URL(page.url()).pathname).toBe('/');

	const width = page.viewportSize()!.width;
	for (const petal of await petals.all()) {
		const box = (await petal.boundingBox())!;
		expect(box.x, await petal.getAttribute('aria-label')).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(width);
		// Above the press that opened it, so nothing sits under the thumb.
		expect(box.y + box.height).toBeLessThan(at.y);
	}
});

test('dragging onto one and letting go goes there', async ({ page }) => {
	await register(page, testEmail('fan-drag'));
	await visit(page, '/');

	const at = await handle(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();

	const account = page.getByRole('menuitem', { name: 'Account' });
	await expect(account).toBeVisible();
	// After the flight: a box read mid-bloom is where the petal was passing
	// through, not where it lands.
	await page.waitForTimeout(400);
	const box = (await account.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
	await page.mouse.up();

	await page.waitForURL('**/settings/account');
});

test('escape closes it and nothing is chosen', async ({ page }) => {
	await register(page, testEmail('fan-esc'));
	await visit(page, '/');

	const at = await handle(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.up();
	await expect(page.getByRole('menuitem').first()).toBeVisible();

	await page.keyboard.press('Escape');
	// It flies back down into the button before it stops existing.
	await expect(page.getByRole('menuitem')).toHaveCount(0);
	expect(new URL(page.url()).pathname).toBe('/');
});

test('the operator hears about a problem from the fan', async ({ page }) => {
	await register(page, testEmail('fan-report'));
	await visit(page, '/');

	const at = await handle(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.up();

	await page.getByRole('menuitem', { name: 'Tell the operator' }).click();
	await expect(page.getByRole('dialog', { name: 'Tell the operator' })).toBeVisible();
});
