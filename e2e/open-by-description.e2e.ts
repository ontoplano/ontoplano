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
 * The line under the title opens the task, and does not shut it again.
 *
 * The title was the only thing that unfolded one, and the words under it — the
 * line you are reading when you want the rest — did nothing. It opens one now.
 * It does not close one: once it is open the note is a paragraph somebody is
 * reading, and reading means selecting a word or following a link, both of
 * which folded it away. The title and the chevron still shut it.
 */
test('pressing a task’s description unfolds it, and reading it does not fold it', async ({
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

	const title = page.getByRole('button', { name: 'ring the plumber' });
	await expect(title).toHaveAttribute('aria-expanded', 'false');

	await page
		.getByText(/the boiler makes a noise/)
		.first()
		.click();
	await expect(title).toHaveAttribute('aria-expanded', 'true');

	// Pressing the words again leaves it open: they are being read, not pressed.
	await page
		.getByText(/the boiler makes a noise/)
		.first()
		.click();
	await expect(title).toHaveAttribute('aria-expanded', 'true');

	// The title is what shuts it.
	await title.click();
	await expect(title).toHaveAttribute('aria-expanded', 'false');
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
	await expect(page.getByRole('button', { name: 'post the parcel' })).toHaveCount(0);
});
