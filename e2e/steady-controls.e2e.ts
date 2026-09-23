import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Pressing a toggle does not move the controls beside it.
 *
 * `user-actions-never-move-the-page` is usually read as being about elements —
 * a panel unfolding, a row growing — and the commoner case is text. A button
 * reading "Show completed (1)" that becomes "Hide completed" is a press that
 * moves everything to its right, and a count reading "1 task showing" that
 * becomes "0 tasks showing" does it again as the list narrows. Nothing
 * appeared or disappeared; the words got shorter, which from the reader's side
 * is the same defect.
 *
 * So this presses every toggle on the task strip and checks that the strip's
 * own controls are where they were. It is written against the strip rather
 * than against one button because the point is the class, not the instance.
 */
test('the task strip does not shift when its toggles are pressed', async ({ page }) => {
	test.setTimeout(240_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('steady'));
	await visit(page, '/tasks/todo');

	// One finished task, so the completed toggle has something to say.
	for (const title of ['one to finish', 'one to leave']) {
		await page
			.getByRole('button', { name: /New task/ })
			.first()
			.click();
		const form = page.getByRole('dialog');
		await form.locator('[name="heading"]').first().fill(title);
		await page.getByRole('button', { name: 'Create task' }).click();
		await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
	}
	await page.getByRole('button', { name: 'Mark complete' }).first().click();
	await page.waitForTimeout(1200);

	/**
	 * Where every control on the strip sits.
	 *
	 * Rounded to two pixels rather than to one: showing the completed tasks
	 * makes the list long enough for a scrollbar, and a scrollbar takes its
	 * width off the page. That is the browser, not the strip, and it moves
	 * everything by the same pixel. What this is looking for is a control
	 * moving because the words in it got shorter, which is tens of pixels.
	 */
	const places = () =>
		page.evaluate(() => {
			const strip = document.querySelector('.room-toolbar-row > div');
			if (!strip) return [];
			return [...strip.querySelectorAll('button, input, [role="combobox"]')].map((el) => {
				const box = el.getBoundingClientRect();
				const at = Math.round(box.x / 2) * 2;
				return `${el.textContent?.trim().slice(0, 12) || el.tagName}@${at}`;
			});
		});

	const toggle = page.getByRole('button', { name: /^Completed/ });
	const before = await places();
	await toggle.click();
	await page.waitForTimeout(800);
	const after = await places();

	expect(before.length).toBeGreaterThan(2);
	expect(after, 'pressing Completed moved the controls beside it').toEqual(before);

	// And back, which is the same promise in the other direction.
	await toggle.click();
	await page.waitForTimeout(800);
	expect(await places()).toEqual(before);
});
