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
/**
 * On a phone, because that is the only place any of this can be true.
 *
 * The launch mark is kept in a cookie, and a cookie travels: a browser signed
 * into one profile syncs them between a phone and a laptop. So the server now
 * believes the mark only on an agent that could be an Android web view, and
 * these have to be one — they were passing on Playwright's desktop agent,
 * asserting behaviour that is deliberately refused now.
 */
const ON_A_PHONE = {
	userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Mobile'
};

test.describe('the app announcing itself', () => {
	test.use(ON_A_PHONE);

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

	/*
	 * A browser switches too — it just does not get the app's way out.
	 *
	 * There is one card about which ontoplano this is, and its action is the
	 * chooser: in the app that is the copy on the phone, at another origin, and
	 * in a browser it is the chooser on this instance. What must never appear
	 * outside the app is the hand-back address, because there is no app there
	 * to hand back to.
	 */
	test('a browser is offered the chooser here, not the app\u2019s way out', async ({ page }) => {
		await register(page, testEmail('android-none'));
		await visit(page, '/settings/account');

		const leave = page.getByRole('link', { name: 'Switch instance' });
		await expect(leave).toHaveAttribute('href', '/instance');
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
});

/**
 * A laptop carrying the phone's cookie is still a laptop.
 *
 * This is the bug the guard exists for, and it is not hypothetical: a synced
 * browser profile put the app cookie on a desktop, and the desktop spent a
 * year being told to update an app that was never installed on it. The cookie
 * said "this is the app" and it was a year old and about another device.
 *
 * The launch address is opened exactly as the app opens it, on a desktop
 * agent. Nothing about the app may follow from it.
 */
test.describe('a desktop wearing the app cookie', () => {
	test.use({
		userAgent:
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
	});

	test('is not the app, whatever the address said', async ({ page }) => {
		await register(page, testEmail('android-desktop'));

		await visit(page, '/tasks/todo?app=android&app_version=0.1.0');

		// No band: the instance is far ahead of 0.1.0, so a phone here would be
		// told to update. This is not a phone.
		await expect(page.getByText('Update the app.')).toHaveCount(0);

		// And nothing else that hangs off being the app, either: the chooser
		// here, never the hand-back to a copy of the app that is not running.
		await visit(page, '/settings/account');
		await expect(page.getByRole('link', { name: 'Switch instance' })).toHaveAttribute(
			'href',
			'/instance'
		);
	});
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

		/*
		 * What it says is what is true: reminders from this instance ring here.
		 * One sentence — it used to say the same thing three times over.
		 *
		 * Matched inside one source line. Prettier wraps these paragraphs and
		 * `getByText` does not normalise whitespace, so a pattern spanning the
		 * wrap finds nothing — which reads as "the copy is wrong" and is not.
		 */
		await expect(section.getByText(/can ring here with the/)).toBeVisible();

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

	/**
	 * The one sentence that decides whether any of this was worth building.
	 *
	 * The top of the section is the line somebody reads before anything else,
	 * and it said "Reminders arrive while ontoplano is open" — to a phone that
	 * was, at that very moment, booking Android's alarms for exactly these
	 * reminders, above a paragraph explaining so. Read on its own it says the
	 * app cannot remind you of anything unless you are already looking at it,
	 * which is the app being useless.
	 *
	 * The instance can answer this: ringing needs a key, and a key is a row it
	 * issued. So the section says one of two true things, and this pins both
	 * of them — the wrong one is invisible from inside the branch that used to
	 * print it unconditionally.
	 */
	test('says whether this phone actually rings, and never that it cannot', async ({ page }) => {
		await register(page, testEmail('android-rings'));
		await visit(page, '/settings/preferences');

		const section = page.locator('section', { hasText: 'Notifications on this device' });

		// Nothing has been set up yet, and it says so rather than promising.
		await expect(section.getByText(/Not set up yet/)).toBeVisible();
		await expect(section.getByRole('button', { name: 'Ring on this phone' })).toBeVisible();
		// Nothing to stop, so nothing offering to.
		await expect(section.getByRole('link', { name: 'Stop ringing on this phone' })).toHaveCount(0);

		/*
		 * The key, minted the way the app mints it.
		 *
		 * Pressing the button would send the browser to the device's own origin,
		 * which exists only inside the app; the action behind it is the whole of
		 * what the instance contributes, and it is what leaves the row this
		 * section reads.
		 */
		const minted = await page.request.post('/settings/integrations?/ringOnThisPhone', {
			headers: { origin: new URL(page.url()).origin },
			form: {}
		});
		expect(minted.ok()).toBe(true);

		await visit(page, '/settings/preferences');
		await expect(section.getByText(/ring here with the/).first()).toBeVisible();
		await expect(section.getByRole('link', { name: 'Stop ringing on this phone' })).toBeVisible();

		// And not, anywhere in it, the claim this is all here to make false.
		await expect(section.getByText(/while ontoplano is open/)).toHaveCount(0);
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
 * screen's with another's. And it turns while the instance loads — the app's
 * own wait, which ends when the screen does.
 */
test.describe('the mark on the chooser', () => {
	test('turns on the way out, and stays still while reading the two answers', async ({ page }) => {
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
		// and a mark that moves at every glance is noise.
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
		 * And the press that commits: the turn starts, and the load starts with
		 * it.
		 *
		 * Three versions of this were wrong in three directions. A swell the
		 * navigation waited for put a pause between the press and the load. A
		 * turn that stopped after one revolution went quiet while the instance
		 * was still opening. And with the app's usual delay in front of it, the
		 * mark never moved at all on the device, whose copy loads faster than
		 * the delay. The turn ends when this document is replaced — the only
		 * moment that means "loaded" — so the press must not be held up by it.
		 *
		 * How long it turns for is not assertable here: against a warm server
		 * on localhost that is a handful of frames, and asserting a duration
		 * would be asserting the speed of this machine. `tests/mark-spin.test.ts`
		 * holds the turn's own behaviour, frame by frame, on a clock it owns.
		 */
		// `[name=…]`, not `input[name=…]`: the address field is a one-line
		// textarea, because an input raises the phone's autofill bar.
		await page.locator('[name="instance"]').fill('http://localhost:4173');
		const at = Date.now();
		await page.getByRole('button', { name: 'Connect' }).click();
		await page.waitForURL((url) => !url.pathname.startsWith('/instance'), { timeout: 15000 });
		expect(Date.now() - at, 'the press waited on an animation').toBeLessThan(2000);
	});
});

/**
 * What the reminders page says to a phone that is already ringing.
 *
 * The instance cannot ask the phone anything — the shell's plugins reach its
 * own origin and no further — so the page said, to every phone, that reminders
 * from here "arrive only while ontoplano is open". That was true before the
 * phone could ring for a served instance at all, and a flat contradiction of
 * the Preferences screen ever since: somebody set it up there, came here, and
 * was told it does not work.
 *
 * The instance minted the key, so the instance knows. This is that answer.
 */
test.describe('reminders, inside the app', () => {
	test.use({ userAgent: `Mozilla/5.0 (Linux; Android 14) Mobile ${'OntoplanoApp'}/0.1.0` });

	test('says they ring with the app closed once this phone has a key', async ({ page }) => {
		await register(page, testEmail('rings-here'));

		// Nothing set up yet: it must not promise what is not arranged, and the
		// way to arrange it is a press rather than a paragraph.
		await visit(page, '/reminders');
		await expect(page.getByText(/not set up to ring for reminders from here/)).toBeVisible();
		await expect(page.getByRole('link', { name: 'Set it up' })).toBeVisible();
		await expect(page.getByText(/arrive only while ontoplano is open/)).toHaveCount(0);

		// The key the phone's handshake asks for, made the way it makes it.
		const made = await page.request.post('/settings/integrations?/ringOnThisPhone', {
			headers: {
				Origin: 'http://localhost:4173',
				'x-sveltekit-action': 'true',
				'content-type': 'application/x-www-form-urlencoded'
			},
			data: ''
		});
		expect(made.ok(), await made.text()).toBeTruthy();

		// Now it is true, and the page says the true thing rather than warning.
		await visit(page, '/reminders');
		await expect(page.getByText(/ring on this phone, with ontoplano closed/)).toBeVisible();
		await expect(page.getByText(/not set up to ring/)).toHaveCount(0);
	});
});
