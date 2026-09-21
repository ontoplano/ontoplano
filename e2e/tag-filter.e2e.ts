import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Narrowing by more than one label.
 *
 * One was not a filter: "show me the urgent ones" is a question a single label
 * answers, and "the urgent ones and the ones about the house" is the question
 * anybody with a list long enough to filter is actually asking. Any of them
 * rather than all — a task carries two or three labels, and asking for the
 * ones carrying every label picked usually asks for nothing.
 */
test('the tag filter holds several labels at once', async ({ page }) => {
	test.setTimeout(240_000);
	await page.setViewportSize({ width: 1100, height: 900 });
	await register(page, testEmail('tag-filter'));
	await visit(page, '/tasks/todo');

	for (const [title, tags] of [
		['ring the plumber', 'home'],
		['read the Republic', 'reading'],
		['post the parcel', 'errands']
	] as const) {
		await page
			.getByRole('button', { name: /New task/ })
			.first()
			.click();
		const form = page.getByRole('dialog');
		await form.locator('[name="heading"]').first().fill(title);
		await form.locator('input[role="combobox"]').first().fill(tags);
		await form.locator('input[role="combobox"]').first().press('Space');
		await page.getByRole('button', { name: 'Create task' }).click();
		await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
	}

	const face = page.getByRole('button', { name: /label|tag/i }).first();
	await face.click();
	await page.getByRole('option', { name: 'home', exact: true }).click();
	await page.getByRole('option', { name: 'reading', exact: true }).click();
	await page.keyboard.press('Escape');

	// Both kinds are shown, the third is not.
	await expect(page.getByText('ring the plumber')).toBeVisible();
	await expect(page.getByText('read the Republic')).toBeVisible();
	await expect(page.getByText('post the parcel')).toBeHidden();

	// And the button says which, rather than just "filtered".
	await expect(face).toContainText('home');
	await expect(face).toContainText('reading');

	// "Every tag" is the way back, not a fourth label.
	await face.click();
	await page.getByRole('option', { name: 'Every tag' }).click();
	await page.keyboard.press('Escape');
	await expect(page.getByText('post the parcel')).toBeVisible();
});
