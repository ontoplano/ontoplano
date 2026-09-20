import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Two things that were asking for room they had not earned.
 *
 * The help dock sat open on every desktop screen — four icons in the corner of
 * whatever you were doing, help nobody had asked for. And writing markdown
 * into a note meant saving it to find out whether the list was a list.
 */
test('the help dock is one question mark until it is asked', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await register(page, testEmail('help-dock'));
	await visit(page, '/');

	const toggle = page.locator('.dock-toggle');
	const others = page.locator('.dock-more');

	// Desktop used to skip the fold entirely and draw the row always.
	await expect(toggle).toBeVisible({ timeout: 60_000 });
	await expect(others.first()).toBeHidden();

	await toggle.click();
	await expect(others.first()).toBeVisible();

	// One control both ways, not an expand with no collapse.
	await toggle.click();
	await expect(others.first()).toBeHidden();
});

test('a note shows what its markdown will look like, without saving it', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await register(page, testEmail('md-preview'));
	await visit(page, '/notebooks/diary');

	// The form is this room's one verb, drawn by the room's bar.
	await page.getByRole('button', { name: 'New entry' }).first().click();

	const box = page.locator('textarea[name="content"]');
	await expect(box).toBeVisible({ timeout: 60_000 });

	await box.fill('# A heading\n\n- one\n- two');

	// Narrow enough — a dialog is — and the preview is behind its own tab.
	const preview = page.locator('dialog .md').first();
	const previewTab = page.locator('dialog').getByRole('tab', { name: 'Preview' }).first();
	if (await previewTab.isVisible().catch(() => false)) await previewTab.click();
	await expect(preview).toBeVisible();

	// It follows the typing on its own, with nothing pressed and nothing saved.
	await expect(preview.locator('h1')).toHaveText('A heading');
	await expect(preview.locator('li')).toHaveCount(2);

	// And the box still holds exactly what was typed — the preview is a second
	// view of it, not a thing that rewrites it. Back to Write to read it.
	const writeTab = page.locator('dialog').getByRole('tab', { name: 'Write' }).first();
	if (await writeTab.isVisible().catch(() => false)) await writeTab.click();
	await expect(box).toHaveValue('# A heading\n\n- one\n- two');
});

/**
 * Sideways, at two levels.
 *
 * `J` and `K` walk the rooms. `H` and `L` walk the places inside the one you
 * are in — derived from the addresses, so a place added later answers to them
 * without anybody wiring it up.
 */
test('shift H and L walk the places inside the room you are in', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await register(page, testEmail('room-keys'));
	await visit(page, '/tasks/todo');
	await expect(page).toHaveURL(/\/tasks\/todo/, { timeout: 60_000 });
	// Off any control the page may have focused, so the guard for "somebody is
	// typing" does not swallow the key.
	await page
		.locator('h1, body')
		.first()
		.click({ position: { x: 5, y: 5 } });

	await page.keyboard.press('Shift+L');
	await expect(page).toHaveURL(/\/tasks\/(?!todo)/, { timeout: 30_000 });
	const forward = new URL(page.url()).pathname;

	await page.keyboard.press('Shift+H');
	await expect(page).toHaveURL(/\/tasks\/todo/, { timeout: 30_000 });

	// It moved somewhere inside Tasks, not out of it.
	expect(forward.startsWith('/tasks/')).toBe(true);
});

test('a screen that already uses those keys keeps them', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await register(page, testEmail('board-keys'));

	// The board binds H and L to carrying a card between columns, which is a
	// better use of them there. Walking out of the board would take the keys
	// away from the thing the board is for.
	await visit(page, '/tasks/board');
	await expect(page).toHaveURL(/\/tasks\/board/, { timeout: 60_000 });
	await page
		.locator('h1, body')
		.first()
		.click({ position: { x: 5, y: 5 } });

	await page.keyboard.press('Shift+L');
	await page.waitForTimeout(500);
	await expect(page).toHaveURL(/\/tasks\/board/);
});

test('switching to the preview moves nothing below it', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('preview-height'));
	await visit(page, '/notebooks/diary');

	await page.getByRole('button', { name: 'New entry' }).first().click();
	const box = page.locator('textarea[name="content"]');
	await expect(box).toBeVisible({ timeout: 60_000 });
	await box.fill('# A heading\n\n- one\n- two');

	// Something well below the box, whose position is what a person notices.
	const below = page.locator('dialog').getByText('Anyone this was about.').first();
	await expect(below).toBeVisible();
	const before = await below.boundingBox();

	const previewTab = page.locator('dialog').getByRole('tab', { name: 'Preview' }).first();
	if (!(await previewTab.isVisible().catch(() => false))) return;
	await previewTab.click();
	await page.waitForTimeout(300);

	const after = await below.boundingBox();
	expect(before).not.toBeNull();
	expect(after).not.toBeNull();
	// A pixel or two of rounding is fine; a jump is not.
	expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(2);
});
