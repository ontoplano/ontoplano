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
 * So it says so: every launch leaves the copy on the device for the chosen
 * instance through `launchAddress` (`$lib/instance-choice.ts`), which puts
 * `?app=android` on the address. The server writes that into a cookie and
 * redirects the parameter back off, and from then on `locals.nativeApp` is
 * the answer for every request on this install — including the ones that come
 * back from a deep link months later.
 */
export const APP_LAUNCH_PARAM = 'app';
export const APP_LAUNCH_VALUE = 'android';
export const APP_COOKIE = 'ontoplano_app';

/**
 * Which version of the app is asking, announced the same way.
 *
 * The pages the app draws are the instance's pages, so they are always the
 * instance's version — what can fall behind is the installed shell around
 * them: the alarms, the chooser, whatever bridge the pages start expecting
 * next. The shell's own version rides on the launch address beside the mark
 * above (`launchAddress` in `$lib/instance-choice.ts`), and the server keeps
 * it in a cookie the same way. A cookie rather than the user agent, which
 * would always be current: the app's pages arrive through its service worker,
 * and a service worker's fetches carry the cookies and not the shell's custom
 * user agent — on this suite's Chromium and on Android's web view alike. The
 * cookie is a launch behind after an update, which only ever errs quiet.
 */
export const APP_VERSION_PARAM = 'app_version';
export const APP_VERSION_COOKIE = 'ontoplano_app_version';

/**
 * Where "not now" is remembered, holding the instance version it was said to.
 * The warning stays away until the instance moves again — a dismissal means
 * "I know about this one", not "never tell me".
 */
export const APP_UPDATE_HUSH_KEY = 'ontoplano_update_hushed';

/**
 * Whether an installed app is far enough behind an instance to warn about.
 *
 * Behind on the minor, not the patch. The repo's own rule (see CHANGELOG.md)
 * is that the patch carries the ordinary day's work and the minor is a
 * structural change — and the native shell only stops fitting the pages when
 * the structure moves. Patch skew is also the *permanent* state of a store
 * install, since a store rollout trails the deploy by days; warning on it
 * would be a banner that never leaves.
 *
 * A version that does not parse compares as not-behind: a warning built on a
 * garbled string is a warning about nothing.
 */
export function appBehindInstance(app: string, instance: string): boolean {
	const parse = (v: string) => {
		const m = /^(\d+)\.(\d+)\.\d+/.exec(v);
		return m ? { major: +m[1], minor: +m[2] } : null;
	};
	const a = parse(app);
	const b = parse(instance);
	if (!a || !b) return false;
	return a.major < b.major || (a.major === b.major && a.minor < b.minor);
}
