/**
 * The modifier this keyboard actually has.
 *
 * `⌘K` printed on a Linux or Windows machine is a symbol for a key that is not
 * there. The hint says what the reader can press.
 *
 * Server-side there is no keyboard to ask about, so it renders `Ctrl` and
 * corrects itself on hydration if it turns out to be a Mac — which is the right
 * way round, because most of them are not.
 */
export function commandKey(): string {
	if (typeof navigator === 'undefined') return 'Ctrl';

	// `||`, not `??`. `navigator.platform` is deprecated, and a deprecated web
	// API is emptied rather than deleted — the browsers that have stopped
	// answering return `''`, which `??` walks straight past. That left an iPhone
	// reading `Ctrl`, which is the one platform this exists to get right.
	const platform =
		(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
		navigator.platform ||
		navigator.userAgent;

	return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl';
}

/**
 * Whether this page is being read inside the installed app.
 *
 * True for the Android app and for a home-screen install on either platform:
 * all three run the same pages in a window with no address bar, which
 * `display-mode: standalone` is the way to ask about. (iOS answers through
 * `navigator.standalone`, which nothing else has and which no amount of
 * standardisation has replaced.)
 *
 * It matters wherever a page hands off to something outside itself. A link to
 * an app scheme fired from inside the app resolves back to the app — Android
 * asks "Continue to Ontoplano?" and Continue lands on the page that asked,
 * which is what a flow eating itself looks like from the outside.
 */
export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;

	if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;

	return (
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(display-mode: standalone)').matches
	);
}

/**
 * How a page knows it is inside the Android app rather than a browser.
 *
 * Not by screen size, and not by `isStandalone()` above. Both answer a
 * different question: a phone-shaped window, or a window with no address bar —
 * which is equally true of the site saved to a home screen on a phone that has
 * never had the app installed. What the app can offer that a browser cannot is
 * the native instance chooser, so the only useful question is whether *the
 * app* is drawing this page, and the app is the one thing that knows.
 *
 * So it says so: every launch opens `?app=android` (`Instance.launchUrl` in
 * `android/native/java/Instance.java`), the server writes that into a cookie
 * and redirects the parameter back off the address, and from then on
 * `locals.nativeApp` is the answer for every request on this install —
 * including the ones that come back from a deep link months later.
 */
export const APP_LAUNCH_PARAM = 'app';
export const APP_LAUNCH_VALUE = 'android';
export const APP_COOKIE = 'ontoplano_app';
