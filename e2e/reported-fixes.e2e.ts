import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Four things reported from a real instance, each cheap and each in the way.
 *
 * The theme row ran past the edge of the menu that holds it and cut "Dark" in
 * half. The danger zone sat open on a page people visit to change a password.
 * Reading what is written on a task meant opening the form that edits it. And
 * arranging thirteen widgets meant thirteen presses to start from nothing.
 */
test('the three theme words fit inside the menu', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('theme-row'));
	await visit(page, '/');

	await page.locator('header button[aria-label], header button[aria-expanded]').last().click();
	const dark = page.getByRole('button', { name: 'Dark', exact: true });
	await expect(dark).toBeVisible();

	// Inside the menu that holds it, not running past its right edge.
	const menu = page.locator('.rise').first();
	const [word, box] = await Promise.all([dark.boundingBox(), menu.boundingBox()]);
	expect(word!.x + word!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
	expect(word!.x).toBeGreaterThanOrEqual(box!.x - 1);
});

test('the danger zone is closed until it is opened', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('danger-fold'));
	await visit(page, '/settings/account');

	const zone = page.locator('details.danger-zone');
	await expect(zone).toBeVisible();
	await expect(zone).not.toHaveAttribute('open', /.*/);
	// Nothing that ends an account is on screen until somebody asks for it.
	await expect(page.getByRole('button', { name: /Delete account|Delete everything/ })).toHaveCount(
		0
	);

	await zone.locator('summary').click();
	await expect(page.getByRole('button', { name: /Delete account/ })).toBeVisible();
});

test('pressing a task reads it, and does not open the form that edits it', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('todo-unfold'));
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New task' }).click();
	await page.locator('#todo-form [name="heading"]').fill('ring the plumber');
	const more = page.getByRole('button', { name: /Category, notebook|Urgency, interest/ }).first();
	if (await more.count()) await more.click();
	await page
		.locator('#todo-form textarea[name="notes"]')
		.fill('the boiler makes a noise after 9pm\nhis number is on the fridge');
	await page.getByRole('button', { name: 'Create task' }).click();

	const title = page.getByRole('button', { name: 'ring the plumber' });
	const notes = page.getByText(/the boiler makes a noise/);
	await expect(title).toHaveAttribute('aria-expanded', 'false');

	// Folded, the second line is cut off: the text is there but the row is one
	// line tall, which is what somebody actually sees.
	const folded = (await notes.boundingBox())!.height;
	await expect(notes).toHaveClass(/truncate/);

	await title.click();
	await expect(title).toHaveAttribute('aria-expanded', 'true');
	await expect(notes).not.toHaveClass(/truncate/);
	expect((await notes.boundingBox())!.height).toBeGreaterThan(folded);
	// And no form: reading is not editing.
	await expect(page.locator('#todo-form')).toHaveCount(0);

	await title.click();
	await expect(title).toHaveAttribute('aria-expanded', 'false');
	expect((await notes.boundingBox())!.height).toBe(folded);
});

test('every widget is named in words, and can be chosen all at once', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('widget-picker'));
	await visit(page, '/');

	// The picker belongs to arranging the dashboard, which is where the cards
	// are chosen from.
	await page.getByRole('button', { name: /Rearrange/i }).click();
	await page.getByRole('button', { name: /^Widgets$/ }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	// Not one tile printing its own key where its words should be.
	await expect(dialog.getByText(/^(app|card|home|ui)\.[a-zA-Z]/)).toHaveCount(0);

	const tiles = dialog.locator('.widget-tile');
	const count = await tiles.count();
	expect(count).toBeGreaterThan(5);

	await dialog.getByRole('button', { name: 'Select all', exact: true }).click();
	await expect(tiles.locator('[aria-hidden="true"] svg')).toHaveCount(count);
	await expect(dialog.getByRole('button', { name: 'Select all', exact: true })).toBeDisabled();

	await dialog.getByRole('button', { name: 'Unselect all', exact: true }).click();
	await expect(tiles.locator('[aria-hidden="true"] svg')).toHaveCount(0);
	await expect(dialog.getByRole('button', { name: 'Unselect all', exact: true })).toBeDisabled();
});
