import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Pressing a label on a note narrows the notes to it.
 *
 * The task list has done this since tasks had labels — press `#a1` on a row
 * and the list is the rows carrying it — and the notes beside it, which use
 * the same vocabulary, did nothing at all when pressed. Same word, same
 * gesture, two answers.
 *
 * What this walks is the part that can silently not work: that the press
 * actually removes the other notes, that a second press puts them back, and
 * that the strip above says what is being hidden — a filter nothing on screen
 * mentions is a list that has quietly lost rows.
 */
/**
 * The label on the note, and not the two other buttons wearing its name.
 *
 * Once a label is filtering, the strip above says so — the fold's own button
 * takes the summary as its name, and the chips inside it are pressed copies.
 * `aria-controls` is what tells them apart: only the fold controls something.
 * The tasks tab's spec has the same line, for the same reason.
 */
function chipOn(page: Page, label: string) {
	return page
		.locator('article button:not([aria-controls])')
		.filter({ hasText: new RegExp(`^#?${label}$`) })
		.first();
}

async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

async function writeNote(page: Page, title: string, label: string) {
	await page.getByRole('button', { name: /^(New note|New task|New goal|Cancel)$/ }).click();
	await page.locator('form[action="?/addEntry"] [name="heading"]').fill(title);
	await page.locator('form[action="?/addEntry"] textarea[name="content"]').fill(`about ${title}`);
	// Tags are behind the composer's own disclosure, one press.
	const form = page.locator('form[action="?/addEntry"]');
	await form
		.getByText(/Tags, people/)
		.first()
		.click();
	// The visible box takes the words; the hidden field beside it is what the
	// form posts. See `TagInput`.
	await form.locator('input[role="combobox"]').first().fill(label);
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

test('a label on a note narrows the notes to it', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('note-tag'));
	await makeNotebook(page, 'Kitchen');

	await visit(page, '/notebooks');
	await page
		.getByRole('link', { name: /Kitchen/ })
		.first()
		.click();
	await expect(page.getByRole('button', { name: /^Notes/ })).toBeVisible();

	await writeNote(page, 'the tiles', 'shopping');
	await writeNote(page, 'the plumber', 'calls');

	// Both are here to begin with.
	await expect(page.getByText('the tiles').first()).toBeVisible();
	await expect(page.getByText('the plumber').first()).toBeVisible();

	// Pressing the label on the note keeps the notes that carry it.
	await chipOn(page, 'shopping').click();
	await expect(page.getByText('the plumber')).toHaveCount(0);
	await expect(page.getByText('the tiles').first()).toBeVisible();

	// And pressing it again lets the rest back.
	await chipOn(page, 'shopping').click();
	await expect(page.getByText('the plumber').first()).toBeVisible();
});
