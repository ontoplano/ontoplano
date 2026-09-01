/**
 * Whether a page knows it is inside the installed app.
 *
 * It matters wherever a page hands off to something outside itself, and the
 * widget's connect page is the one that does. Its last step is a link to
 * `ontoplano://widget`, and a scheme link fired from inside the app resolves
 * back to the app: Android asks "Continue to Ontoplano?", Continue reloads the
 * page that asked, and the key never reaches the widget's setup screen. The
 * page has to know not to start.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { isStandalone } from '../src/lib/platform';

const realWindow = globalThis.window;

/**
 * A stand-in window with only the two properties this reads.
 *
 * Cast rather than constructed: a real `Window` is several hundred members, and
 * a test that has to build one to ask a two-line question is a test nobody
 * writes.
 */
function windowSaying(options: { displayMode?: boolean; iosStandalone?: boolean } = {}) {
	globalThis.window = {
		navigator: options.iosStandalone ? { standalone: true } : {},
		matchMedia: (query: string) => ({
			matches: Boolean(options.displayMode) && query.includes('standalone')
		})
	} as unknown as Window & typeof globalThis;
}

afterEach(() => {
	globalThis.window = realWindow;
	vi.restoreAllMocks();
});

describe('isStandalone', () => {
	test('is false in an ordinary browser tab', () => {
		windowSaying();
		expect(isStandalone()).toBe(false);
	});

	test('is true in the installed app, which reports display-mode standalone', () => {
		windowSaying({ displayMode: true });
		expect(isStandalone()).toBe(true);
	});

	test('and true on iOS, which answers a property nothing else has', () => {
		// Safari has never implemented the media query for a home-screen install,
		// and `navigator.standalone` is the only thing it does answer.
		windowSaying({ iosStandalone: true });
		expect(isStandalone()).toBe(true);
	});

	test('is false on the server, where there is no window to ask', () => {
		// Deleting it is what rendering server-side looks like from in here.
		(globalThis as { window?: unknown }).window = undefined;
		expect(isStandalone()).toBe(false);
	});

	test('and false in a window with no matchMedia at all', () => {
		globalThis.window = { navigator: {} } as unknown as Window & typeof globalThis;
		expect(isStandalone()).toBe(false);
	});
});
