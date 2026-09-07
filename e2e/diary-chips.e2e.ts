import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A person and a tag are not the same thing, and the row has to say so.
 *
 * They are drawn as the same chip in the same line under an entry, and one of
 * them carried a `#` while the other carried nothing — so "Ana" beside
 * "#running" read as another tag until you happened to know the people list.
 * One character each, and the row is legible to somebody who knows neither.
 */
test('people wear an @ and tags wear a #', async ({ page }) => {
	await register(page, `chips-${Date.now()}@test.invalid`);
	await visit(page, '/notebooks/diary');

	// The form is a modal; the page's own button opens it.
	await page.locator('[data-tour="diary-new"]').click();

	const form = page.locator('#entry-form');
	await form.locator('textarea[name=content]').fill('Coffee, and the week ahead.');
	await form.locator('[name=tags]').fill('planning');
	// The people field takes names and makes the ones it does not know, which is
	// the whole point of it being a text field.
	await form.locator('input[name=people]').fill('Ana');

	const post = page.getByRole('button', { name: 'Post entry', exact: true });
	await post.click();
	// The modal closes on success, and that is the signal the entry was written.
	// Without it the text below is only the textarea somebody typed into.
	await expect(post).toBeHidden();

	// A person is a link to the people page and a tag is a button that filters,
	// so the roles say which is which as well as the character does.
	await expect(page.getByRole('link', { name: '@Ana', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: '#planning', exact: true }).first()).toBeVisible();

	// And the bare name is not what is drawn any more.
	await expect(page.getByRole('link', { name: 'Ana', exact: true })).toHaveCount(0);
});

/**
 * A note is a note wherever it was written.
 *
 * A note typed into a notebook used to be content and nothing else, while the
 * identical note typed into the diary carried tags and the people it was
 * about — the same act producing two different things depending on which
 * screen it was typed into. Both forms are the same two fields now.
 */
test('a note written in a notebook takes tags and people too', async ({ page }) => {
	await register(page, `nbchips-${Date.now()}@test.invalid`);
	await visit(page, '/notebooks');

	await page
		.getByRole('button', { name: /New notebook/ })
		.first()
		.click();
	const create = page.getByRole('dialog');
	await create.locator('[name="heading"]').fill('Renovation');
	await create
		.getByRole('button', { name: /Create|Add/ })
		.last()
		.click();
	await expect(page.getByText('Renovation').first()).toBeVisible();

	await page.locator('textarea[name="content"]').first().fill('Tiles arrive Tuesday.');
	// Folded away by default: the common act is typing a line and pressing add.
	await page.getByText('Tags, people').first().click();
	await page.locator('[name="tags"]').first().fill('kitchen, tiles');
	await page.locator('input[name="people"]').first().fill('Ana');
	await page.getByRole('button', { name: /Add note/ }).click();

	await expect(page.getByText('Tiles arrive Tuesday.')).toBeVisible();
	await expect(page.getByRole('link', { name: '@Ana', exact: true })).toBeVisible();
	await expect(page.getByText('#kitchen', { exact: true })).toBeVisible();
	await expect(page.getByText('#tiles', { exact: true })).toBeVisible();

	// And editing one shows what it already carries rather than blanking it.
	// Scoped to the edit form: the composer above has the same two fields, empty.
	await page.getByRole('button', { name: 'Edit this note' }).first().click();
	const edit = page.locator('form[action="?/updateEntry"]');
	await expect(edit.locator('[name="tags"]')).toHaveValue(/kitchen/);
	await expect(edit.locator('input[name="people"]')).toHaveValue('Ana');
});
