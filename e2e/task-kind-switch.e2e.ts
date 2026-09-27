import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';
import { choose } from './helpers/choose';

/**
 * A task changing kind in the plan's editor: repeating, once only, and a todo.
 *
 * Each kind is its own table, so every switch makes a new row. The editor
 * kept the old id, and the second press — "Make it recurrent", then "Make it
 * once only" — answered "Not found" in a banner above the grid, behind the
 * editor. This walks every switch the editor offers, back and forth, and then
 * saves, which posted to the old id as well.
 */

/** Today, as the day view names it — a one-off cannot be put in the past. */
function today(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekLater(date: string): string {
	const d = new Date(`${date}T00:00:00`);
	d.setDate(d.getDate() + 7);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dayView = (date: string) => `/tasks/plan?view=day&from=${date}`;

/** The block on the grid, by what it says. */
const block = (page: Page, label: string) =>
	page.locator('.ec-event').filter({ hasText: label }).first();

async function openBlock(page: Page, label: string) {
	await block(page, label).click();
	const form = page.getByRole('dialog');
	await expect(form.locator('[name="startTime"]')).toBeVisible();
	return form;
}

async function newRepeatingBlock(page: Page, label: string) {
	await page.getByRole('button', { name: 'New task block' }).click();
	const form = page.getByRole('dialog');
	await form.getByRole('button', { name: 'Comes back', exact: true }).first().click();
	await form.locator('[name="startTime"]').fill('09:00');
	await form.locator('[name="label"]').fill(label);
	await choose(form, 'mode', 'Category');
	await form.getByRole('button', { name: /Add repeating task block/ }).click();
	await expect(form).toBeHidden({ timeout: 20_000 });
}

async function switchAndWait(page: Page, press: string, becomes: string) {
	const form = page.getByRole('dialog');
	await form.getByRole('button', { name: press, exact: true }).click();
	await expect(form.getByRole('button', { name: becomes, exact: true })).toBeVisible({
		timeout: 20_000
	});
}

for (const width of [
	{ name: 'desktop', viewport: { width: 1400, height: 900 } },
	{ name: 'phone', viewport: { width: 390, height: 844 } }
]) {
	test.describe(width.name, () => {
		test.use({ viewport: width.viewport });

		test('a block switches back and forth and still saves', async ({ page }) => {
			test.setTimeout(180_000);
			await register(page, testEmail(`kind-${width.name}`));
			const day = today();
			const label = `kind-switch-${width.name}`;

			await visit(page, dayView(day));
			await newRepeatingBlock(page, label);

			const form = await openBlock(page, label);
			await switchAndWait(page, 'Make it once only', 'Make it recurrent');
			await switchAndWait(page, 'Make it recurrent', 'Make it once only');
			await switchAndWait(page, 'Make it once only', 'Make it recurrent');
			await switchAndWait(page, 'Make it recurrent', 'Make it once only');
			await expect(page.getByText('Not found')).toHaveCount(0);

			// And Save, after all that, lands on the block as it now is.
			await form.locator('[name="label"]').fill(`${label}-saved`);
			await form.getByRole('button', { name: 'Save task block' }).click();
			await expect(form).toBeHidden({ timeout: 20_000 });
			await expect(page.getByText('Not found')).toHaveCount(0);
			await expect(page.locator('.ec-event').filter({ hasText: `${label}-saved` })).toHaveCount(1);

			// Repeating, so next week has it too.
			await visit(page, dayView(weekLater(day)));
			await expect(block(page, `${label}-saved`)).toBeVisible();

			// Once only, and then back to the task list.
			await visit(page, dayView(day));
			await openBlock(page, `${label}-saved`);
			await switchAndWait(page, 'Make it once only', 'Make it recurrent');
			await page.getByRole('dialog').getByRole('button', { name: 'Back to tasks' }).click();
			await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20_000 });
			await expect(page.locator('.ec-event').filter({ hasText: `${label}-saved` })).toHaveCount(0);

			await visit(page, dayView(weekLater(day)));
			await expect(page.locator('.ec-event').filter({ hasText: `${label}-saved` })).toHaveCount(0);

			await visit(page, '/tasks/todo');
			await expect(page.getByText(`${label}-saved`).first()).toBeVisible();
		});
	});
}

test('a todo placed on the day becomes repeating, then once only', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1400, height: 900 });
	await register(page, testEmail('kind-todo'));
	const day = today();
	const title = 'kind-from-a-todo';

	await visit(page, '/tasks/todo');
	await page.getByRole('button', { name: 'New task' }).first().click();
	await page.locator('[name="heading"]').first().fill(title);
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText(title).first()).toBeVisible();

	// Picked up from the strip under the toolbar and put down on the grid.
	await visit(page, dayView(day));
	await page.getByPlaceholder('Search these tasks').fill(title);
	await page.getByRole('button', { name: title }).click();
	const body = page.locator('.ec-body');
	const box = (await body.boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
	await expect(block(page, title)).toBeVisible({ timeout: 20_000 });

	await openBlock(page, title);
	await switchAndWait(page, 'Make it recurrent', 'Make it once only');
	await page.keyboard.press('Escape');
	await visit(page, dayView(weekLater(day)));
	await expect(block(page, title)).toBeVisible();

	await visit(page, dayView(day));
	await openBlock(page, title);
	await switchAndWait(page, 'Make it once only', 'Make it recurrent');
	await page.keyboard.press('Escape');
	await visit(page, dayView(weekLater(day)));
	await expect(page.locator('.ec-event').filter({ hasText: title })).toHaveCount(0);
	await visit(page, dayView(day));
	await expect(block(page, title)).toBeVisible();
});

test('a refused switch is a toast, above the editor', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1400, height: 900 });
	await register(page, testEmail('kind-toast'));
	const day = today();
	const label = 'kind-refused';

	await visit(page, dayView(day));
	await newRepeatingBlock(page, label);
	await openBlock(page, label);

	// What the server says when the block has gone from under the editor.
	await page.route(
		(url) => url.search.includes('/convertRepeat'),
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					type: 'failure',
					status: 404,
					data: JSON.stringify([{ message: 1 }, 'Not found.'])
				})
			})
	);
	await page.getByRole('dialog').getByRole('button', { name: 'Make it once only' }).click();

	const toast = page.locator('.toasts').getByText('Not found.');
	await expect(toast).toBeVisible();
	// Clear of the editor's own buttons: an error stays until dismissed, and
	// sitting on Save it was in the way of the next thing to press.
	const stack = await page.locator('.toasts').boundingBox();
	for (const name of [/^Save/, /^Cancel$/, /^Close$/]) {
		const button = await page
			.getByRole('dialog')
			.getByRole('button', { name })
			.last()
			.boundingBox();
		if (!stack || !button) continue;
		const apart =
			button.x + button.width <= stack.x ||
			stack.x + stack.width <= button.x ||
			button.y + button.height <= stack.y ||
			stack.y + stack.height <= button.y;
		expect(apart, String(name)).toBe(true);
	}
	// On top of the editor rather than behind it, and still answering: a
	// layer under a modal dialog is inert, so its own close would do nothing.
	await page.locator('.toasts').getByRole('button', { name: 'Dismiss' }).click({ timeout: 5000 });
	await expect(toast).toBeHidden();
	await expect(page.getByRole('dialog')).toBeVisible();
	// And nowhere on the page itself.
	await expect(page.locator('main').getByText('Not found.')).toHaveCount(0);
});
