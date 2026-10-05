import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A long list is drawn a page at a time.
 *
 * Every task comes with the page, so the filters stay instant — but drawing
 * seven hundred finished ones at once froze the screen for seconds. Fifty are
 * drawn, and the next fifty as the end comes near; the count still says all
 * of them.
 */
test('a long to-do list draws fifty, and more as it is scrolled', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('long-list'));
	await visit(page, '/tasks/todo');
	const origin = new URL(page.url()).origin;
	for (let i = 1; i <= 120; i++)
		await page.request.post('/tasks/todo?/create', {
			headers: { Origin: origin, 'x-sveltekit-action': 'true' },
			form: { heading: `task ${i}` }
		});

	await visit(page, '/tasks/todo');
	const rows = page.locator('[data-todo-id]');
	await expect(rows).toHaveCount(50);

	// Scrolled towards the end, the next page is there before it is reached.
	await rows.nth(45).scrollIntoViewIfNeeded();
	await expect(rows).toHaveCount(100);

	// `j` walking past what is drawn draws more rather than stopping.
	await rows
		.first()
		.click({ position: { x: 2, y: 2 } })
		.catch(() => {});
	for (let i = 0; i < 110; i++) await page.keyboard.press('j');
	await expect(rows).toHaveCount(120);
});
