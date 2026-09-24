import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A notebook's own labels, from the notebook.
 *
 * The Tags tab used to sit in the room strip and count every word in the
 * account — which is not a question anybody has while they are looking at a
 * renovation. What they want there is that subject's words and what carries
 * each of them, so it is a button on the notebook and the account's whole
 * vocabulary is one press further on.
 */
async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

test('the labels are the notebook’s, and they say what carries them', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-tags'));

	await makeNotebook(page, 'Kitchen');
	await makeNotebook(page, 'Trip');
	await visit(page, '/notebooks');

	// Tags is not a tab in the room any more.
	await expect(page.getByRole('link', { name: 'Tags', exact: true })).toHaveCount(0);

	// Two notes and a task about the kitchen, one of them labelled twice.
	await page
		.getByRole('link', { name: /Kitchen/ })
		.first()
		.click();
	for (const [content, tags] of [
		['the plumber can move the pipes', 'home'],
		['tiles are the slow bit', 'home money']
	] as const) {
		await page.getByRole('button', { name: 'New note', exact: true }).first().click();
		await page.locator('textarea[name="content"]').first().fill(content);
		// The quick form folds the labels away — see `NoteFields`' compact mode.
		const fold = page.getByRole('button', { name: /^Tags/ }).first();
		if (await fold.count()) await fold.click();
		await page.locator('input[role="combobox"]').first().fill(tags);
		await page
			.getByRole('button', { name: /Add note/ })
			.last()
			.click();
		await expect(page.getByText(content).first()).toBeVisible({ timeout: 30_000 });
	}

	await page.getByRole('button', { name: 'Manage tags' }).click();
	const panel = page.getByRole('dialog').filter({ hasText: 'The labels on what is filed here' });
	await expect(panel).toBeVisible();

	// The count is this notebook's, and it unfolds into what carries it.
	const home = panel.getByRole('button', { name: /what carries home/ });
	await expect(home).toContainText('2');
	await home.click();
	await expect(panel.getByText('2 notes')).toBeVisible();

	// And the whole vocabulary is one press further on, where a label is deleted.
	await expect(panel.getByRole('link', { name: 'All labels' })).toBeVisible();
});
