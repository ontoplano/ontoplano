import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A note far longer than one line, so the clamp has something to cut.
 *
 * Long enough to wrap at the widest this list is ever drawn: the row is about
 * 1,140px in the suite's own viewport, which is well over two hundred
 * characters of the size this line is set at. A note that fits gets no
 * chevron, which is the other test in this file.
 */
const LONG =
	'the boiler makes a noise after nine, and his number is on the fridge — ' +
	'he said to ring before eight or after six, and to mention the flat number ' +
	'because the last time nobody could find the door from the street. He also ' +
	'wants to know whether the pressure gauge has moved since the winter, and ' +
	'if the radiator upstairs is still cold at the top while the one below it ' +
	'is hot, because that would mean the whole system needs bleeding again ' +
	'rather than anything being wrong with the boiler itself at all.';

/**
 * The mark that folds a task sits on the first line of its writing.
 *
 * Not in front of the title: that put the mark for "there is more of this" on
 * the one line that is not the more of it. Folded, anything in the block opens
 * it — there is nothing to lose by pressing in the wrong place when the only
 * thing that can happen is seeing more. Open, only the first line shuts it.
 */
test('the first line of a task’s writing folds it, and the rest of it does not', async ({
	page
}) => {
	test.setTimeout(180_000);
	await register(page, testEmail('open-by-description'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('ring the plumber');
	await form.locator('textarea[name="notes"]').first().fill(LONG);
	await form
		.getByRole('button', { name: /Create task/ })
		.last()
		.click();
	await expect(page.getByText('ring the plumber').first()).toBeVisible({ timeout: 30_000 });

	const fold = page.locator('.todo-fold');
	await expect(fold).toHaveAttribute('aria-expanded', 'false');

	// Folded, the words open it — anything in the block does.
	await page
		.getByText(/the boiler makes a noise/)
		.first()
		.click();
	await expect(fold).toHaveAttribute('aria-expanded', 'true');

	/*
	 * Open, only the first line shuts it. Everything under that is a paragraph
	 * being read, and reading means selecting a word or following a link — both
	 * of which used to fold the row away mid-sentence.
	 */
	const notes = page.locator('.todo-notes').first();
	const box = (await notes.boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4);
	await expect(fold).toHaveAttribute('aria-expanded', 'true');

	// The first line does, and so does the mark beside it.
	await page.mouse.click(box.x + box.width / 2, box.y + 6);
	await expect(fold).toHaveAttribute('aria-expanded', 'false');

	await fold.click();
	await expect(fold).toHaveAttribute('aria-expanded', 'true');

	/*
	 * And the pointer says which line that is before anything is pressed: a
	 * hand and a lit chevron over the first line, the text cursor and a grey
	 * one over the lines being read.
	 */
	const open = (await notes.boundingBox())!;
	await page.mouse.move(open.x + open.width / 2, open.y + open.height - 4);
	await expect(notes).not.toHaveCSS('cursor', 'pointer');
	await expect(notes).not.toHaveClass(/todo-notes-hot/);
	await page.mouse.move(open.x + open.width / 2, open.y + 6);
	await expect(notes).toHaveCSS('cursor', 'pointer');
	await expect(notes).toHaveClass(/todo-notes-hot/);
});

/**
 * And a note with nothing folded away offers nothing to unfold.
 *
 * `hasMore` was "does this task have notes", so a one-line note carried a
 * chevron and pressing it swapped one line of text for the same line of text.
 */
test('a note that fits on one line has no chevron at all', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('no-fold'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('post the parcel');
	await form.locator('textarea[name="notes"]').first().fill('before five');
	await form
		.getByRole('button', { name: /Create task/ })
		.last()
		.click();
	await expect(page.getByText('post the parcel').first()).toBeVisible({ timeout: 30_000 });

	await expect(page.getByText('before five').first()).toBeVisible();
	await expect(page.locator('.todo-fold')).toHaveCount(0);
});
