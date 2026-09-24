import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The shelf, and what an open folder looks like.
 *
 * A name with an em dash in it is a place: `Renovation — Kitchen` sits inside
 * `Renovation`. Open the folder and the two used to be flat siblings with the
 * child nudged a few pixels right — an indent nobody reads on a grid of
 * pictures, so opening a folder looked like the shelf simply getting longer.
 * They share a ground now.
 */
async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

test('an open folder and what is inside it sit on one ground', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-shelf'));

	await makeNotebook(page, 'Renovation');
	await makeNotebook(page, 'Renovation — Countertops');
	await makeNotebook(page, 'Reading');

	await visit(page, '/notebooks');

	// Closed, there is nothing uniting anything: the child is not even drawn.
	await expect(page.locator('.notebook-family')).toHaveCount(0);
	await expect(page.getByRole('link', { name: /Countertops/ })).toHaveCount(0);

	await page.getByRole('button', { name: /what is inside Renovation/ }).click();

	const family = page.locator('.notebook-family');
	await expect(family).toHaveCount(1);

	// The folder and its child are both on it, and nothing else is.
	await expect(family.getByRole('link', { name: /^Renovation/ })).toBeVisible();
	await expect(family.getByRole('link', { name: /Countertops/ })).toBeVisible();
	await expect(family.getByRole('link', { name: /Reading/ })).toHaveCount(0);

	// And the ground is a ground: it is wider than the covers standing on it.
	const block = (await family.boundingBox())!;
	const cover = (await family.locator('.notebook-cover').first().boundingBox())!;
	expect(block.width).toBeGreaterThan(cover.width);
	expect(block.height).toBeGreaterThan(cover.height);
});
