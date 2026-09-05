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
	await form.locator('input[name=tags]').fill('planning');
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
