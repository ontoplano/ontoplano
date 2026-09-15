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
 * cannot: leave this instance for another one.
 *
 * That used to be `ontoplano://instance`, a native screen from before the
 * chooser was a page — and this test asserted that address, so it went on
 * passing for months while the link opened nothing but "unknown url scheme".
 * It is the chooser on the copy of the app the phone carries now, which is
 * deliberately not `/instance` on the instance being left: that instance may
 * be old enough not to have the screen.
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
	await expect(leave).toHaveAttribute('href', 'https://localhost/instance?ask=1');

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

/**
 * Inside the app, the notifications section speaks Android.
 *
 * The web view has no Push API, and the page used to answer "This browser
 * cannot do it" — about an app whose reminders arrive through Android's own
 * alarms. Nothing in the UI ever asked Android for the permission, either,
 * which is why a fresh install never notified: the scheduler only books
 * alarms once permission is granted, and nobody granted it.
 *
 * The plugin is stubbed the way the shell injects it, because this suite runs
 * in a browser: what is being tested is the page's side of the conversation.
 */
test.describe('notifications inside the app', () => {
	test.use({ userAgent: `Mozilla/5.0 (Linux; Android 14) Mobile ${'OntoplanoApp'}/0.1.0` });

	test('asks Android, turns on, and can send a test', async ({ page }) => {
		await page.addInitScript(() => {
			const state = { display: 'prompt', booked: [] as unknown[] };
			(window as never as Record<string, unknown>).__notifs = state;
			(window as never as Record<string, unknown>).Capacitor = {
				Plugins: {
					LocalNotifications: {
						checkPermissions: async () => ({ display: state.display }),
						requestPermissions: async () => ((state.display = 'granted'), { display: 'granted' }),
						getPending: async () => ({ notifications: [] }),
						cancel: async () => undefined,
						schedule: async (what: { notifications: unknown[] }) => {
							state.booked.push(...what.notifications);
						}
					}
				}
			};
		});
		await register(page, `android-notify-${Date.now()}@test.invalid`);
		await visit(page, '/settings/preferences');

		const section = page.locator('section', { hasText: 'Notifications on this device' });
		// The app's words, not the browser's refusal.
		await expect(section.getByText('This browser cannot do it.')).toHaveCount(0);
		await expect(section.getByText("Android's own alarms")).toBeVisible();

		await section.getByRole('button', { name: 'Turn on' }).click();
		await expect(section.getByText('On for this phone.')).toBeVisible();

		await section.getByRole('button', { name: 'Send a test' }).click();
		await expect(section.getByText(/it arrives in a few seconds/)).toBeVisible();
		const booked = await page.evaluate(
			() => (window as never as Record<string, { booked: unknown[] }>).__notifs.booked.length
		);
		expect(booked).toBeGreaterThan(0);
	});

	/**
	 * The state a phone gets stuck in, and the way out of it.
	 *
	 * Android stops showing the permission dialog after two refusals:
	 * `requestPermissions` answers "denied" with nothing on screen. So a Turn on
	 * button there is a button that does nothing, which is what somebody who
	 * wants reminders actually met — along with a sentence telling them where in
	 * the phone's settings to go. The settings screen is a button now, and this
	 * is the pair that has to keep working: the right button, and a press that
	 * reaches the shell.
	 */
	test('offers the settings screen once Android has refused for good', async ({ page }) => {
		await page.addInitScript(() => {
			const state = { opened: 0 };
			(window as never as Record<string, unknown>).__settings = state;
			(window as never as Record<string, unknown>).Capacitor = {
				Plugins: {
					LocalNotifications: {
						checkPermissions: async () => ({ display: 'denied' }),
						requestPermissions: async () => ({ display: 'denied' }),
						getPending: async () => ({ notifications: [] }),
						cancel: async () => undefined,
						schedule: async () => undefined
					},
					OntoplanoSettings: {
						openNotificationSettings: async () => {
							state.opened += 1;
						}
					}
				}
			};
		});
		await register(page, `android-denied-${Date.now()}@test.invalid`);
		await visit(page, '/settings/preferences');

		const section = page.locator('section', { hasText: 'Notifications on this device' });

		// Not an ask it cannot make: the dialog is gone, and so is the button.
		await expect(section.getByRole('button', { name: 'Turn on' })).toHaveCount(0);

		await section.getByRole('button', { name: "Open the phone's settings" }).click();
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as never as Record<string, { opened: number }>).__settings.opened
				)
			)
			.toBe(1);

		// And the reminders page says the same thing, since that is where
		// somebody notices reminders are not arriving.
		await visit(page, '/reminders');
		await expect(page.getByText(/will not ask again/)).toBeVisible();
		await expect(page.getByRole('button', { name: "Open the phone's settings" })).toBeVisible();
	});
});

/**
 * The app, looking at somebody else's instance.
 *
 * The shell injects its plugins into its own origin and no further — which is
 * why `APP_USER_AGENT` exists: the user agent is the one thing a page can
 * still see about its shell once it has been sent to a server. So this page is
 * inside the app and cannot see a single plugin, and everything the section
 * above does is unavailable to it.
 *
 * It used to read that as a refusal: "Android said no, and will not ask
 * again", in front of somebody whose phone settings say Allowed, over a button
 * that opened nothing. Nothing about the permission is knowable from here, and
 * nothing about it is what is in the way.
 */
test.describe('an instance shown inside the app', () => {
	test.use({ userAgent: `Mozilla/5.0 (Linux; Android 14) Mobile ${'OntoplanoApp'}/0.1.0` });

	test('does not blame Android for what it cannot ask', async ({ page }) => {
		// No `window.Capacitor` at all: that is the whole of this situation.
		await register(page, `android-remote-${Date.now()}@test.invalid`);
		await visit(page, '/settings/preferences');

		const section = page.locator('section', { hasText: 'Notifications on this device' });
		await expect(section.getByText(/shown inside the app/)).toBeVisible();

		await expect(section.getByText(/Android said no/)).toHaveCount(0);
		await expect(section.getByRole('button', { name: 'Turn on' })).toHaveCount(0);
		await expect(section.getByRole('button', { name: "Open the phone's settings" })).toHaveCount(0);

		// And the reminders page says the same thing, rather than offering a
		// button that cannot reach anything.
		await visit(page, '/reminders');
		await expect(page.getByRole('button', { name: 'Allow notifications' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: "Open the phone's settings" })).toHaveCount(0);
	});
});
