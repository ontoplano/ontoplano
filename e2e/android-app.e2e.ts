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

/**
 * A shell behind the instance is told to update, once per instance version.
 *
 * The launch address wears the shell's version beside the app mark (see
 * `launchAddress` in `$lib/instance-choice.ts`); the server keeps it in a
 * cookie and compares it to its own. A minor behind draws the band; "Not now"
 * puts it away and it stays away — until the instance moves again, which is a
 * different warning about a different gap.
 */
test('an app a minor behind is told to update, and can say not now', async ({ page }) => {
	await register(page, `android-behind-${Date.now()}@test.invalid`);

	// The launch, as hooks.client.ts sends it: mark and version on the address.
	await visit(page, '/tasks/todo?app=android&app_version=0.1.0');
	// Both parameters come back off the address, like the mark always has.
	expect(new URL(page.url()).searchParams.has('app_version')).toBe(false);

	const band = page.getByText('Update the app.');
	await expect(band).toBeVisible();
	// Named, not described: the person should see how far behind they are.
	await expect(page.getByText('It is 0.1.0 and this instance runs')).toBeVisible();

	await page.getByRole('button', { name: 'Not now' }).click();
	await expect(band).toHaveCount(0);

	// And it stays put away on the next page.
	await visit(page, '/tasks/todo');
	await expect(page.getByText('Update the app.')).toHaveCount(0);
});

test('a browser is never told to update', async ({ page }) => {
	await register(page, `android-fresh-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/todo');
	await expect(page.getByText('Update the app.')).toHaveCount(0);
});
