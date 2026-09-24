import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The number in the task form says where this comes in the queue.
 *
 * Counted by priority and by nothing else, against the rows the list is
 * showing. The three sliders decide one thing — where this comes — and
 * counting instead against whatever the list happens to be sorted by made the
 * number answer a different question every time the sort control moved:
 * alphabetically it said where the word fell, and a slider moved under it and
 * changed nothing, which is the sliders looking broken.
 *
 * So the claim is checkable by looking whenever the list is in the order the
 * number is about, which is what this walks.
 */
async function add(page: Page, title: string) {
	await page.getByRole('button', { name: 'New task' }).first().click();
	await page.locator('[name="heading"]').first().fill(title);
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

/** Put the list in priority order — the order the number is about. */
async function orderByPriority(page: Page) {
	await page
		.getByRole('button', { name: /Order tasks by/ })
		.first()
		.click();
	await page.getByRole('option', { name: 'Priority' }).click();
	await expect(page.getByRole('button', { name: /Order tasks by/ })).toContainText('Priority');
}

test('the place in the form is the place in the list', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('todo-place'));
	await visit(page, '/tasks/todo');

	await add(page, 'First thing');
	await add(page, 'Second thing');
	await add(page, 'Third thing');

	// In priority order, the row and the number agree — which is the claim
	// somebody can check by looking.
	await visit(page, '/tasks/todo');
	await orderByPriority(page);
	await page.getByRole('button', { name: /Edit/ }).first().click();
	await expect(page.getByText(/in line/).first()).toContainText('1st');

	await visit(page, '/tasks/todo');
	await orderByPriority(page);
	await page.getByRole('button', { name: /Edit/ }).nth(2).click();
	await expect(page.getByText(/in line/).first()).toContainText('3rd');
});
