import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A ledger, a statement imported into it, rules that sort what arrived, and
 * the plots that read the result. The whole finance loop, in the order
 * somebody actually does it.
 */
const CONTA_CORRENTE = [
	'Data,Valor,Identificador,Descrição',
	'02/03/2026,-50.00,69a56b21-aefd-499f-a59f-929256b31ea7,Compra no débito - Mercado Bom Preço',
	'05/03/2026,1200.00,7b0aa001-0000-4000-8000-000000000001,Transferência recebida pelo Pix - ACME LTDA'
].join('\n');

test('a ledger, its statement, the rules and the plots', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('finance'));

	// The finance door opens on Ledgers.
	await visit(page, '/finance');
	await expect(page).toHaveURL(/\/finance\/ledgers/);

	// A ledger, with the export it usually receives.
	await page.getByRole('button', { name: 'New ledger' }).click();
	await page.locator('[name="heading"]').fill('Current account');
	await page.locator('[name="defaultParser"]').selectOption('nubank:conta_corrente');
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(page.getByRole('button', { name: /^Current account Account/ })).toBeVisible();

	// Its statement, pasted. The parser is already the ledger's own.
	await page.getByRole('button', { name: 'Import', exact: true }).click();
	const importer = page.getByRole('dialog');
	await expect(importer.locator('[name="source"]')).toHaveValue('nubank:conta_corrente');
	await importer.locator('[name="text"]').fill(CONTA_CORRENTE);
	await importer.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(importer.getByText('2 added, 0 already here.')).toBeVisible();

	// The same file again adds nothing.
	await importer.locator('[name="text"]').fill(CONTA_CORRENTE);
	await importer.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(importer.getByText('0 added, 2 already here.')).toBeVisible();
	await importer.getByRole('button', { name: 'Done' }).click();

	// The statement is drawn twice — a table at this width, a list at a
	// phone's — so the row is asked for in the one that is showing.
	await expect(page.getByRole('cell', { name: /Mercado Bom Preço/ })).toBeVisible();

	// A category rule sorts the line that was already there — and can be
	// rewritten afterwards, which re-sorts it again.
	await page.getByRole('link', { name: 'Rules', exact: true }).click();
	const categories = page.locator('section', { hasText: 'Categories' }).last();
	await categories.locator('[name="heading"]').fill('Groceries');
	await categories.locator('[name="pattern"]').fill('mercado');
	await categories.getByRole('button', { name: 'Add' }).click();
	await expect(categories.getByText('/mercado/i')).toBeVisible();

	await categories.getByRole('button', { name: 'Edit Groceries' }).click();
	await categories.locator('[name="heading"]').first().fill('Food');
	await categories.locator('[name="pattern"]').first().fill('mercado|padaria');
	await categories.getByRole('button', { name: 'Save' }).click();
	await expect(categories.getByText('/mercado|padaria/i')).toBeVisible();

	/*
	 * A count is not an answer to "is this pattern right"; which lines is.
	 * Pressing the number opens them under the two columns, and the pile
	 * nothing claims opens the same way.
	 */
	await categories.getByTitle('Which lines this claims').first().click();
	await page.waitForURL(/showing=/);
	await expect(page.getByRole('heading', { name: 'Food' })).toBeVisible();
	await expect(page.getByText('Mercado Bom Preço')).toBeVisible();

	await page.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByText('Mercado Bom Preço')).toHaveCount(0);

	// The line wears the category now — in its own column, and washing the row.
	await page.getByRole('link', { name: 'Ledgers', exact: true }).click();
	await page.waitForURL(/\/finance\/ledgers/);
	await expect(
		page.locator('tr', { hasText: 'Mercado Bom Preço' }).getByText('Food')
	).toBeVisible();

	// And Insights reads it back.
	await page.getByRole('link', { name: 'Insights', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'In and out' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'What each month was made of' })).toBeVisible();
	await expect(page.getByText('Biggest category')).toBeVisible();
});
