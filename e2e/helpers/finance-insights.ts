import { expect, type Page } from '@playwright/test';
import { addLedger } from './finance-balances';
import { visit } from './visit';

export async function insightsJourney(page: Page) {
	await visit(page, '/finance/ledgers');
	await addLedger(page, 'Insights source');
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	const importer = page.getByRole('dialog', { name: 'Import a statement' });
	await importer
		.locator('[name="text"]')
		.fill(
			[
				'Date,Description,Amount',
				'2026-09-30,Transport September,-4500.00',
				'2026-10-01,Transport October,-1200.00',
				'2026-10-02,Transport refund,400.00',
				'2026-10-03,Transport transfer,-2500.00',
				'2026-10-04,Transport cash,-5000.00',
				'2026-10-31,Transport assumed,-100.00'
			].join('\n')
		);
	await importer.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(importer).toContainText('6 added, 0 already here.');
	await importer.getByRole('button', { name: 'Done', exact: true }).click();
	for (const kind of ['refund', 'transfer', 'cash']) {
		const row = page.locator('[data-row]:visible').filter({ hasText: `Transport ${kind}` });
		await row.locator('[name="ids"]').check();
		const classification = page.locator('form#classify');
		await classification.locator('[name="kind"]').selectOption(kind);
		await classification.getByRole('button', { name: 'Classify selected', exact: true }).click();
		await expect(classification).toBeHidden();
	}
	await visit(page, '/finance/rules');
	await page.getByRole('button', { name: 'New category', exact: true }).click();
	const rule = page.getByRole('dialog', { name: 'New rule', exact: true });
	await rule.locator('[name="heading"]').fill('Transport');
	await rule.locator('[name="pattern"]').fill('Transport');
	await rule.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(rule).toBeHidden();

	await visit(page, '/finance/insights?month=2026-10&currency=KES');
	await expect(page.getByTestId('spending-context')).toContainText('2026-10-01 to 2026-10-31');
	await expect(page.getByTestId('spending-context')).toContainText('No verified balance');
	await expect(page.getByTestId('spending-totals')).toContainText('1,300.00');
	await expect(page.getByTestId('spending-totals')).toContainText('400.00');
	await expect(page.getByTestId('spending-totals')).toContainText('900.00');
	const exclusions = page.getByTestId('spending-exclusions');
	await expect(exclusions).toContainText('Transfers: 1');
	await expect(exclusions).toContainText('2,500.00');
	await expect(exclusions).toContainText('Cash withdrawn, use unknown: 1');
	await expect(exclusions).toContainText('5,000.00');
	await expect(exclusions).toContainText('1 unmatched refunds');
	await expect(page.getByTestId('spending-category')).toContainText('Transport');
	await exclusions.getByRole('link', { name: /2 unclassified movements/ }).click();
	await expect(page.getByTestId('unclassified-review')).toBeVisible();
	await expect(page.getByTestId('unclassified-movement')).toHaveCount(2);
	await expect(page.getByTestId('unclassified-review')).not.toContainText('Transport September');
	await expect(page.getByTestId('unclassified-review')).not.toContainText('Transport transfer');

	await visit(page, '/finance/insights?month=2026-10&currency=KES');
	await page.getByLabel('Month', { exact: true }).fill('2026-09');
	await expect(page).toHaveURL(/month=2026-09/);
	await expect(page.getByTestId('spending-context')).toContainText('2026-09-01 to 2026-09-30');
	await expect(page.getByTestId('spending-totals')).toContainText('4,500.00');
	await expect(page.getByTestId('spending-exclusions')).toContainText('Transfers: 0');
	await page.getByLabel('Month', { exact: true }).fill('2026-11');
	await expect(page).toHaveURL(/month=2026-11/);
	await expect(
		page.getByText('No recorded activity in this period.', { exact: true })
	).toBeVisible();
	await expect(page.getByTestId('spending-totals')).toHaveCount(0);
	await page.reload();
	await expect(
		page.getByText('No recorded activity in this period.', { exact: true })
	).toBeVisible();
	await page.getByLabel('Month', { exact: true }).focus();
	await expect(page.getByLabel('Month', { exact: true })).toBeFocused();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
