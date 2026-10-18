import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';
import { balanceJourney } from './helpers/finance-balances';

test('declared openings, statement checks, partial imports and currency subtotals', async ({
	page
}) => {
	test.setTimeout(180_000);
	await register(page, testEmail('finance-balances'));
	await balanceJourney(page);
	await visit(page, '/');
	const funds = page.getByRole('region', { name: 'Supported funds' });
	await expect(funds).toContainText('182.62');
	await expect(funds).toContainText('Excluded: Partial account');
});
