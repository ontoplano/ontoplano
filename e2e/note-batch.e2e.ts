import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Notes have the task list's "Select many": chosen by their round boxes, then
 * labelled, put away, brought back, moved and deleted in one press each — and
 * a single note's editor can move it to another notebook or to the diary.
 */
const action = (page: Page) => ({
	headers: { Origin: new URL(page.url()).origin, 'x-sveltekit-action': 'true' }
});

async function makeNotebook(page: Page, title: string): Promise<number> {
	await page.request.post('/notebooks?/create', { ...action(page), form: { heading: title } });
	await visit(page, '/notebooks');
	const href = await page
		.getByRole('link', { name: new RegExp(title) })
		.first()
		.getAttribute('href');
	await visit(page, href!);
	await expect(page.getByRole('button', { name: /^Notes/ })).toBeVisible();
	return Number(new URL(page.url()).searchParams.get('notebook'));
}

async function writeNote(page: Page, notebookId: number, title: string) {
	const res = await page.request.post('/notebooks?/addEntry', {
		...action(page),
		form: { notebookId: String(notebookId), heading: title, content: `about ${title}`, tags: 'old' }
	});
	expect(await res.text()).toContain('success');
}

const row = (page: Page, title: string) =>
	page.locator('article').filter({ has: page.getByText(title, { exact: true }) });

async function select(page: Page, titles: string[]) {
	await page.getByRole('button', { name: 'Select many', exact: true }).click();
	for (const title of titles)
		await page.getByRole('checkbox', { name: `Select ${title}`, exact: true }).click();
	await expect(page.getByText(`${titles.length} selected`, { exact: true })).toBeVisible();
}

async function pickNotebook(page: Page, scope: string, name: string) {
	await page.locator(scope).getByRole('button', { name: 'Notebook', exact: true }).click();
	await page.getByRole('option', { name, exact: true }).click();
}

test('several notes are labelled, put away, brought back, moved and deleted at once', async ({
	page
}) => {
	test.setTimeout(150_000);
	await register(page, testEmail('note-batch'));
	const target = await makeNotebook(page, 'Target');
	const source = await makeNotebook(page, 'Source');
	for (const title of ['First note', 'Second note', 'Keep this note'])
		await writeNote(page, source, title);
	await visit(page, page.url());
	await expect(row(page, 'Keep this note')).toBeVisible();

	await select(page, ['First note', 'Second note']);
	await page.getByRole('button', { name: 'Tag selected notes', exact: true }).click();
	await page.locator('#note-batch-form [name="add"]').fill('batch');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Tag selected notes' })).not.toBeVisible();
	for (const title of ['First note', 'Second note'])
		await expect(row(page, title).getByText('#batch', { exact: true })).toBeVisible();
	await expect(row(page, 'Keep this note').getByText('#batch', { exact: true })).toHaveCount(0);

	await select(page, ['First note', 'Second note']);
	await page.getByRole('button', { name: 'Archive selected notes', exact: true }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(row(page, 'First note')).toHaveCount(0);
	await expect(row(page, 'Keep this note')).toBeVisible();

	await page.getByRole('button', { name: 'Archived (2)', exact: true }).click();
	await select(page, ['First note', 'Second note']);
	await page.getByRole('button', { name: 'Unarchive selected notes', exact: true }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Archived (0)', exact: true })).toBeVisible();

	await select(page, ['First note']);
	await page.getByRole('button', { name: 'Move selected notes', exact: true }).click();
	await pickNotebook(page, '#note-batch-form', 'Target');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(row(page, 'First note')).toHaveCount(0);

	await select(page, ['Keep this note']);
	await page.getByRole('button', { name: 'Delete selected notes', exact: true }).click();
	await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
	await expect(row(page, 'Keep this note')).toBeVisible();
	await page.getByRole('button', { name: 'Delete selected notes', exact: true }).click();
	// `armed` ignores a reflex click for 450ms.
	await page.waitForTimeout(500);
	await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
	await expect(row(page, 'Keep this note')).toHaveCount(0);
	await expect(row(page, 'Second note')).toBeVisible();

	await visit(page, `/notebooks/${target}`);
	await expect(row(page, 'First note')).toBeVisible();
});

test('a note’s editor moves it to another notebook or into the diary', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('note-move'));
	const source = await makeNotebook(page, 'Source');
	await writeNote(page, source, 'Wandering note');
	await visit(page, page.url());

	await row(page, 'Wandering note').getByRole('button', { name: 'Edit this note' }).click();
	await pickNotebook(page, 'form[action="?/updateEntry"]', 'Diary');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();

	await visit(page, '/notebooks/diary');
	await expect(page.getByText('about Wandering note')).toBeVisible();
});

test('diary entries are selected and moved into a notebook', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('diary-batch'));
	await makeNotebook(page, 'Filed');
	await visit(page, '/notebooks/diary');
	for (const content of ['ran 8km', 'rested'])
		await page.request.post('/notebooks/diary?/create', { ...action(page), form: { content } });
	await visit(page, page.url());

	await page.getByRole('button', { name: 'Select many', exact: true }).click();
	await page.getByRole('button', { name: 'Select all visible notes', exact: true }).click();
	await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Move selected notes', exact: true }).click();
	await pickNotebook(page, '#diary-batch-form', 'Filed');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('ran 8km')).toHaveCount(0);
	await expect(page.getByText('rested')).toHaveCount(0);
});
