import { expect, test } from '@playwright/test';
import { visit } from './helpers/visit';

/**
 * Signing in with somebody else's account.
 *
 * The suite runs with no provider credentials, which is the deployment that
 * matters most here: an instance offering a button that opens Google and comes
 * back with "invalid client" is worse than one offering nothing.
 */
test('an instance with no credentials offers no social buttons', async ({ page }) => {
	await visit(page, '/login');

	await expect(page.getByRole('button', { name: /continue with/i })).toHaveCount(0);
	await expect(page.getByText('or', { exact: true })).toHaveCount(0);

	// And the ordinary way in is untouched.
	await expect(page.locator('input[name=email]')).toBeVisible();
	await expect(page.locator('input[name=password]')).toBeVisible();
});
