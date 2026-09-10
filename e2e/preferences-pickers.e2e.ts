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

	// Wait for the form to say it saved before leaving the page. Navigating on
	// the click alone raced the request that the click started, and lost often
	// enough to fail a full run and pass on its own.
	await expect(page.getByText('Week saved.')).toBeVisible();

	await visit(page, '/settings/preferences');
	// The IANA name is what is stored; the label is only how it reads.
	await expect(page.locator('select[name="timezone"]')).toHaveValue('Europe/Lisbon');
	await expect(page.locator('select[name="timezone"] option:checked')).toContainText('Lisbon');
});

/**
 * And the order it is in, which is the whole reason it is usable.
 *
 * Grouped by continent, finding a zone meant knowing which continent the IANA
 * name files it under and then scrolling an alphabet. The offset is the thing
 * somebody actually knows about their own timezone, because the clock in front
 * of them says it.
 */
test('the timezones run west to east, by offset', async ({ page }) => {
	await register(page, `tz-order-${Date.now()}@test.invalid`);
	await visit(page, '/settings/preferences');

	const headings = await page
		.locator('select[name="timezone"] optgroup')
		.evaluateAll((groups) => groups.map((g) => g.getAttribute('label') ?? ''));

	expect(headings.length).toBeGreaterThan(20);
	expect(headings[0]).toMatch(/^GMT−/);
	expect(headings.at(-1)).toMatch(/^GMT\+/);

	// Read back as numbers, in the order they are drawn.
	const minutes = headings.map((h) => {
		const m = /^GMT([−+])(\d{1,2})(?::(\d{2}))?$/.exec(h);
		if (!m) throw new Error(`a heading that is not an offset: ${h}`);
		return (m[1] === '−' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
	});
	expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
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
	await expect(page.getByText('Currency saved.')).toBeVisible();

	await visit(page, '/settings/preferences');
	await expect(page.locator('input[aria-label="Currency code"]')).toHaveValue('PLN');
});
