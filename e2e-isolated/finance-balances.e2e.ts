import { expect, test } from '@playwright/test';
import { balanceJourney } from '../e2e/helpers/finance-balances';

test('finance openings and observations work and persist in the shipped isolated app', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.goto('/');
	const tour = page.getByRole('dialog', { name: 'Tutorial' });
	await expect(tour).toBeVisible({ timeout: 20_000 });
	await tour.getByRole('button', { name: 'Dismiss', exact: true }).click();
	await balanceJourney(page);
	await page.reload();
	await expect(
		page.getByTestId('ledger-balance').filter({ hasText: 'Checked account' })
	).toContainText('Verified at latest check');
	await expect(page.getByTestId('currency-funds').filter({ hasText: 'KES' })).toContainText(
		'182.62'
	);
});
