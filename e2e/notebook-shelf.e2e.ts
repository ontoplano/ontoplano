import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The shelf, and what an open folder looks like.
 *
 * A notebook carries a folder path, `Renovation/Kitchen`, and a folder is only
 * a label that groups the notebooks carrying it. Open one and its contents
 * share a ground with it — a few pixels of indent is not something anybody
 * reads on a grid of pictures.
 */
async function makeNotebook(page: Page, title: string, folder = '') {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title, folder }
	});
}

test('an open folder and what is inside it sit on one ground', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-shelf'));

	await makeNotebook(page, 'Countertops', 'Renovation');
	await makeNotebook(page, 'Tiles', 'Renovation');
	await makeNotebook(page, 'Reading');

	await visit(page, '/notebooks');

	// Closed, there is nothing uniting anything: what is inside is not drawn.
	await expect(page.locator('.notebook-family')).toHaveCount(0);
	await expect(page.getByRole('link', { name: /Countertops/ })).toHaveCount(0);

	await page.getByRole('button', { name: /what is inside Renovation/ }).click();

	const family = page.locator('.notebook-family');
	await expect(family).toHaveCount(1);

	// The folder and what is in it are on it, and nothing else is.
	await expect(family.getByRole('button', { name: /what is inside Renovation/ })).toBeVisible();
	await expect(family.getByRole('link', { name: /Countertops/ })).toBeVisible();
	await expect(family.getByRole('link', { name: /Tiles/ })).toBeVisible();
	await expect(family.getByRole('link', { name: /Reading/ })).toHaveCount(0);

	// And the ground is a ground: it is wider than the covers standing on it.
	const block = (await family.boundingBox())!;
	const cover = (await family.locator('.notebook-cover').first().boundingBox())!;
	expect(block.width).toBeGreaterThan(cover.width);
	expect(block.height).toBeGreaterThan(cover.height);
});

test('renaming a folder moves every notebook in it', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-folder-rename'));

	await makeNotebook(page, 'Countertops', 'Renovation');
	await makeNotebook(page, 'Sink', 'Renovation/Kitchen');

	await visit(page, '/notebooks');
	await page.locator('.notebook-cover').first().hover();
	await page.getByRole('button', { name: 'Rename the folder Renovation', exact: true }).click();
	await page.locator('#folder-form [name="to"]').fill('Flat');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	await expect(page.getByRole('button', { name: /what is inside Flat$/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /what is inside Renovation$/ })).toHaveCount(0);

	await page.getByRole('button', { name: /what is inside Flat$/ }).click();
	await expect(page.getByRole('link', { name: /Countertops/ })).toBeVisible();
	// The folder inside it came along.
	await expect(page.getByRole('button', { name: /what is inside Kitchen$/ })).toBeVisible();
});

test('a notebook page is one card, so its stripe starts at the top', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-stripe'));

	await makeNotebook(page, 'Renovation');
	await visit(page, '/notebooks');
	await page
		.getByRole('link', { name: /Renovation/ })
		.first()
		.click();
	await page.getByRole('link', { name: 'Open' }).first().click();
	await page.waitForURL(/\/notebooks\/\d+/);

	/*
	 * The header and the tabs were two bordered cards with a gap between them,
	 * so the accent down the side belonged to the lower one and the rule began
	 * half way down the page — under the title it was there to colour.
	 */
	const striped = page.locator('.card-accent').first();
	await expect(striped).toBeVisible();

	const card = (await striped.boundingBox())!;
	const title = (await page.getByRole('heading', { name: 'Renovation' }).boundingBox())!;
	expect(card.y).toBeLessThan(title.y);

	// And nothing inside it draws a second edge of its own.
	await expect(striped.locator('.detail-header-frame.shadow-card')).toHaveCount(0);
});

for (const width of [1280, 390]) {
	test(`a starred notebook leads the shelf and stays in its folder (${width}px)`, async ({
		page
	}) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width, height: 900 });
		await register(page, testEmail(`nb-star-${width}`));

		await makeNotebook(page, 'Countertops', 'Renovation');
		await makeNotebook(page, 'Reading');

		await visit(page, '/notebooks');
		await expect(page.locator('[data-favourites]')).toHaveCount(0);

		const star = page.getByRole('button', { name: 'Add Countertops to favourites' });
		await page.getByRole('button', { name: /what is inside Renovation/ }).click();
		await page.locator('.notebook-family .notebook-cover').last().hover();
		await star.click();

		// A row of its own above the folders…
		const favourites = page.locator('[data-favourites]');
		await expect(favourites.getByRole('link', { name: /Countertops/ })).toBeVisible();
		const row = (await favourites.boundingBox())!;
		const shelf = (await page.locator('[data-tour="notebook-shelf"]').boundingBox())!;
		expect(row.y).toBeLessThan(shelf.y);
		// …and still in its folder.
		await expect(
			page.locator('.notebook-family').getByRole('link', { name: /Countertops/ })
		).toBeVisible();
		await expect(favourites.getByRole('link', { name: /Reading/ })).toHaveCount(0);

		// Nothing on the shelf runs past the edge of a phone.
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);

		// Taken off from the notebook's own page.
		await favourites.getByRole('link', { name: /Countertops/ }).click();
		await page.getByRole('link', { name: 'Open' }).first().click();
		await page.waitForURL(/\/notebooks\/\d+/);
		const off = page.getByRole('button', { name: 'Remove Countertops from favourites' });
		await expect(off).toHaveAttribute('aria-pressed', 'true');
		await off.click();
		await expect(
			page.getByRole('button', { name: 'Add Countertops to favourites' })
		).toHaveAttribute('aria-pressed', 'false');

		await visit(page, '/notebooks');
		await expect(page.locator('[data-favourites]')).toHaveCount(0);
	});
}

test('f stars the notebook open beside the shelf, and f again takes it off', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-star-key'));

	await makeNotebook(page, 'Reading');
	await visit(page, '/notebooks');
	await page
		.getByRole('link', { name: /Reading/ })
		.first()
		.click();
	await page.waitForURL(/notebook=\d+/);

	await page.locator('body').click({ position: { x: 1, y: 1 } });
	await page.keyboard.press('f');
	await expect(page.locator('[data-favourites]')).toHaveCount(1);
	await page.keyboard.press('f');
	await expect(page.locator('[data-favourites]')).toHaveCount(0);
});
