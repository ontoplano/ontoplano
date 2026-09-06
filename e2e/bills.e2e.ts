import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The Finance section's first tab, driven the way a person uses it.
 *
 * A bill is added, marked paid for the amount that was actually paid, and the
 * month summary moves — the expected/paid/gap line is the point of the page,
 * so it is what the test watches. Then the payment is undone, because the undo
 * is the promise: nothing here is a one-way door.
 */
test('a bill can be added, paid for a real amount, and unpaid', async ({ page }) => {
	await register(page, `bills-${Date.now()}@example.test`);

	await visit(page, '/finance/bills');
	await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible();

	// Add a monthly bill through the modal.
	await page.getByRole('button', { name: /New bill/ }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('[name="heading"]').fill('Rent');
	await dialog.locator('[name="amount"]').fill('1200,00');
	await dialog.locator('[name="dueDay"]').fill('5');
	await dialog.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(page.getByText('Rent')).toBeVisible();

	// Edit it — the amount changes, and the month summary follows.
	await page.locator('li', { hasText: 'Rent' }).getByRole('button', { name: 'Edit Rent' }).click();
	const edit = page.getByRole('dialog');
	await edit.locator('[name="amount"]').fill('1300,00');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('li', { hasText: 'Rent' }).getByText(/1,300/)).toBeVisible();

	// Mark it paid for a little over — the box takes the real amount.
	await page.locator('li', { hasText: 'Rent' }).getByRole('button', { name: 'Mark paid' }).click();
	await page.locator('li', { hasText: 'Rent' }).locator('[name="amount"]').fill('1315,00');
	await page
		.locator('li', { hasText: 'Rent' })
		.getByRole('button', { name: 'Paid', exact: true })
		.click();

	// The row says paid, and the month is over plan by the difference.
	await expect(page.locator('li', { hasText: 'Rent' }).getByText('paid')).toBeVisible();
	await expect(page.getByText(/over/)).toBeVisible();

	// Phone size, because this ships on the phone too.
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByText('Rent')).toBeVisible();
	await page.screenshot({ path: 'test-results/bills-phone.png' });

	// Undo the payment — back to unpaid.
	await page.setViewportSize({ width: 1200, height: 900 });
	await page.locator('li', { hasText: 'Rent' }).getByRole('button', { name: 'Undo' }).click();
	await expect(
		page.locator('li', { hasText: 'Rent' }).getByRole('button', { name: 'Mark paid' })
	).toBeVisible();
});

test('a weekly bill settles into its week', async ({ page }) => {
	await register(page, `bills-weekly-${Date.now()}@example.test`);
	await visit(page, '/finance/bills');

	await page.getByRole('button', { name: /New bill/ }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('[name="heading"]').fill('Cleaner');
	await dialog.locator('[name="amount"]').fill('120,00');
	await dialog.locator('[name="rhythm"]').selectOption('weekly');
	await dialog.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(page.getByText('Cleaner')).toBeVisible();
	await expect(page.locator('li', { hasText: 'Cleaner' }).getByText(/Weekly/)).toBeVisible();

	await page
		.locator('li', { hasText: 'Cleaner' })
		.getByRole('button', { name: 'Mark paid' })
		.click();
	await page
		.locator('li', { hasText: 'Cleaner' })
		.getByRole('button', { name: 'Paid', exact: true })
		.click();
	await expect(page.locator('li', { hasText: 'Cleaner' }).getByText('paid')).toBeVisible();
});

test('an archived bill can be deleted, behind a confirmation', async ({ page }) => {
	await register(page, `bills-del-${Date.now()}@example.test`);
	await visit(page, '/finance/bills');

	await page.getByRole('button', { name: /New bill/ }).click();
	const add = page.getByRole('dialog');
	await add.locator('[name="heading"]').fill('Old subscription');
	await add.locator('[name="amount"]').fill('9,90');
	await add.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Old subscription')).toBeVisible();

	// Archive it, then open the archived list.
	await page
		.locator('li', { hasText: 'Old subscription' })
		.getByRole('button', { name: 'Archive Old subscription' })
		.click();
	await page.getByRole('button', { name: /Archived/ }).click();

	// Delete asks first — the confirm button is in its own dialog, not under the
	// trash icon that was clicked.
	await page
		.locator('li', { hasText: 'Old subscription' })
		.getByRole('button', { name: 'Delete Old subscription' })
		.click();
	const confirm = page.getByRole('dialog');
	await expect(confirm.getByText(/deleted for good/)).toBeVisible();
	// The Delete button is armed — a beat before it takes the click.
	await page.waitForTimeout(600);
	await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

	await expect(page.getByText('Old subscription')).toHaveCount(0);
});
