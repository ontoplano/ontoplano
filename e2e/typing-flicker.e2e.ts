import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * What is typed stays typed.
 *
 * "visually, I see characters getting deleted. They really don't — if I type
 * looking at the wall it will all go well, but they FLICK and disappear, like
 * shit I just wrote in the last 0.5s." In a notebook's edit-to-do and
 * edit-note forms, and not in the quick new task form.
 *
 * So: type slowly into the field, and watch its value after every keystroke.
 * A value that ever gets *shorter* than what has been typed is the flicker.
 */

test('typing into a notebook’s note editor keeps every letter', async ({ page }) => {
	test.setTimeout(240_000);
	await register(page, testEmail('typing-flicker'));
	await visit(page, '/notebooks');

	await page
		.getByRole('button', { name: /New notebook/ })
		.first()
		.click();
	const create = page.getByRole('dialog');
	await create.locator('[name="heading"]').fill('Kitchen');
	await create
		.getByRole('button', { name: /Create|Add/ })
		.last()
		.click();
	await expect(page.getByText('Kitchen').first()).toBeVisible({ timeout: 30_000 });

	// A note first, because the form that was reported is the one that edits
	// an existing note rather than the composer.
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await page.locator('textarea[name="content"]').first().fill('Quotes in.');
	await page
		.getByRole('button', { name: /Add note/ })
		.last()
		.click();
	await expect(page.getByText('Quotes in.').first()).toBeVisible({ timeout: 30_000 });

	await page
		.getByRole('button', { name: /Edit this note/ })
		.first()
		.click();
	const box = 'textarea[name="content"]';
	await expect(page.locator(box).first()).toBeVisible();
	await page.locator(box).first().click();
	await page.keyboard.press('End');

	/*
	 * And the page reloading its own data underneath, which is what actually
	 * triggered it: the live stream does this whenever anything changes, and
	 * so does coming back to the tab. A one-way `value={…}` prop is re-applied
	 * on every one of those, and what had been typed since went with it.
	 */
	const typed = ' the boiler makes a noise after nine';
	const shrank: string[] = [];
	let sent = '';
	for (const letter of typed) {
		await page.locator(box).first().type(letter, { delay: 0 });
		sent += letter;
		if (sent.length % 7 === 0) {
			await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
			await page.waitForTimeout(250);
		}
		const now = await page.locator(box).first().inputValue();
		if (!now.endsWith(sent)) shrank.push(`after "${sent}" the box said "${now.slice(-40)}"`);
	}

	expect(shrank, 'the field lost letters while they were being typed').toEqual([]);
});
