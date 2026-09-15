import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
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
	await register(page, testEmail('android-app'));

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
	await register(page, testEmail('android-none'));
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
	await register(page, testEmail('android-behind'));

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
	await register(page, testEmail('android-fresh'));
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
		await register(page, testEmail('android-notify'));
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
		await register(page, testEmail('android-denied'));
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
		await register(page, testEmail('android-remote'));
		await visit(page, '/settings/preferences');

		const section = page.locator('section', { hasText: 'Notifications on this device' });

		// What it says is what is true: the phone asks this instance and rings
		// for it, because an instance cannot wake a phone.
		await expect(section.getByText(/ring on this phone/)).toBeVisible();
		await expect(section.getByText(/no push in here/)).toBeVisible();

		// And not a word about a permission it is in no position to ask about.
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

/**
 * The page where the key changes hands.
 *
 * `/ring` is the pivot of the whole reminders arrangement: an instance minted
 * a key it cannot store, the shell can store it and cannot mint one, and this
 * page is the only place the two meet. It runs for one frame inside a web
 * view with no address bar, so nothing about it is a screen — what matters is
 * that the key reaches the shell and that nobody is left standing on a page
 * with a key in its address.
 */
test.describe('the ring hand-over page', () => {
	test.use({ userAgent: `Mozilla/5.0 (Linux; Android 14) Mobile ${'OntoplanoApp'}/0.1.0` });

	/**
	 * The shell, remembering what it was told — on this side of the browser.
	 *
	 * The page under test replaces itself the moment it has done its job, and
	 * a navigation wipes anything the stub kept in the page: the first version
	 * of this suite polled a `window` object that a re-run init script had
	 * just reset. An exposed function survives every navigation, so what the
	 * shell heard is recorded where the page cannot lose it.
	 */
	async function withShell(page: import('@playwright/test').Page) {
		const heard = { rangFor: [] as unknown[], stopped: 0 };
		await page.exposeFunction('__ringerHeard', (what: unknown) => {
			if (what === 'stop') heard.stopped += 1;
			else heard.rangFor.push(what);
		});
		await page.addInitScript(() => {
			const record = (window as never as Record<string, (what: unknown) => Promise<void>>)
				.__ringerHeard;
			(window as never as Record<string, unknown>).Capacitor = {
				Plugins: {
					OntoplanoSettings: {
						ringFor: (what: unknown) => record(what),
						stopRinging: () => record('stop'),
						ringingFor: async () => ({ origin: '' })
					}
				}
			};
		});
		return heard;
	}

	test('hands the key to the shell and goes back to the instance', async ({ page }) => {
		const heard = await withShell(page);
		await register(page, testEmail('ring-hand'));

		const at = 'http://localhost:4173';
		await page.goto(`/ring?at=${encodeURIComponent(at)}&key=onto_e2e_test_key`, {
			waitUntil: 'load'
		});

		await expect.poll(() => heard.rangFor.length).toBe(1);
		expect(heard.rangFor[0]).toEqual({ origin: at, token: 'onto_e2e_test_key' });

		// And nobody is left holding the address the key rode in on: the page
		// replaces itself with the instance, launch mark and all — which the
		// server takes back off, like the first test in this file says.
		await page.waitForURL((url) => url.pathname !== '/ring');
		expect(page.url()).not.toContain('onto_e2e_test_key');
	});

	test('off stops the ringing and still goes back', async ({ page }) => {
		const heard = await withShell(page);
		await register(page, testEmail('ring-off'));

		await page.goto(`/ring?off=1&at=${encodeURIComponent('http://localhost:4173')}`, {
			waitUntil: 'load'
		});

		await expect.poll(() => heard.stopped).toBe(1);
		expect(heard.rangFor).toHaveLength(0);
		await page.waitForURL((url) => url.pathname !== '/ring');
	});

	test('with nothing to set it opens the app and sets nothing', async ({ page }) => {
		const heard = await withShell(page);
		await register(page, testEmail('ring-none'));

		await page.goto('/ring', { waitUntil: 'load' });

		await page.waitForURL((url) => url.pathname !== '/ring');
		expect(heard.rangFor).toHaveLength(0);
		expect(heard.stopped).toBe(0);
	});
});

/**
 * The mark on the instance chooser, which is one object across two screens.
 *
 * It is drawn in the place the app's own bar draws it, so choosing an instance
 * puts the bar UNDER a logo that has not moved rather than replacing one
 * screen's with another's. The swell is the handover: it plays on the press
 * that commits, and the app is not opened until it has.
 */
test.describe('the mark on the chooser', () => {
	test('swells on the way out, and not while reading the two answers', async ({ page }) => {
		await register(page, testEmail('chooser-mark'));
		await page.setViewportSize({ width: 390, height: 844 });
		await visit(page, '/instance');

		const mark = page.locator('.mark-where-the-bar-will-be');
		await expect(mark).toBeVisible();
		const before = await mark.boundingBox();

		/*
		 * Asked of the browser's own animation list rather than of a class: the
		 * swell is started with `animate()` precisely because a class could not
		 * be made to restart, and a test that asserted the class would pass
		 * against a version that only ever played once.
		 */
		const playing = () => mark.evaluate((el) => el.getAnimations().length);

		// Reading the difference between the two answers is not a commitment,
		// and a mark that pulses at every glance is noise.
		for (const answer of [/On device/i, /Cloud instance/i]) {
			await page.getByRole('radio', { name: answer }).click();
			await page.waitForTimeout(120);
			expect(await playing(), 'the mark stays still while choosing').toBe(0);
		}

		// Nothing moved while all that was pressed.
		const after = await mark.boundingBox();
		expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(0.5);
		expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(0.5);

		/*
		 * And the press that commits. The address is this server, so the test
		 * goes somewhere real; what is asserted is that the app is not opened
		 * until the mark has swelled — the animation IS the handover, so
		 * leaving before it has played is the bug.
		 */
		// `[name=…]`, not `input[name=…]`: the address field is a one-line
		// textarea, because an input raises the phone's autofill bar.
		await page.locator('[name="instance"]').fill('http://localhost:4173');
		const at = Date.now();
		await page.getByRole('button', { name: 'Connect' }).click();
		await page.waitForURL((url) => !url.pathname.startsWith('/instance'), { timeout: 15000 });
		expect(Date.now() - at, 'it left before the mark had swelled').toBeGreaterThan(300);
	});
});
