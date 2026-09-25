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

/** Which notebook that is, as the address names it. */
async function notebookId(page: Page, title: string): Promise<string> {
	await visit(page, '/notebooks');
	await page
		.getByRole('link', { name: new RegExp(title) })
		.first()
		.click();
	await page.waitForURL(/\?notebook=\d+/);
	return new URL(page.url()).searchParams.get('notebook')!;
}

/**
 * A note in that notebook, labelled.
 *
 * Posted rather than typed: the quick form folds its labels away, and this
 * test is about the panel that reads them back rather than the form that
 * writes one.
 */
async function writeNote(page: Page, into: string, content: string, tags: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks/diary?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { content, tags, notebookId: into }
	});
}

test('the labels are the notebook’s, and they say what carries them', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-tags'));

	await makeNotebook(page, 'Kitchen');
	await makeNotebook(page, 'Trip');
	await visit(page, '/notebooks');

	// The account-wide vocabulary remains in the room strip. This panel below
	// is the narrower view of only the notebook currently open.
	await expect(page.getByRole('link', { name: 'Tags', exact: true })).toBeVisible();

	// Two notes about the kitchen, one of them labelled twice.
	const kitchen = await notebookId(page, 'Kitchen');
	await writeNote(page, kitchen, 'the plumber can move the pipes', 'home');
	await writeNote(page, kitchen, 'tiles are the slow bit', 'home money');

	await visit(page, '/notebooks');
	await page
		.getByRole('link', { name: /Kitchen/ })
		.first()
		.click();
	await expect(page.getByText('the plumber can move the pipes').first()).toBeVisible({
		timeout: 30_000
	});

	await page.getByRole('button', { name: 'Manage tags' }).click();
	const panel = page.getByRole('dialog').filter({
		hasText: 'The tags on what is filed here, and what carries each of them.'
	});
	await expect(panel).toBeVisible();

	// The count is this notebook's, and it unfolds into what carries it.
	const home = panel.getByRole('button', { name: /what carries home/ });
	await expect(home).toContainText('2 things carry it');
	await home.click();
	await expect(panel.getByText('2 notes')).toBeVisible();

	// And the whole vocabulary is one press further on, where a label is deleted.
	await expect(panel.getByRole('link', { name: 'All tags' })).toBeVisible();
});
