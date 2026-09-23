import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Coming back to the app shows what arrived while it was away.
 *
 * The phone opened on a badge saying three and a bell holding none: Android
 * freezes a backgrounded web view and the live stream dies with it, so nothing
 * was pending when it came back and nothing reconnected. The list only caught
 * up when some navigation happened to reload the data.
 */
test('what arrived while the app was away is there when it returns', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('returning'));
	await visit(page, '/tasks/todo');

	// Away. Then something is written down for this account while it is.
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden'
		});
		document.dispatchEvent(new Event('visibilitychange'));
	});
	const origin = new URL(page.url()).origin;
	await page.request.post(`${origin}/api/notifications/raised`, {
		data: { title: 'Ring the dentist', body: 'It is due', kind: 'reminder' }
	});

	// Back to the front. No navigation, no reload — only the return.
	const wasAt = page.url();
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'visible'
		});
		document.dispatchEvent(new Event('visibilitychange'));
	});

	await page
		.getByRole('button', { name: /Notifications|What you were told/i })
		.first()
		.click();
	await expect(page.getByText('Ring the dentist')).toBeVisible({ timeout: 30_000 });
	expect(page.url()).toBe(wasAt);
});
