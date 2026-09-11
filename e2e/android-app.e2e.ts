import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The Android app says it is the Android app, and the account page answers.
 *
 * The app is a Trusted Web Activity — Chrome, with Chrome's user agent, in a
 * window with no address bar. Every browser question you could ask it about
 * the phone answers the same for a browser, so none of them can be the test:
 * `display-mode: standalone` is equally true of the site saved to somebody's
 * home screen on a phone that has never had the app. The app marks its own
 * launch (`?app=android`, from `Instance.launchUrl`) and the server keeps it.
 *
 * What hangs off the answer is the only thing the app can do and a browser
 * cannot: leave this instance for another one, which is a native screen behind
 * `ontoplano://instance`.
 */
test('the launch mark is kept and taken back off the address', async ({ page }) => {
	await register(page, `android-app-${Date.now()}@test.invalid`);

	await visit(page, '/?app=android');
	// Off the address again: a link somebody copies out of the app should not
	// carry it, and the answer is in a cookie by now.
	expect(new URL(page.url()).searchParams.has('app')).toBe(false);

	await visit(page, '/settings/account');
	const leave = page.getByRole('link', { name: 'Switch instance' });
	await expect(leave).toBeVisible();
	await expect(leave).toHaveAttribute('href', 'ontoplano://instance');

	// And it names the instance rather than describing one.
	await expect(page.getByText('This app is open on')).toContainText(new URL(page.url()).host);
});

test('a browser is offered nothing to switch', async ({ page }) => {
	await register(page, `android-none-${Date.now()}@test.invalid`);
	await visit(page, '/settings/account');

	await expect(page.getByRole('link', { name: 'Switch instance' })).toHaveCount(0);
});
