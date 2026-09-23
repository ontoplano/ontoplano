import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * One press takes one label off.
 *
 * Reported twice: pressing a chip's × sometimes removes that chip *and* the
 * next one. A synthetic `click` removes exactly one, so the handler is right
 * and the gesture is what differs — this drives a real mouse.
 */
async function openTagBox(page: import('@playwright/test').Page, tags: string) {
	await visit(page, '/tasks/todo');
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('a task with labels');
	await page.locator('#todo-form input[role="combobox"]').fill(tags);
	// A space turns the last word into a chip like every other one.
	await page.locator('#todo-form input[role="combobox"]').press('Space');
	return form;
}

test('a real click on one chip takes one chip off', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('chip-removal'));
	const form = await openTagBox(page, 'alpha, bravo, charlie, delta ');

	await expect(form.locator('.chip')).toHaveCount(4);

	// The middle one, with a neighbour either side — the case that broke.
	const bravo = form.locator('.chip', { hasText: 'bravo' }).getByRole('button');
	const box = await bravo.boundingBox();
	expect(box).not.toBeNull();
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await page.mouse.down();
	await page.mouse.up();

	await expect(form.locator('.chip')).toHaveCount(3);
	const left = await form.locator('.chip').allInnerTexts();
	expect(left.join(' ')).toContain('alpha');
	expect(left.join(' ')).toContain('charlie');
	expect(left.join(' ')).toContain('delta');
});

test('pressing them one after another takes them off one at a time', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('chip-removal-run'));
	const form = await openTagBox(page, 'one, two, three, four, five, six ');
	await expect(form.locator('.chip')).toHaveCount(6);

	// Always the first chip, six times: the walk-over-a-changing-list case.
	for (let left = 6; left > 0; left--) {
		await expect(form.locator('.chip')).toHaveCount(left);
		const first = form.locator('.chip').first().getByRole('button');
		const box = await first.boundingBox();
		await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
		await page.mouse.down();
		await page.mouse.up();
	}
	await expect(form.locator('.chip')).toHaveCount(0);
});
