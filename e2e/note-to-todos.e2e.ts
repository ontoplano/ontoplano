import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { png } from './helpers/png';
import { visit } from './helpers/visit';

/**
 * Two halves of the same complaint: a list written in a note is stuck there.
 *
 * People write checklists in notes because it is the fastest way to get one out
 * of their head. Then it sits in a notebook where nothing can remind them of
 * it, nothing can go on a day and nothing can be ticked off anywhere that
 * counts — so a note with a `- [ ]` in it offers to become the tasks it
 * describes, and what is written under each box comes across as that task's
 * notes.
 *
 * The other half is that a task is as often a screenshot as a sentence. A
 * to-do's notes take a picture the way a note's do, and the row draws it rather
 * than printing `![shot](/media/12)` across itself.
 */
async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

async function writeNote(page: Page, title: string, content: string) {
	await page.getByRole('button', { name: 'New note', exact: true }).click();
	await page.locator('form[action="?/addEntry"] [name="heading"]').fill(title);
	await page.locator('form[action="?/addEntry"] textarea[name="content"]').fill(content);
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

const LIST = [
	'things before the trip',
	'',
	'- [ ] ring the plumber',
	'  the boiler makes a noise after 9pm',
	'- [x] book the MOT',
	'- [ ] pack'
].join('\n');

test('a note that is a checklist becomes the tasks it describes', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('note-todos'));
	await makeNotebook(page, 'The trip');
	await visit(page, '/notebooks');
	await writeNote(page, 'Before the trip', LIST);

	const offer = page.getByRole('button', { name: 'Make tasks of the checkboxes' });
	await expect(offer).toBeVisible();
	await offer.click();

	// The dialog shows what is about to be made, with what belongs to each —
	// two similar lines are told apart by the notes under them.
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByText('ring the plumber')).toBeVisible();
	await expect(dialog.getByText('the boiler makes a noise after 9pm')).toBeVisible();
	await expect(dialog.getByText('book the MOT')).toBeVisible();
	await expect(dialog.getByText('pack', { exact: true })).toBeVisible();

	// Nothing above the first checkbox is a task: that line belongs to the note.
	await expect(dialog.getByText('things before the trip')).toHaveCount(0);

	// One of them was done before the note was finished; it is left behind.
	await dialog.getByRole('checkbox', { name: 'book the MOT' }).uncheck();
	await dialog.getByRole('button', { name: 'Make 2 tasks' }).click();

	await page.getByRole('button', { name: /^Tasks \d/ }).click();
	await expect(page.getByText('ring the plumber').first()).toBeVisible();
	await expect(page.getByText('pack').first()).toBeVisible();
	await expect(page.getByText('book the MOT')).toHaveCount(0);

	// What was written under a box came with it.
	await expect(page.getByText('the boiler makes a noise after 9pm')).toBeVisible();

	// And the note is exactly as it was: making tasks of it is not moving it.
	await page.getByRole('button', { name: /^Notes\b/ }).click();
	await page.getByRole('button', { name: /Before the trip/ }).click();
	await expect(page.getByText('things before the trip')).toBeVisible();
});

test('a ticked box crosses over already done', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('note-todos-done'));
	await makeNotebook(page, 'The trip');
	await visit(page, '/notebooks');
	await writeNote(page, 'Half of it', '- [ ] pack\n- [x] book the MOT');

	await page.getByRole('button', { name: 'Make tasks of the checkboxes' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Make 2 tasks' }).click();

	// One of two waiting, which is what the tab count says without opening it.
	await expect(page.getByRole('button', { name: 'Tasks 1/2' })).toBeVisible();
});

test('a note with no checkbox in it is not offered the button', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('note-no-boxes'));
	await makeNotebook(page, 'Measurements');
	await visit(page, '/notebooks');
	await writeNote(page, 'The kitchen', 'the wall is 2.4m and the door opens inward');

	await expect(page.getByRole('button', { name: 'Make tasks of the checkboxes' })).toHaveCount(0);
	// The buttons beside it are still all there: nothing moved to make room.
	await expect(page.getByRole('button', { name: 'Edit this note' })).toBeVisible();
});

test('a to-do takes a picture, and the row draws it', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('todo-picture'));
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('#todo-form [name="heading"]').fill('fix the header');

	// The notes box and its attachments live behind the disclosure on this form.
	const more = page.getByRole('button', { name: /Category, notebook|Urgency, interest/ }).first();
	if (await more.count()) await more.click();

	await page.locator('#todo-form input[type="file"]').setInputFiles(png([9, 120, 200]));
	await expect(page.locator('#todo-form textarea[name="notes"]')).toHaveValue(
		/!\[[^\]]*\]\(\/media\/\d+\)/,
		{ timeout: 20000 }
	);

	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText('fix the header').first()).toBeVisible();

	// Drawn, not printed: no markdown left lying across the row.
	await expect(page.locator('img[src^="/media/"]').first()).toBeVisible();
	await expect(page.getByText('](/media/')).toHaveCount(0);
});
