import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A notebook's note composer: opened fresh, closed by a Cancel that looks like
 * one, and saved from the top as well as from under the text.
 */
async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

const composer = (page: Page) => page.locator('form[action="?/addEntry"]');

for (const where of ['/notebooks', 'the notebook’s own page'] as const) {
	test(`a new note starts empty, on ${where}`, async ({ page }) => {
		test.setTimeout(120_000);
		await register(page, testEmail('nb-composer'));
		await makeNotebook(page, 'Garden');
		await visit(page, '/notebooks');
		if (where !== '/notebooks') {
			await page.getByRole('link', { name: 'Open', exact: true }).first().click();
			await page.waitForURL(/\/notebooks\/\d+/);
		}

		await page.getByRole('button', { name: /^New note( n)?$/ }).click();
		await composer(page).locator('[name="heading"]').fill('Beds');
		await composer(page).locator('textarea[name="content"]').fill('tomatoes by the wall');
		await page.getByRole('button', { name: 'Add note' }).click();
		await expect(page.getByText('Beds').first()).toBeVisible();
		await expect(composer(page)).toHaveCount(0);

		// The next one is a new note, not the last one again.
		await page.getByRole('button', { name: /^New note( n)?$/ }).click();
		await expect(composer(page).locator('textarea[name="content"]')).toHaveValue('');

		// Cancel is a close, not another New with a plus beside it.
		const cancel = page.getByRole('button', { name: 'Cancel', exact: true }).first();
		await expect(cancel.locator('svg path')).toHaveAttribute('d', 'M6 6l12 12M18 6L6 18');

		// Typed and abandoned is gone too.
		await composer(page).locator('textarea[name="content"]').fill('half a thought');
		await cancel.click();
		await page.getByRole('button', { name: /^New note( n)?$/ }).click();
		await expect(composer(page).locator('textarea[name="content"]')).toHaveValue('');

		// Saved from beside the Cancel, without scrolling past a long body.
		await composer(page).locator('[name="heading"]').fill('Long');
		await composer(page)
			.locator('textarea[name="content"]')
			.fill(Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n'));
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(composer(page)).toHaveCount(0);
		await expect(page.getByText('Long', { exact: true }).first()).toBeVisible();
	});
}
