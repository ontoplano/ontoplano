import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The chat exists exactly while a provider key does.
 *
 * The feature's whole contract with somebody who never wanted it is absence,
 * so absence is what this walks: no key means the chat room turns you to the
 * screen that takes one, and removing the key puts it back that way.
 */
test('the chat appears with a key and goes away with it', async ({ page }) => {
	await register(page, testEmail('assistant-chat'));

	// Without a key the chat room does not exist — it answers with the
	// settings screen that takes one, which is the AI tab's chat card.
	await visit(page, '/assistant');
	await expect(page).toHaveURL(/settings\/integrations(#chat)?$/);

	// Bring one. Anthropic is the preselected provider, so only the key is
	// typed; the model field says what empty means instead of demanding one.
	await page.locator('[name="key"]').fill('sk-ant-e2e-not-a-real-key');
	await expect(async () => {
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('answering as claude-sonnet-5')).toBeVisible({ timeout: 2000 });
	}).toPass({ timeout: 15000 });

	// The key is shown as a prefix, never whole.
	await expect(page.getByText('sk-ant-e', { exact: false })).toBeVisible();
	await expect(page.getByText('not-a-real-key')).toHaveCount(0);

	// The chat opens now, and says which model is on the other end.
	await page.getByRole('link', { name: 'Open the chat' }).click();
	await expect(page).toHaveURL(/\/assistant$/);
	await expect(page.getByText('Answering with Anthropic — claude-sonnet-5.')).toBeVisible();

	// Remove the key and the room is gone again. The confirm button arms
	// itself for a moment before it can be pressed, so the press retries.
	await visit(page, '/settings/integrations');
	await page.getByRole('button', { name: 'Remove the key' }).click();
	await expect(async () => {
		await page.getByRole('button', { name: 'Confirm?' }).click();
		await expect(page.getByText('answering as claude-sonnet-5')).toBeHidden({ timeout: 2000 });
	}).toPass({ timeout: 15000 });

	await visit(page, '/assistant');
	await expect(page).toHaveURL(/settings\/integrations(#chat)?$/);
});
