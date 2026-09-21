import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A full box keeps its place while somebody types into it.
 *
 * The box grows to a ceiling and then scrolls. Every keystroke after that ran
 * a measurement that collapses it to `height: auto` for a frame, and a
 * scrolled box loses its own `scrollTop` to that — so the line being typed
 * jumped away and came back. "they FLICK and disappear, like shit I just
 * wrote in the last 0.5s."
 */
test('typing into a long note does not jump the line being written', async ({ page }) => {
	test.setTimeout(240_000);
	await register(page, testEmail('typing-scroll'));
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

	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	const box = page.locator('textarea[name="content"]').first();
	await expect(box).toBeVisible();

	// Long enough to pass the box's ceiling, so it is scrolling.
	await box.fill(Array.from({ length: 40 }, (_, i) => `line ${i} of the quotes`).join('\n'));
	await box.click();
	await page.keyboard.press('End');
	await page.waitForTimeout(300);

	const at = () => box.evaluate((el) => (el as HTMLTextAreaElement).scrollTop);
	const before = await at();
	expect(before, 'the box is not scrolled, so this proves nothing').toBeGreaterThan(0);

	// Typing at the end must not move what is on screen.
	for (const letter of ' and one more') {
		await box.type(letter, { delay: 10 });
		expect(Math.abs((await at()) - before)).toBeLessThanOrEqual(2);
	}
});
