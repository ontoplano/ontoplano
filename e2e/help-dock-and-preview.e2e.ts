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
