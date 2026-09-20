import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

/**
 * The preview belongs to the box, not to one screen.
 *
 * It shipped in the modal only, so writing a note in the notebook itself —
 * which is where most of them are written — had a bare textarea.
 */
test('the notebook composer previews its markdown too', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await register(page, testEmail('nb-preview'));
	await visit(page, '/');
	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');
	await expect(page.getByText('The kitchen').first()).toBeVisible({ timeout: 30_000 });

	await page.getByRole('button', { name: 'New note', exact: true }).click();
	const box = page.locator('textarea[name="content"]').first();
	await expect(box).toBeVisible({ timeout: 30_000 });
	await box.fill('# A heading\n\n- one\n- two');

	// Wide enough here that both panes are on screen at once.
	const preview = page.locator('.md').first();
	await expect(preview.locator('h1')).toHaveText('A heading', { timeout: 30_000 });
	await expect(preview.locator('li')).toHaveCount(2);
});
