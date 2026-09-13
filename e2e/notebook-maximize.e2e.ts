import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The width the page actually has, which is not always the window's.
 *
 * `html` reserves a scrollbar gutter so a route with a scrollbar and one
 * without do not shift the page sideways between them. Where the browser
 * draws classic scrollbars — a headless Linux Chromium does, a phone does not
 * — that gutter comes off the initial containing block, so an overlay pinned
 * to `inset: 0` is fifteen pixels narrower than the window, and narrower than
 * `clientWidth` too, which counts the gutter as page. Measured rather than
 * derived: a `fixed; inset: 0` probe is the thing being asserted about.
 */
async function layoutWidth(page: import('@playwright/test').Page): Promise<number> {
	return page.evaluate(() => {
		const probe = document.createElement('div');
		probe.style.cssText = 'position:fixed;inset:0;pointer-events:none;visibility:hidden';
		document.body.append(probe);
		const width = probe.getBoundingClientRect().width;
		probe.remove();
		return width;
	});
}

/**
 * A notebook, maximized.
 *
 * Reading or writing anything longer than a note wants the whole screen and a
 * type-size control. What earns the word "nicely": the same DOM is promoted
 * to the top layer and back, so a half-written note, the open tab and the
 * page's layout are exactly where they were when you leave — and the chosen
 * size is the device's to keep.
 */

async function makeNotebook(page: import('@playwright/test').Page, title: string) {
	await visit(page, '/notebooks');
	// `.first()`: an account with no notebooks yet offers the button twice —
	// the header and the empty state.
	await page.getByRole('button', { name: 'New notebook' }).first().click();
	// `OneLine` draws the title as a one-row textarea, not an `<input>`.
	await page.fill('dialog[open] [name=heading]', title);
	await page.getByRole('button', { name: 'Create notebook' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	// Picking it fills the detail column beside the list.
	await page.getByRole('link', { name: new RegExp(title) }).click();
	await expect(page.getByPlaceholder(`Write a note about ${title}`)).toBeVisible();
}

test('maximizing takes the screen and puts everything back', async ({ page }) => {
	await register(page, `nb-max-${Date.now()}@test.invalid`);
	await makeNotebook(page, 'Kitchen renovation');

	const composer = page.getByPlaceholder('Write a note about Kitchen renovation');
	await composer.fill('half a thought, not yet saved');
	const before = await composer.boundingBox();

	await page.getByRole('button', { name: 'Maximize' }).click();
	const surface = page.locator('dialog.nb-surface[open]');
	await expect(surface).toBeVisible();

	// The whole screen, not a floating card.
	const box = await surface.boundingBox();
	expect(box!.width).toBe(await layoutWidth(page));
	expect(box!.height).toBe(page.viewportSize()!.height);

	// The draft crossed over untouched: same DOM, not a re-render.
	await expect(composer).toHaveValue('half a thought, not yet saved');

	// Leaving puts everything back exactly where it was.
	await surface.getByRole('button', { name: 'Close' }).click();
	await expect(page.locator('dialog.nb-surface[open]')).toHaveCount(0);
	await expect(composer).toHaveValue('half a thought, not yet saved');
	const after = await composer.boundingBox();
	expect(after!.y).toBe(before!.y);
	expect(after!.x).toBe(before!.x);
});

test('the type control scales in steps, and the device remembers the choice', async ({ page }) => {
	await register(page, `nb-type-${Date.now()}@test.invalid`);
	await makeNotebook(page, 'Reading list');

	const composer = page.getByPlaceholder('Write a note about Reading list');
	const sizeOf = () => composer.evaluate((el) => getComputedStyle(el).fontSize);

	// Inline, the app's own scale; maximized, the chosen step — one up from
	// the app's `text-sm` by default, because a full screen is for reading.
	expect(await sizeOf()).toBe('14px');
	await page.getByRole('button', { name: 'Maximize' }).click();
	const surface = page.locator('dialog.nb-surface[open]');
	await expect(surface).toBeVisible();
	expect(await sizeOf()).toBe('16px');

	// Steps, not a slider — and the ends disable rather than disappear.
	const bigger = surface.getByRole('button', { name: 'Bigger type' });
	const smaller = surface.getByRole('button', { name: 'Smaller type' });
	await bigger.click();
	expect(await sizeOf()).toBe('18px');
	await bigger.click();
	await bigger.click();
	expect(await sizeOf()).toBe('24px');
	await expect(bigger).toBeDisabled();
	await expect(smaller).toBeEnabled();

	// Leaving maximized returns the app's own size on the page…
	await surface.getByRole('button', { name: 'Close' }).click();
	expect(await sizeOf()).toBe('14px');

	// …and the choice survives a fresh load of the app.
	await visit(page, '/notebooks');
	await page.getByRole('link', { name: /Reading list/ }).click();
	await expect(composer).toBeVisible();
	await page.getByRole('button', { name: 'Maximize' }).click();
	await expect(page.locator('dialog.nb-surface[open]')).toBeVisible();
	expect(await sizeOf()).toBe('24px');
});
