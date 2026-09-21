import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A task's notes are typed in the box that shows what they will be.
 *
 * "No live preview" — the notes field was a bare textarea, so a screenshot
 * pasted into a task was an address in the middle of a sentence until it was
 * saved and looked at. It is drawn with `Written` on the list, so that is what
 * the preview draws too.
 */
test('the task notes box previews what was typed', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('notes-preview'));

	await visit(page, '/tasks/todo');
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('a task with notes');

	const notes = form.locator('[name="notes"]');
	await notes.fill('ring the plumber\n\nabout the thing behind the boiler');

	const preview = form.getByLabel('Preview', { exact: true }).last();
	await expect(preview).toContainText('about the thing behind the boiler', { timeout: 5000 });
});
