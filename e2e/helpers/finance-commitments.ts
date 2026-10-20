import { expect, type Page } from '@playwright/test';
import { visit } from './visit';
import { addLedger } from './finance-balances';

async function stock(page: Page, name: string, kind: string, opening: string) {
	await page.getByRole('button', { name: 'New commitment', exact: true }).last().click();
	const dialog = page.getByRole('dialog', { name: 'New commitment', exact: true });
	await dialog.locator('[name="heading"]').fill(name);
	await dialog.locator('[name="kind"]').selectOption(kind);
	await dialog.locator('[name="currency"]').fill('KES');
	await dialog.locator('[name="openingAmount"]').fill(opening);
	await dialog.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByTestId('commitment').filter({ hasText: name })).toContainText(opening);
}

async function movement(page: Page, name: string, amount: string, incoming = false) {
	await page.getByRole('button', { name: /^New line/ }).click();
	const dialog = page.getByRole('dialog', { name: 'New line', exact: true });
	await dialog.locator('[name="heading"]').fill(name);
	await dialog.locator('[name="occurredOn"]').fill('2026-10-17');
	await dialog.locator('[name="amount"]').fill(amount);
	await dialog.locator('[name="direction"]').selectOption(incoming ? 'in' : 'out');
	await dialog.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(dialog).toBeHidden();
}

async function confirm(page: Page, title: string) {
	const dialog = page.getByRole('dialog', { name: title, exact: true });
	const button = dialog.getByRole('button', { name: 'Confirm', exact: true });
	await expect(button).toBeEnabled();
	await button.click();
	await expect(dialog).toBeHidden();
}

async function payment(
	page: Page,
	name: string,
	action: string,
	description: string,
	balance: string
) {
	await page.getByTestId('commitment').getByRole('link', { name, exact: true }).click();
	await page
		.getByTestId('commitment-history')
		.getByRole('button', { name: action, exact: true })
		.click();
	const dialog = page.getByRole('dialog', { name: action, exact: true });
	await expect(dialog.locator('[name="transactionId"]')).toBeVisible();
	const value = await dialog
		.locator('option')
		.filter({ hasText: description })
		.getAttribute('value');
	await dialog.locator('[name="transactionId"]').selectOption(value!);
	await expect(dialog).toContainText('Stock after payment');
	await expect(dialog).toContainText(balance);
	await confirm(page, action);
	await expect(page.getByTestId('commitment-history')).toContainText(balance);
	await expect(page.getByTestId('commitment-entry')).toHaveCount(1);
}

