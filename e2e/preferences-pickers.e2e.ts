import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The two settings that used to be free text with no floor under them.
 *
 * A timezone typed by hand puts every date in the app a day out with nothing on
 * screen to say why, and a currency was one of eight — so anybody paid in zloty
 * or rand could not record what they spend.
 */
test('the timezone is chosen, not typed', async ({ page }) => {
	await register(page, `tz-${Date.now()}@test.invalid`);
	await visit(page, '/settings/preferences');

	const picker = page.locator('select[name="timezone"]');
	await expect(picker).toBeVisible();
	// The whole platform's list, not a handful.
	expect(await picker.locator('option').count()).toBeGreaterThan(300);

	await picker.selectOption('Europe/Lisbon');
	await page.locator('form', { has: picker }).getByRole('button', { name: 'Save' }).click();

	await visit(page, '/settings/preferences');
	// The IANA name is what is stored; the label is only how it reads.
	await expect(page.locator('select[name="timezone"]')).toHaveValue('Europe/Lisbon');
	await expect(page.locator('select[name="timezone"] option:checked')).toContainText('Lisbon');
});

test('a currency outside the shortlist is accepted, and a made-up one is not', async ({ page }) => {
	await register(page, `cur-${Date.now()}@test.invalid`);
	await visit(page, '/settings/preferences');

	const form = page.locator('form[action="?/saveCurrency"]');
	await form.locator('select[aria-label="Currency"]').selectOption('__other__');

	const code = form.locator('input[aria-label="Currency code"]');
	await code.fill('ZZZ');
	// `Intl.NumberFormat` renders any three letters, which is why the check is
	// the platform's currency list and not "will it format".
	await expect(page.getByText(/ZZZ is not a currency code/)).toBeVisible();
	await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();

	await code.fill('pln');
	await expect(page.getByText(/Polish Zloty/i)).toBeVisible();
	await form.getByRole('button', { name: 'Save' }).click();

	await visit(page, '/settings/preferences');
	await expect(page.locator('input[aria-label="Currency code"]')).toHaveValue('PLN');
});
