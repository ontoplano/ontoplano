import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { openFilters } from './helpers/filters';
import { visit } from './helpers/visit';

/**
 * A narrowing somebody wants back, under a name they chose.
 *
 * Two things have to be true for this to be worth anything. The narrowing has
 * to be in the address — otherwise there is nothing to save, and a reload
 * throws away what somebody was looking at. And a saved one has to put the
 * controls back where they were, not merely change the address under them.
 */
test('a filter can be kept by name, and putting it back sets the controls', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('saved-filters'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	await page.locator('#todo-form [name="heading"]').fill('ring the plumber');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText('ring the plumber').first()).toBeVisible({ timeout: 30_000 });

	await openFilters(page);
	const completed = page.getByRole('button', { name: /^Completed/ });
	await completed.click();

	// The narrowing is in the address, which is what makes it a link.
	await expect.poll(() => new URL(page.url()).searchParams.get('done')).toBe('show');

	await page.getByRole('button', { name: 'Save these' }).click();
	const name = page.getByPlaceholder(/What to call it/);
	await name.fill('Done and dusted');
	await name.press('Enter');

	const chip = page.getByRole('button', { name: 'Show Done and dusted' });
	await expect(chip).toBeVisible({ timeout: 20_000 });

	// Back to everything, and then back to the saved one.
	await completed.click();
	await expect.poll(() => new URL(page.url()).searchParams.get('done')).toBeNull();
	await expect(completed).toHaveAttribute('aria-pressed', 'false');

	await chip.click();
	await expect.poll(() => new URL(page.url()).searchParams.get('done')).toBe('show');
	// The control itself, not only the address: a saved filter that changes the
	// link and leaves the buttons saying something else is two answers on one
	// screen.
	await expect(completed).toHaveAttribute('aria-pressed', 'true');

	// And it survives a reload, because it is the address.
	await page.reload();
	await expect(page.getByRole('button', { name: /^Completed/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Show Done and dusted' })).toBeVisible({
		timeout: 20_000
	});
});
