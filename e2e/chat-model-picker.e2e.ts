import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The model is chosen from what the key can actually reach.
 *
 * It was a text box, which only works for somebody who already has the
 * provider's documentation open — and the answer changes every few months, so
 * a list written into this app would be wrong by the time anybody read it.
 *
 * This drives the path against the real provider with a key it will refuse,
 * because that is the half most people meet: what matters is that the app
 * hands back the company's own sentence rather than a number.
 */
test('the model is asked for, and a refused key says why', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('chat-model'));
	await visit(page, '/settings/integrations/chat');

	const ask = page.getByRole('button', { name: 'Ask the provider what it offers' });
	await expect(ask).toBeVisible({ timeout: 30_000 });

	// Nothing to ask with until there is a key.
	await expect(ask).toBeDisabled();
	await page.locator('[name="key"]').first().fill('sk-ant-not-a-real-key');
	await expect(ask).toBeEnabled();

	await ask.click();

	// The provider's own words, not "401", and not its JSON either.
	const said = page.locator('.text-red-600').first();
	await expect(said).toContainText(/provider answered/i, { timeout: 30_000 });
	await expect(said).not.toContainText('request_id');

	// And the way out for a model no list has yet.
	await page.getByRole('button', { name: 'Type a model name instead' }).click();
	const typed = page.locator('[name="modelTyped"]');
	await expect(typed).toBeVisible();
	await typed.fill('claude-opus-5');
	await expect(page.locator('input[name="model"]')).toHaveValue('claude-opus-5');
});
