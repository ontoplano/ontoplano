/**
 * A laptop is never the Android app, whatever its cookies say.
 *
 * The app is recognised by a cookie — see the note on `APP_VERSION_COOKIE` for
 * why the user agent alone cannot do it — and a cookie outlives the thing it
 * describes and travels further than the device it was written on. A browser
 * signed into one profile syncs them between a phone and a laptop, and the
 * laptop then spends a year being told to update an app it has never had.
 *
 * This is the veto on that: the cookie still decides, and this decides whether
 * it is allowed to. Its whole job is to refuse the one answer that cannot be
 * true, so the interesting half of these is what it must *not* refuse.
 */
import { describe, expect, test } from 'vitest';

import { APP_USER_AGENT, couldBeTheApp } from '../src/lib/platform';

describe('what could be the Android app', () => {
	test('the shell, which appends its own token', () => {
		expect(
			couldBeTheApp(`Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 ${APP_USER_AGENT}`)
		).toBe(true);
	});

	test('and an Android web view without it, which is how some requests arrive', () => {
		// A service worker's fetches carry the platform agent and not the
		// shell's appended token — the reason the cookie exists at all. Refusing
		// these would break the app rather than the laptop.
		expect(
			couldBeTheApp(
				'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
			)
		).toBe(true);
		expect(
			couldBeTheApp('Mozilla/5.0 (Linux; Android 10; K) Chrome/120 Mobile Safari/537.36 wv')
		).toBe(true);
	});
});

describe('what could not', () => {
	test('a desktop, which is the bug this exists for', () => {
		for (const agent of [
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15',
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/121.0'
		]) {
			expect(couldBeTheApp(agent), agent.slice(0, 40)).toBe(false);
		}
	});

	test('an iPhone, which cannot be running an Android shell', () => {
		expect(
			couldBeTheApp(
				'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
			)
		).toBe(false);
	});

	test('and a request with no agent at all', () => {
		expect(couldBeTheApp(null)).toBe(false);
		expect(couldBeTheApp(undefined)).toBe(false);
		expect(couldBeTheApp('')).toBe(false);
	});
});
