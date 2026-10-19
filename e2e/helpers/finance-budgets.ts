import { expect, type Page } from '@playwright/test';
import { addLedger } from './finance-balances';
import { visit } from './visit';

async function createBudget(page: Page, month: string, amount: string) {
	await page.getByRole('button', { name: 'New budget', exact: true }).last().click();
	const form = page.getByRole('dialog', { name: 'New budget', exact: true });
	await form.getByLabel('Month', { exact: true }).fill(month);
	await form.getByLabel('Category', { exact: true }).selectOption('Transport');
	await form.getByLabel('Currency', { exact: true }).selectOption('KES');
	await form.getByLabel('Allocated amount', { exact: true }).fill(amount);
	await form.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(form).toBeHidden();
}

export async function budgetJourney(page: Page) {
	await visit(page, '/finance/ledgers');
	await addLedger(page, 'Budget source');
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	const importer = page.getByRole('dialog', { name: 'Import a statement' });
	await importer
		.locator('[name="text"]')
		.fill(
			'Date,Description,Amount\n2026-09-30,Transport budget expense,-4500.00\n2026-10-03,October returned payment,400.00'
		);
	await importer.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(importer).toContainText('2 added, 0 already here.');
	await importer.getByRole('button', { name: 'Done', exact: true }).click();
	const refund = page.locator('[data-row]:visible').filter({ hasText: 'October returned payment' });
	await refund.getByRole('button', { name: 'Edit this line', exact: true }).click();
	const editor = page.getByRole('dialog').filter({ has: page.locator('[name="parentId"]') });
	const parent = await editor
		.locator('[name="parentId"] option')
		.filter({ hasText: 'Transport budget expense' })
		.getAttribute('value');
	await editor.locator('[name="parentId"]').selectOption(parent!);
	await editor.getByRole('button', { name: 'Link to this line', exact: true }).click();
	await expect(editor).toBeHidden();
	await visit(page, '/finance/rules');
	await page.getByRole('button', { name: 'New category', exact: true }).click();
	const rule = page.getByRole('dialog', { name: 'New rule', exact: true });
	await rule.locator('[name="heading"]').fill('Transport');
	await rule.locator('[name="pattern"]').fill('Transport');
	await rule.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(rule).toBeHidden();

	await visit(page, '/finance/budgets?month=2026-09');
	await createBudget(page, '2026-09', '6000.00');
	await expect(page.getByTestId('budget-progress')).toContainText('6,000.00');
	await expect(page.getByTestId('budget-progress')).toContainText('4,500.00');
	await expect(page.getByTestId('budget-progress')).toContainText('1,500.00');
	await page.getByRole('button', { name: 'Edit budget', exact: true }).click();
	const edit = page.getByRole('dialog', { name: 'Edit budget', exact: true });
	await edit.getByLabel('Allocated amount', { exact: true }).fill('7000.00');
	await edit.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(edit).toBeHidden();
	await expect(page.getByTestId('budget-progress')).toContainText('2,500.00');
	await visit(page, '/finance/insights?month=2026-09&currency=KES');
	await expect(page.getByTestId('budget-progress')).toContainText('2,500.00');

	await visit(page, '/finance/budgets?month=2026-10');
	await createBudget(page, '2026-10', '2000.00');
	await expect(page.getByTestId('budget-progress')).toContainText('2,000.00');
	await expect(page.getByTestId('budget-progress')).toContainText('400.00');
	await page.getByRole('button', { name: 'Copy from last month', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Added');
	await expect(page.getByTestId('budget-progress')).toContainText('2,000.00');
	await expect(page.getByTestId('budget-progress')).not.toContainText('7,000.00');
	await page.reload();
	await expect(page.getByTestId('budget-progress')).toContainText('400.00');
	await visit(page, '/finance/rules');
	await page.getByRole('button', { name: 'Edit Transport', exact: true }).click();
	const rename = page.getByRole('dialog', { name: 'Edit rule', exact: true });
	await rename.locator('[name="heading"]').fill('Travel');
	await rename.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(rename).toBeHidden();
	// A rename carries the ceiling with it; the budget keeps its amount and
	// follows the new category name instead of becoming an orphan.
	await visit(page, '/finance/budgets?month=2026-10');
	await expect(page.getByTestId('budget-progress')).toContainText('Travel');
	await expect(page.getByTestId('budget-progress')).not.toContainText('Category no longer exists');
	await expect(page.getByTestId('budget-progress')).toContainText('2,000.00');
	await page.getByRole('button', { name: 'Delete budget', exact: true }).click();
	await expect(page.getByTestId('budget-progress')).toHaveCount(1);
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByTestId('budget-progress').getByTestId('row')).toHaveCount(0);
	// A category can be made from inside the dialog and is saved as a rule.
	await page.getByRole('button', { name: 'New budget', exact: true }).first().click();
	const inline = page.getByRole('dialog', { name: 'New budget', exact: true });
	await inline.getByRole('button', { name: 'New category', exact: true }).click();
	await inline.locator('#budget-new-category').fill('Inline rule');
	await inline.getByRole('button', { name: 'Create category', exact: true }).click();
	await expect(inline.getByRole('status').filter({ hasText: 'created' })).toBeVisible();
	await inline.getByLabel('Category', { exact: true }).selectOption('Inline rule');
	await inline.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.getByLabel('Month', { exact: true }).focus();
	await expect(page.getByLabel('Month', { exact: true })).toBeFocused();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
