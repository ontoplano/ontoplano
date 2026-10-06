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

test('a notebook page is one card, starting above its title', async ({ page }) => {
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
	 * The header and the tabs were two bordered cards with a gap between them.
	 * They are one surface now, starting above the title — and it wears no
	 * section stripe: the room's tab strip already says which room this is.
	 */
	const surface = page.locator('section.shadow-card').filter({ hasText: 'Renovation' }).first();
	await expect(surface).toBeVisible();
	await expect(page.locator('main .card-accent')).toHaveCount(0);

	const card = (await surface.boundingBox())!;
	const title = (await page.getByRole('heading', { name: 'Renovation' }).boundingBox())!;
	expect(card.y).toBeLessThan(title.y);

	// And nothing inside it draws a second edge of its own.
	await expect(surface.locator('.detail-header-frame.shadow-card')).toHaveCount(0);
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
		// Beside the shelf on a desktop, then to its page; a phone's cover goes
		// straight to the page, since the panel would open far below the shelf.
		await favourites.getByRole('link', { name: /Countertops/ }).click();
		if (width > 1024) await page.getByRole('link', { name: 'Open' }).first().click();
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

/*
 * A cover's buttons are for whoever is pointing at it: hidden until hover,
 * the star included — the name says it is a favourite.
 */
test('a cover keeps its buttons until it is hovered, starred or not', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-cover-hover'));

	await makeNotebook(page, 'Reading');
	await visit(page, '/notebooks');
	const cover = page.locator('.notebook-shelf .notebook-cover').filter({ hasText: 'Reading' });
	const tools = cover.locator('.cover-actions');

	await cover.hover();
	await cover.getByRole('button', { name: 'Add Reading to favourites' }).click();
	await page.mouse.move(1, 1);
	await page.locator('body').click({ position: { x: 1, y: 1 } });
	await expect(tools.first()).toHaveCSS('opacity', '0');
	await expect(cover.locator('.cover-star').first()).toBeVisible();

	await cover.first().hover();
	await expect(tools.first()).toHaveCSS('opacity', '1');
	// Where a pointer can hover, the cover is what opens it.
	await expect(page.getByRole('link', { name: 'Open Reading' })).toHaveCount(0);
});

test.describe('on a touch screen', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

	test('the first tap shows the buttons and Open is one of them', async ({ page, browserName }) => {
		test.skip(browserName === 'firefox', 'Firefox has no mobile emulation');
		test.setTimeout(180_000);
		await register(page, testEmail('nb-cover-tap'));

		await makeNotebook(page, 'Reading');
		await visit(page, '/notebooks');
		const cover = page.locator('.notebook-shelf .notebook-cover').filter({ hasText: 'Reading' });
		const tools = cover.locator('.cover-actions');
		await expect(tools).toHaveCSS('opacity', '0');

		const at = page.url();
		await cover.locator('.cover-art').tap();
		await expect(tools).toHaveCSS('opacity', '1');
		expect(page.url()).toBe(at);

		// They fill the picture, and leave the name under it to be read.
		const art = (await cover.locator('.cover-art').boundingBox())!;
		const box = (await tools.boundingBox())!;
		const named = (await cover.locator('.cover-name').boundingBox())!;
		expect(Math.abs(box.width - art.width)).toBeLessThan(2);
		expect(Math.abs(box.height - art.height)).toBeLessThan(2);
		expect(box.y + box.height).toBeLessThanOrEqual(named.y + 1);
		await page.screenshot({ path: 'test-results/shots/cover-tapped-phone.png' });

		await cover.getByRole('link', { name: 'Open Reading' }).tap();
		await expect(page.getByRole('heading', { name: 'Reading' })).toBeVisible();
		expect(page.url()).not.toBe(at);
	});

	test('a tap on the name opens it straight away', async ({ page, browserName }) => {
		test.skip(browserName === 'firefox', 'Firefox has no mobile emulation');
		test.setTimeout(180_000);
		await register(page, testEmail('nb-cover-name-tap'));

		await makeNotebook(page, 'Reading');
		await visit(page, '/notebooks');
		const cover = page.locator('.notebook-shelf .notebook-cover').filter({ hasText: 'Reading' });
		const at = page.url();
		await cover.locator('.cover-name').tap();
		await expect(page.getByRole('heading', { name: 'Reading' })).toBeVisible();
		expect(page.url()).not.toBe(at);
	});
});
