import { expect, type Page } from '@playwright/test';
import { visit } from './visit';

export async function addLedger(page: Page, name: string, opening?: string, currency = 'KES') {
	if (await page.getByTestId('ledger-balance').count()) {
		await page.getByRole('button', { name: 'Ledgers', exact: true }).click();
		await page
			.getByRole('dialog', { name: 'Ledgers', exact: true })
			.getByRole('button', { name: 'New ledger' })
			.click();
	} else await page.getByRole('button', { name: 'New ledger', exact: true }).click();
	const form = page.getByRole('dialog', { name: 'New ledger', exact: true });
	await form.locator('[name="heading"]').fill(name);
	await form.locator('[name="currency"]').fill(currency);
	if (opening) {
		await form.locator('[name="openingAmount"]').fill(opening);
		await form.locator('[name="openingOn"]').fill('2026-09-01');
	}
	await form.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(form).toBeHidden();
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const tab = page
		.getByRole('navigation', { name: 'Ledgers', exact: true })
		.getByRole('button', { name: new RegExp(`^${escaped}(\\b|$)`) });
	await expect(tab).toBeVisible();
	if ((await tab.getAttribute('aria-current')) === 'page') return;
	await page
		.getByTestId('ledger-balance')
		.filter({ hasText: name })
		.getByRole('button', { name, exact: true })
		.click();
	await expect(tab).toHaveAttribute('aria-current', 'page');
}

export async function balanceJourney(page: Page) {
	await visit(page, '/finance/ledgers');
	await addLedger(page, 'Checked account', '132.62');
	const checked = page.getByTestId('ledger-balance').filter({ hasText: 'Checked account' });
	await expect(checked).toContainText('132.62');
	await expect(checked).toContainText('Supported by opening');
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	const importer = page.getByRole('dialog', { name: 'Import a statement' });
	await importer
		.locator('[name="text"]')
		.fill(
			'Date,Description,Amount\n2026-09-02,Synthetic purchase,-50.00\n2026-08-31,Too early,-1.00'
		);
	await importer.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(importer).toContainText('2026-08-31');
	const csv = 'Date,Description,Amount\n2026-09-02,Synthetic purchase,-50.00';
	await importer.locator('[name="text"]').fill(csv);
	await importer.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(importer).toContainText('1 added, 0 already here.');
	await importer.locator('[name="text"]').fill(csv);
	await importer.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(importer).toContainText('0 added, 1 already here.');
	await importer.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(checked).toContainText('82.62');
	await page.getByRole('button', { name: /^New line/ }).click();
	const manual = page.getByRole('dialog', { name: 'New line', exact: true });
	await manual.locator('[name="heading"]').fill('Earlier recorded movement');
	await manual.locator('[name="occurredOn"]').fill('2026-08-30');
	await manual.locator('[name="amount"]').fill('1.00');
	await manual.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(manual).toBeHidden();
	await expect(checked).toContainText('Outside covered period: 1');
	await expect(checked).toContainText('82.62');
	const checks = page.getByTestId('balance-checks');
	await checks.locator('summary').click();
	await checks.locator('[name="asOf"]').fill('2026-10-01');
	await checks.locator('[name="observedAmount"]').fill('82.62');
	await checks.getByRole('button', { name: 'Record balance check', exact: true }).click();
	await expect(checks.getByTestId('balance-check')).toContainText('Matched');
	await expect(checked).toContainText('Verified at latest check');
	await checks.locator('[name="asOf"]').fill('2026-10-02');
	await checks.locator('[name="observedAmount"]').fill('83.62');
	await checks.getByRole('button', { name: 'Record balance check', exact: true }).click();
	const different = checks.getByTestId('balance-check').filter({ hasText: 'Different' });
	await expect(checks.getByTestId('balance-check')).toHaveCount(2);
	await expect(different).toContainText('Observed minus computed:');
	await expect(different).toContainText('1.00');
	const remove = different.getByRole('button', { name: 'Delete this balance check', exact: true });
	await remove.click();
	await expect(different).toBeVisible();
	await different.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(different).toHaveCount(0);
	await expect(checked).toContainText('Verified at latest check');
	await addLedger(page, 'Supported account', '100.00');
	await addLedger(page, 'Partial account');
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	const partialImport = page.getByRole('dialog', { name: 'Import a statement' });
	await partialImport.locator('[name="text"]').fill(csv);
	await partialImport.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(partialImport).toContainText('No opening is declared.');
	await partialImport.getByRole('button', { name: 'Done', exact: true }).click();
	await addLedger(page, 'Unknown account', undefined, '');
	await expect(
		page.getByTestId('ledger-balance').filter({ hasText: 'Unknown account' })
	).toContainText('Set this ledger’s currency');
	for (const width of [1200, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await expect(checked).toContainText('Verified at latest check');
		await expect(
			page.getByTestId('ledger-balance').filter({ hasText: 'Supported account' })
		).toContainText('Supported by opening');
		await expect(
			page.getByTestId('ledger-balance').filter({ hasText: 'Partial account' })
		).toContainText('Recorded movements only');
		const group = page.getByTestId('currency-funds').filter({ hasText: 'KES' });
		await expect(group).toContainText('182.62');
		await expect(group).toContainText('Excluded: Partial account');
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
	}
	// The summary remains present in the DOM and keyboard-reachable, not tooltip-only.
	await checked.getByRole('button', { name: 'Checked account', exact: true }).focus();
	await expect(checked.getByRole('button', { name: 'Checked account', exact: true })).toBeFocused();
}
