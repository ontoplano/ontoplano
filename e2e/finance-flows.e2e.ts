import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Income is a bill pointed the other way, statements land deduplicated, the
 * rules sort what is already there, and Net draws both stories without ever
 * merging them.
 */
const CONTA_CORRENTE = [
	'Data,Valor,Identificador,Descrição',
	'02/03/2026,-50.00,69a56b21-aefd-499f-a59f-929256b31ea7,Compra no débito - Mercado Bom Preço',
	'05/03/2026,1200.00,7b0aa001-0000-4000-8000-000000000001,Transferência recebida pelo Pix - ACME LTDA'
].join('\n');

test('income, an imported statement, and the net of it', async ({ page }) => {
	await register(page, `finance-${Date.now()}@test.invalid`);

	// The finance door opens on Income.
	await visit(page, '/finance');
	await expect(page).toHaveURL(/\/finance\/income/);
	await page.getByRole('button', { name: 'New income' }).click();
	await page.locator('[name="heading"]').fill('Salary');
	await page.locator('[name="amount"]').fill('8500.00');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Salary')).toBeVisible();
	await page.getByRole('button', { name: 'Mark Salary received' }).click();
	await page.getByRole('button', { name: 'Received', exact: true }).click();
	await expect(page.getByText('received', { exact: true })).toBeVisible();

	// And it is not a bill.
	await page.getByRole('link', { name: 'Bills', exact: true }).click();
	await expect(page.getByText('No bills yet')).toBeVisible();

	// A statement, pasted. The same file twice adds nothing.
	await page.getByRole('link', { name: 'Transactions', exact: true }).click();
	await page.getByRole('button', { name: 'or paste it' }).click();
	await page.locator('[name="text"]').fill(CONTA_CORRENTE);
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(page.getByText('2 added, 0 already here.')).toBeVisible();
	await page.locator('[name="text"]').fill(CONTA_CORRENTE);
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(page.getByText('0 added, 2 already here.')).toBeVisible();

	// A category rule sorts the line that was already here.
	const categoryForm = page
		.locator('form[action="?/createRule"]')
		.filter({ has: page.locator('input[value="category"]') });
	await categoryForm.locator('[name="heading"]').fill('Groceries');
	await categoryForm.locator('[name="pattern"]').fill('mercado');
	await categoryForm.getByRole('button', { name: 'Add' }).click();
	await expect(
		page.locator('tr', { hasText: 'Mercado Bom Preço' }).getByText('Groceries')
	).toBeVisible();

	// Net shows both stories, separately.
	await page.getByRole('link', { name: 'Net', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'From your records' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'From your statements' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Where 2026-03 went' })).toBeVisible();
	await expect(page.getByRole('listitem').filter({ hasText: 'Groceries' })).toBeVisible();
});
