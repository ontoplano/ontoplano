import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The lead field of a quick form is a textarea, and behaves like an input.
 *
 * Android's autofill service offers its key/card/pin bar over an `<input>` and
 * never over a `<textarea>`, and no attribute reaches that decision: the quick
 * todo form carried `autocomplete="off"`, every ignore flag `$lib/autofill`
 * stamps, and a field name nothing classifies as an address — and still got the
 * bar, while the idea form beside it, identical but for leading with a
 * textarea, never did.
 *
 * `tests/autofill-field-names.test.ts` keeps the element right. This keeps it
 * *usable*: a textarea that swallowed Enter, or lost what was typed, would be a
 * worse bug than the one it fixes.
 */
test('a quick form still saves on Enter, with a textarea for a title', async ({ page }) => {
	await register(page, `one-line-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New to-do' }).click();
	const lead = page.locator('[name="heading"]').first();
	await expect(lead).toBeVisible();

	expect(
		await lead.evaluate((el) => el.tagName),
		'an input here puts the autofill bar over the phone keyboard'
	).toBe('TEXTAREA');

	// One row, so it reads as the single-line field it stands in for.
	const height = await lead.evaluate((el) => el.getBoundingClientRect().height);
	expect(height).toBeLessThan(60);

	await lead.fill('call the vet');
	await lead.press('Enter');

	await expect(page.getByText('call the vet')).toBeVisible();
});
