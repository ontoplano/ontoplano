import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A notebook is read in the order somebody asks for.
 *
 * Oldest first is the default and the right one for a subject being worked
 * through. The other two questions a notebook gets asked once it is longer
 * than a screen are *where is the one called X* and *what did I touch last*,
 * and the direction is its own control because three fields and two
 * directions is six presses on a single cycling button.
 */
async function makeNotebook(page: import('@playwright/test').Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

async function addNote(page: import('@playwright/test').Page, title: string, body: string) {
	await page.getByRole('button', { name: 'New note', exact: true }).click();
	await page.locator('form[action="?/addEntry"] [name="heading"]').fill(title);
	await page.locator('form[action="?/addEntry"] textarea[name="content"]').fill(body);
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

/** The note titles in the order the page has them in. */
async function titles(page: import('@playwright/test').Page): Promise<string[]> {
	return page.locator('[data-note-title]').allInnerTexts();
}

test('notes are ordered by title, by when they were written, and both ways', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('nb-order'));
	await makeNotebook(page, 'Reading');
	await visit(page, '/notebooks');

	// Written in an order that is neither alphabetical nor its reverse, so a
	// sort that quietly does nothing cannot pass by luck.
	await addNote(page, 'Middle', 'b');
	await addNote(page, 'Alpha', 'a');
	await addNote(page, 'Zulu', 'z');

	// The default: the pages of a notebook, beginning at the beginning.
	expect(await titles(page)).toEqual(['Middle', 'Alpha', 'Zulu']);

	// A menu now, not a native select — the same control the task list uses.
	const order = page.getByRole('button', { name: 'Order notes by' });
	const pick = async (name: string) => {
		await order.click();
		await page.getByRole('option', { name }).click();
	};
	await pick('Title');
	await expect.poll(() => titles(page)).toEqual(['Alpha', 'Middle', 'Zulu']);

	await page.getByRole('button', { name: 'Ascending' }).click();
	await expect.poll(() => titles(page)).toEqual(['Zulu', 'Middle', 'Alpha']);

	// Turned back, and then back to the written order the other way round.
	await page.getByRole('button', { name: 'Descending' }).click();
	await expect.poll(() => titles(page)).toEqual(['Alpha', 'Middle', 'Zulu']);

	await pick('Written');
	await page.getByRole('button', { name: 'Ascending' }).click();
	await expect.poll(() => titles(page)).toEqual(['Zulu', 'Alpha', 'Middle']);
});

test('the chosen order survives a reload, and a pin still leads', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('nb-order-kept'));
	await makeNotebook(page, 'Reading');
	await visit(page, '/notebooks');

	await addNote(page, 'Middle', 'b');
	await addNote(page, 'Alpha', 'a');
	await addNote(page, 'Zulu', 'z');

	const order = page.getByRole('button', { name: 'Order notes by' });
	await order.click();
	await page.getByRole('option', { name: 'Title' }).click();
	await expect.poll(() => titles(page)).toEqual(['Alpha', 'Middle', 'Zulu']);

	await visit(page, '/notebooks');
	await expect(page.getByRole('button', { name: 'Order notes by' })).toContainText('Title');
	await expect.poll(() => titles(page)).toEqual(['Alpha', 'Middle', 'Zulu']);

	// Pinning says "this is what the notebook is for", and no alphabet may
	// bury it: the pinned one leads whatever the order says.
	await page.getByRole('button', { name: 'Keep this at the top' }).last().click();
	await expect.poll(() => titles(page)).toEqual(['Zulu', 'Alpha', 'Middle']);
});

test('a list emptied by its own filters says so rather than saying there is nothing', async ({
	page
}) => {
	test.setTimeout(150_000);
	await register(page, testEmail('nb-hidden'));
	await makeNotebook(page, 'Kitchen');
	await visit(page, '/notebooks');

	await page.getByRole('button', { name: /^Tasks \d/ }).click();
	// The notebook draws its own New button, and it says what the tab is about.
	await page.getByRole('button', { name: 'New task', exact: true }).click();
	await page.locator('#todo-form [name="heading"]').fill('measure the wall');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText('measure the wall').first()).toBeVisible();

	await page.getByRole('button', { name: 'Mark complete' }).first().click();

	// The tab says there is one task; the panel used to say "Nothing waiting —
	// a to-do is a task with no day on it", which is the app claiming an empty
	// notebook while its own tab counts a task in it.
	await expect(page.getByRole('button', { name: 'Tasks 1/1' })).toBeVisible();
	await expect(page.getByText('Nothing waiting')).toHaveCount(0);
	await expect(page.getByText('1 hidden by the buttons above.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Show completed (1)' })).toBeVisible();

	await page.getByRole('button', { name: 'Show completed (1)' }).click();
	await expect(page.getByText('measure the wall').first()).toBeVisible();
});
