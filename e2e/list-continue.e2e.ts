import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Enter on a line of a checklist starts the next one with a box, and Enter on
 * an empty box ends the list — in any box written in Markdown.
 */
test('a checklist carries on with Enter, and stops on an empty line', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('list-continue'));
	await visit(page, '/tasks/todo');
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const notes = page.locator('#todo-form textarea[name="notes"]');
	await notes.click();
	await notes.pressSequentially('- [ ] milk');
	await notes.press('Enter');
	await notes.pressSequentially('eggs');
	await notes.press('Enter');
	await notes.press('Enter');
	await notes.pressSequentially('that is all');
	await expect(notes).toHaveValue('- [ ] milk\n- [ ] eggs\nthat is all');

	// Undo takes the continuation back like anything typed.
	await notes.fill('- [ ] bread');
	await notes.press('End');
	await notes.press('Enter');
	await page.keyboard.press('Control+z');
	await expect(notes).toHaveValue('- [ ] bread');
});
