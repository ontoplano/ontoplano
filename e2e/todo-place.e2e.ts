import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The number in the task form says which row this is, in the list on screen.
 *
 * It used to be counted against every open task in the notebook whatever the
 * list was doing — so opening the top row of a list ordered by when things
 * were added was told it was third, which reads as the form comparing a task
 * with itself. The claim has to be one somebody can check by looking.
 */
async function add(page: Page, title: string) {
	await page.getByRole('button', { name: 'New task' }).first().click();
	await page.locator('[name="heading"]').first().fill(title);
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

/** Which row the form says it is, with the editor open on the nth row. */
async function placeOfRow(page: Page, nth: number): Promise<string> {
	await visit(page, '/tasks/todo');
	await page.getByRole('button', { name: /Edit/ }).nth(nth).click();
	const said = page.getByText(/in line/).first();
	await expect(said).toBeVisible();
	return (await said.textContent()) ?? '';
}

test('the place in the form is the place in the list', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('todo-place'));
	await visit(page, '/tasks/todo');

	await add(page, 'First thing');
	await add(page, 'Second thing');
	await add(page, 'Third thing');

	// Newest first, which is what the list is ordered by to begin with.
	expect(await placeOfRow(page, 0)).toContain('1st');
	expect(await placeOfRow(page, 2)).toContain('3rd');

	// Ordered by priority, the same rows read the same way — and there the
	// number is what the sliders move, which is the reason it exists.
	await visit(page, '/tasks/todo');
	await page
		.getByRole('button', { name: /Order tasks by/ })
		.first()
		.click();
	await page.getByRole('option', { name: 'Priority' }).click();
	await expect(page.getByRole('button', { name: /Order tasks by/ })).toContainText('Priority');

	await page.getByRole('button', { name: /Edit/ }).first().click();
	await expect(page.getByText(/in line/).first()).toContainText('1st');
});
