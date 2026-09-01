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

function windowSaying(options: { displayMode?: boolean; iosStandalone?: boolean } = {}) {
	// @ts-expect-error — a stand-in for the two properties this reads.
	globalThis.window = {
		navigator: options.iosStandalone ? { standalone: true } : {},
		matchMedia: (query: string) => ({
			matches: Boolean(options.displayMode) && query.includes('standalone')
		})
	};
}

afterEach(() => {
	// @ts-expect-error — put back whatever was there, including nothing.
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
		// @ts-expect-error — deleting it is what rendering server-side looks like.
		delete globalThis.window;
		expect(isStandalone()).toBe(false);
	});

	test('and false in a window with no matchMedia at all', () => {
		// @ts-expect-error — a minimal stand-in, which is what a test harness is.
		globalThis.window = { navigator: {} };
		expect(isStandalone()).toBe(false);
	});
});
