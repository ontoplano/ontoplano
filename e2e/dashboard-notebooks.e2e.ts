import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The notebooks card on the dashboard.
 *
 * It is the shelf from the Notebooks room, three covers of it — the same
 * component, so a notebook is picked by looking at it in both places. What
 * "recently" means is the newest thing in the notebook rather than the
 * notebook's own row, which is what `tests/notebooks-recently-edited` holds;
 * this is about the card being there, drawing covers, and leading somewhere.
 */
/** The card among the dashboard's, by the name in its header. */
const notebooksCard = (page: import('@playwright/test').Page) =>
	page.locator('section').filter({ has: page.getByRole('heading', { name: 'Notebooks' }) });

async function makeNotebook(page: import('@playwright/test').Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

test('the dashboard shows the notebooks last written in, as covers', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('dash-notebooks'));

	// Four, so the card has to choose: it shows three.
	for (const title of ['Kitchen', 'Trip', 'Reading', 'The Republic'])
		await makeNotebook(page, title);

	await visit(page, '/');
	const card = notebooksCard(page);
	await expect(card).toBeVisible();

	const covers = card.locator('.notebook-cover');
	await expect(covers).toHaveCount(3);

	// The newest three, newest first — none of them written in yet.
	await expect(covers.nth(0)).toContainText('The Republic');
	await expect(covers.nth(2)).toContainText('Trip');
	await expect(covers.nth(0)).toContainText('nothing in it yet');

	// And a cover is the way into the notebook it draws.
	await covers.nth(0).getByRole('link').click();
	await expect(page).toHaveURL(/\/notebooks\?notebook=\d+/);
	await expect(page.getByRole('heading', { name: 'The Republic' })).toBeVisible();
});

test('with no notebooks the card says what one is for', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('dash-notebooks-empty'));

	await visit(page, '/');
	const card = notebooksCard(page);
	await expect(card).toContainText('No notebooks yet');
	await expect(card.getByRole('link', { name: 'New notebook' })).toBeVisible();
});