export async function commitmentJourney(page: Page) {
	await visit(page, '/finance/commitments');
	for (const name of ['Custody', 'Payable', 'Receivable', 'Reserve'])
		await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Custody', exact: true })).toContainText(
		'Money you hold for somebody else.'
	);
	await stock(page, 'Custody owner', 'custody', '100.00');
	await stock(page, 'Owner payable', 'payable', '100.00');
	await stock(page, 'Repayment owed', 'receivable', '30.00');
	await stock(page, 'Family earmark', 'reserve', '50.00');

	await visit(page, '/finance/ledgers');
	await addLedger(page, 'Stock evidence account', '5000.00');
	await movement(page, 'Mixed payment', '2500.00');
	await movement(page, 'Owner expense', '10.00');
	await movement(page, 'Family support', '5.00');
	await movement(page, 'Incoming repayment', '3.00', true);
	const bank = page.getByTestId('ledger-balance').filter({ hasText: 'Stock evidence account' });
	const bankAmount = ((500000 - 250000 - 1000 - 500 + 300) / 100).toLocaleString('en-US', {
		minimumFractionDigits: 2
	});
	await expect(bank).toContainText(bankAmount);
	const row = page.locator('[data-row]:visible').filter({ hasText: 'Mixed payment' });
	await row.getByRole('button', { name: 'Edit this line', exact: true }).click();
	const editor = page.getByRole('dialog').filter({ has: page.getByTestId('movement-split') });
	const split = page.getByTestId('movement-split');
	const parts = split.locator('fieldset');
	await parts.nth(0).getByLabel('Amount', { exact: false }).fill('-2475.00');
	await parts.nth(1).getByLabel('Amount', { exact: false }).fill('-24.00');
	await expect(split.getByRole('button', { name: 'Save split', exact: true })).toBeDisabled();
	await expect(split.getByRole('status')).toContainText('1.00');
	await parts.nth(1).getByLabel('Amount', { exact: false }).fill('-25.00');
	const payableId = await parts
		.nth(1)
		.locator('option')
		.filter({ hasText: 'Owner payable' })
		.getAttribute('value');
	await parts.nth(1).locator('[name="partCommitmentId"]').selectOption(payableId!);
	await split.getByRole('button', { name: 'Save split', exact: true }).click();
	await expect(split).toContainText('View commitment history');
	await split.getByRole('button', { name: 'Remove split', exact: true }).click();
	await split.getByRole('button', { name: 'Remove split', exact: true }).click();
	await expect(editor).toContainText('Reverse the linked commitment entry');
	await editor.getByRole('button', { name: 'Cancel', exact: true }).last().click();
	await expect(row).toContainText('Split this movement');
	await expect(bank).toContainText(bankAmount);

	await visit(page, '/finance/commitments');
	await page
		.getByTestId('commitment')
		.getByRole('link', { name: 'Owner payable', exact: true })
		.click();
	await expect(page.getByTestId('commitment-history')).toContainText('75.00');
	await expect(page.getByTestId('commitment-entry')).toHaveCount(1);
	await page.getByRole('button', { name: 'Reverse entry', exact: true }).click();
	await confirm(page, 'Reverse entry');
	await expect(page.getByTestId('commitment-entry')).toHaveCount(0);
	await visit(page, '/finance/ledgers');
	await row.getByRole('button', { name: 'Edit this line', exact: true }).click();
	await split.getByRole('button', { name: 'Remove split', exact: true }).click();
	await split.getByRole('button', { name: 'Remove split', exact: true }).click();
	await expect(split.getByRole('button', { name: 'Save split', exact: true })).toBeVisible();
	await editor.getByRole('button', { name: 'Cancel', exact: true }).last().click();
	await expect(row).not.toContainText('Split this movement');
	await expect(bank).toContainText(bankAmount);

	await visit(page, '/finance/commitments');
	await payment(page, 'Owner payable', 'Settle', 'Owner expense', '90.00');
	await payment(page, 'Family earmark', 'Consume reserve', 'Family support', '45.00');
	await payment(page, 'Repayment owed', 'Settle', 'Incoming repayment', '27.00');
	await page
		.getByTestId('commitment')
		.getByRole('link', { name: 'Custody owner', exact: true })
		.click();
	const history = page.getByTestId('commitment-history');
	await history.getByRole('button', { name: 'Edit', exact: true }).click();
	const edit = page.getByRole('dialog', { name: 'Edit commitment', exact: true });
	await edit.locator('[name="notes"]').fill('Synthetic custody evidence');
	await edit.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(edit).toBeHidden();
	const adjustment = history.getByRole('form', { name: 'Stock adjustment', exact: true });
	await adjustment.locator('[name="amount"]').fill('1.00');
	await adjustment.getByRole('button', { name: 'Record adjustment', exact: true }).click();
	await expect(history).toContainText('101.00');
	await history.getByRole('button', { name: 'Close commitment', exact: true }).click();
	const close = page.getByRole('dialog', { name: 'Close commitment', exact: true });
	await expect(close.locator('[name="writeOffNote"]')).toHaveAttribute('required', '');
	await close.locator('[name="writeOffNote"]').fill('Explicit synthetic residual write-off');
	await confirm(page, 'Close commitment');
	await expect(history).toContainText('Explicit synthetic residual write-off');
	await expect(page.getByTestId('commitment').filter({ hasText: 'Custody owner' })).toHaveCount(0);
	await page.getByRole('link', { name: 'Settled and archived', exact: true }).click();
	await page
		.getByTestId('commitment')
		.getByRole('link', { name: 'Custody owner', exact: true })
		.click();
	await history.getByRole('button', { name: 'Delete', exact: true }).click();
	await confirm(page, 'Delete');
	await page.getByRole('link', { name: 'Settled and archived', exact: true }).click();
	await page
		.getByTestId('commitment')
		.getByRole('link', { name: 'Custody owner', exact: true })
		.click();
	await history.getByRole('button', { name: 'Delete permanently', exact: true }).click();
	await confirm(page, 'Delete');
	await expect(page.getByTestId('commitment').filter({ hasText: 'Custody owner' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Commitments', exact: true })).toBeVisible();
	await page.reload();
	await page.getByRole('link', { name: 'Current', exact: true }).click();
	await expect(page.getByTestId('commitment').filter({ hasText: 'Owner payable' })).toContainText(
		'90.00'
	);
	await page
		.getByTestId('commitment')
		.getByRole('link', { name: 'Owner payable', exact: true })
		.focus();
	await expect(
		page.getByTestId('commitment').getByRole('link', { name: 'Owner payable', exact: true })
	).toBeFocused();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await visit(page, '/finance/ledgers');
	await expect(bank).toContainText(bankAmount);
}
