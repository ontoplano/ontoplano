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
 * The checklist offer, where the checklist is being written.
 *
 * It used to be an icon on the finished note's row — found afterwards, by
 * somebody who went looking. The moment it is wanted is while the boxes are
 * being typed.
 */
test('the offer appears as a checkbox is typed, and makes the tasks', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('checklist-composer'));
	await visit(page, '/');
	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');
	await expect(page.getByText('The kitchen').first()).toBeVisible({ timeout: 30_000 });

	await page.getByRole('button', { name: 'New note', exact: true }).click();
	const box = page.locator('textarea[name="content"]').first();
	await expect(box).toBeVisible({ timeout: 30_000 });

	// Nothing offered for an ordinary note.
	const offer = page.getByRole('button', { name: /Add with \d+ task/ });
	await box.fill('Just a note about the kitchen');
	await expect(offer).toHaveCount(0);

	// The instant a checkbox exists, it is offered — and it counts them.
	await box.fill('- [ ] ring the plumber\n- [ ] book the MOT');
	await expect(offer).toBeVisible();
	await expect(offer).toHaveText(/2 tasks/);

	await offer.click();

	// The note is added and its boxes are tasks, without a second trip.
	await expect(page.getByText('ring the plumber').first()).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: /^Tasks \d/ }).click();
	await expect(page.getByText('ring the plumber').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText('book the MOT').first()).toBeVisible();
});
