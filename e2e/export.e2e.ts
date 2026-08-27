import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

/**
 * The daily export allowance.
 *
 * A plain `<a download>` never re-renders the page, so the count only caught up
 * on a reload and nothing stopped a double-click spending two at once. Both are
 * about *when* the page learns what the server already knows.
 */
test('the allowance updates the moment an export lands', async ({ page }) => {
	await register(page, `export-${Date.now()}@test.invalid`);
	await page.goto('/settings/account', { waitUntil: 'networkidle' });

	const download = page.getByRole('button', { name: /download/i });
	const count = page.getByText(/exports? left today/i);

	await expect(download).toBeEnabled();
	const before = Number((await count.innerText()).match(/^(\d+)/)![1]);

	const file = page.waitForEvent('download');
	await download.click();
	await file;

	// The number changes without a reload, which is the whole complaint.
	await expect(count).toContainText(`${before - 1} of`);

	// And the button is held, so the second click of a double lands on nothing.
	await expect(download).toBeDisabled();
	await expect(download).toBeEnabled({ timeout: 10_000 });
});
