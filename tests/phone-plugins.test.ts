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

/*
 * `$env/dynamic/public` is a virtual module SvelteKit fills in, and vitest has
 * no SvelteKit around it — so anything reaching `phone-notifications` pulls in
 * `isolated/mode` and throws on an `env` that is not there. Empty is the right
 * stand-in: no variable set is exactly a plain build. Same reason
 * `phone-notifications.test.ts` does it.
 */
vi.mock('$env/dynamic/public', () => ({ env: {} }));

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

/**
 * Whether the phone will ring, read back off the shell.
 *
 * This is the app's answer to the worst failure it has — a reminder that
 * simply did not arrive — so what matters here is that it never answers
 * *confidently wrong*. An old shell that has never heard of the call, a shell
 * that throws, a browser with no shell at all: all of them are "I cannot say",
 * which the page draws as nothing. A row of zeroes would read as "nothing is
 * booked", which is a different and much worse claim.
 */
describe('what the phone says about ringing', () => {
	test('reads every field the shell offers', async () => {
		inTheApp({
			OntoplanoSettings: {
				ringerStatus: async () => ({
					ringingFor: 'https://app.ontoplano.com',
					lastLookAt: 1_700_000_000_000,
					lastLookWorked: true,
					trouble: '',
					nextLookAt: 1_700_003_600_000,
					booked: 3,
					nextRingAt: 1_700_002_000_000,
					exactAllowed: true,
					channelAudible: true
				})
			}
		});
		const { ringerStatus } = await import('../src/lib/phone-notifications');
		const said = await ringerStatus();

		expect(said?.ringingFor).toBe('https://app.ontoplano.com');
		expect(said?.booked).toBe(3);
		expect(said?.nextRingAt).toBe(1_700_002_000_000);
		expect(said?.exactAllowed).toBe(true);
	});

	test('says nothing rather than nothing-is-booked, when it cannot ask', async () => {
		// A shell too old to have the call answers with an empty object.
		inTheApp({ OntoplanoSettings: { ringerStatus: async () => ({}) } });
		const old = await import('../src/lib/phone-notifications');
		expect(await old.ringerStatus()).toBeNull();

		vi.resetModules();
		// And one that throws is the same answer, not a crash.
		inTheApp({
			OntoplanoSettings: {
				ringerStatus: async () => {
					throw new Error('no such method');
				}
			}
		});
		const broken = await import('../src/lib/phone-notifications');
		expect(await broken.ringerStatus()).toBeNull();
	});

	test('a refusal is a refusal, not a default of yes', async () => {
		inTheApp({
			OntoplanoSettings: {
				ringerStatus: async () => ({
					ringingFor: 'https://app.ontoplano.com',
					exactAllowed: false,
					channelAudible: false,
					lastLookWorked: false,
					trouble: 'unreachable'
				})
			}
		});
		const { ringerStatus } = await import('../src/lib/phone-notifications');
		const said = await ringerStatus();

		expect(said?.exactAllowed, 'a phone refusing exact alarms must say so').toBe(false);
		expect(said?.channelAudible).toBe(false);
		expect(said?.lastLookWorked).toBe(false);
		expect(said?.trouble).toBe('unreachable');
		// Absent numbers are zero — "never" — not NaN drawn into a sentence.
		expect(said?.booked).toBe(0);
		expect(said?.lastLookAt).toBe(0);
	});
});
