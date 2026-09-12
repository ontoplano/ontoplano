/**
 * @vitest-environment happy-dom
 */
/**
 * The phone's conveniences cannot take the app down with them.
 *
 * Capacitor's plugins arrive in two shapes: the generated wrapper, whose
 * `addListener` returns a promise of a handle, and the raw proxy the native
 * layer injects, which returns the handle itself. The app holds the raw proxy
 * — it is a dependency of the shell, not of the app — and calling `.then` on
 * what it returned threw while the client was starting. Every build of the
 * phone app opened to a white screen, on every flavour, with one line in
 * logcat to say why.
 *
 * So: take either shape, and never throw out of the call regardless.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { APP_USER_AGENT } from '../src/lib/instance-choice';

/** Pretend to be inside the phone app, with whatever plugins are given. */
function inTheApp(plugins: Record<string, unknown>) {
	Object.defineProperty(navigator, 'userAgent', {
		value: `Mozilla/5.0 (Linux; Android 14) ${APP_USER_AGENT}`,
		configurable: true
	});
	(globalThis as { Capacitor?: unknown }).Capacitor = { Plugins: plugins };
}

afterEach(() => {
	delete (globalThis as { Capacitor?: unknown }).Capacitor;
	vi.resetModules();
});

describe('the back gesture', () => {
	test('accepts a listener handle that is not a promise', async () => {
		const remove = vi.fn();
		let handler: (() => void) | undefined;
		inTheApp({
			App: {
				// The raw proxy's shape: a handle, right now, not a promise.
				addListener: (_event: string, fn: () => void) => {
					handler = fn;
					return { remove };
				},
				minimizeApp: () => undefined
			}
		});

		const { backGestureGoesBack } = await import('../src/lib/phone-back');
		const stop = backGestureGoesBack();
		await Promise.resolve();

		expect(handler).toBeTypeOf('function');
		// And it fires without throwing, on a history with nothing behind it.
		expect(() => handler!()).not.toThrow();

		stop();
		await Promise.resolve();
		expect(remove).toHaveBeenCalled();
	});

	test('accepts a promise of one too, which is the other half of the API', async () => {
		const remove = vi.fn();
		inTheApp({
			App: {
				addListener: () => Promise.resolve({ remove }),
				minimizeApp: () => Promise.resolve()
			}
		});

		const { backGestureGoesBack } = await import('../src/lib/phone-back');
		const stop = backGestureGoesBack();
		await Promise.resolve();
		await Promise.resolve();
		stop();
		await Promise.resolve();
		expect(remove).toHaveBeenCalled();
	});

	test('does nothing at all where there is no such plugin', async () => {
		inTheApp({});
		const { backGestureGoesBack } = await import('../src/lib/phone-back');
		expect(() => backGestureGoesBack()()).not.toThrow();
	});
});

describe('outside links', () => {
	test('do nothing where there is no browser plugin', async () => {
		inTheApp({});
		const { sendOutsideLinksToTheBrowser } = await import('../src/lib/outside-links');
		expect(() => sendOutsideLinksToTheBrowser()()).not.toThrow();
	});
});
