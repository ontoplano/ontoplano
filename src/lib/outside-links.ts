/**
 * A link that leaves ontoplano leaves the app too.
 *
 * In a browser this is what `target="_blank"` already does. Inside the phone
 * app it is not: the web view is told it may navigate anywhere — it has to be,
 * because the instance screen sends it to whatever address somebody typed — so
 * a press on "the documentation" replaced the app with the documentation, in a
 * window with no address bar, no tabs and no back. The phone's back gesture
 * minimised the app instead of returning, because as far as Android was
 * concerned there was nothing to return to.
 *
 * So an address that is not this instance is handed to the system's own
 * browser, which arrives over the app with a close button on it. Only in the
 * app, and only for a different origin: an ordinary link inside ontoplano is
 * an ordinary navigation, and a desktop browser already does the right thing.
 */
import { DEVICE_ORIGIN, inPhoneApp } from './instance-choice';

/**
 * Where the device's copy hands an address to the system browser.
 *
 * The instance's pages have no bridge to the shell — its plugins reach the
 * device's own origin and no further, the same wall `/play` and `/ring` go
 * round — so from an instance the address takes a trip: to this page on the
 * device's copy, which opens the browser and steps back to where it was.
 */
export const OUT_PATH = '/out';
export const OUT_PARAM = 'to';

/**
 * The first shell whose copy has `OUT_PATH`. An older one would answer the
 * trip with its own not-found page, which is worse than the link opening in
 * place, so those keep doing that until they are updated.
 */
export const OUT_SINCE = '0.186.1';

/** Links that are this instance's but read as a page of their own — the legal pages. */
export const OUTSIDE_ATTRIBUTE = 'data-outside';

/** The slice of Capacitor's Browser plugin this uses. */
type SystemBrowser = { open(options: { url: string }): Promise<void> };

function systemBrowser(): SystemBrowser | null {
	const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
	const found = capacitor?.Plugins?.Browser;
	return found ? (found as SystemBrowser) : null;
}

/** Whether following this address would take somebody out of the app. */
function leavesTheApp(link: HTMLAnchorElement): boolean {
	if (link.hasAttribute(OUTSIDE_ATTRIBUTE)) return true;
	const href = link.getAttribute('href') ?? '';
	// A fragment, a path, a mailto, a tel: none of them are another website.
	if (!/^https?:\/\//i.test(href)) return false;
	try {
		return new URL(href, location.href).origin !== location.origin;
	} catch {
		return false;
	}
}

/** `a` at least `b`, both `major.minor.patch`; false when either is not one. */
export function atLeast(a: string, b: string): boolean {
	const parse = (v: string) => /^(\d+)\.(\d+)\.(\d+)/.exec(v)?.slice(1).map(Number) ?? null;
	const x = parse(a);
	const y = parse(b);
	if (!x || !y) return false;
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
	return true;
}

/** The installed shell's version, as the instance was told it. Null until the layout says. */
let shellVersion: string | null = null;
export function tellTheShellVersion(version: string | null | undefined): void {
	shellVersion = version ?? null;
}

/** The address on the device's copy that opens `url` in the system browser. */
export function outTripAddress(url: string): string {
	const out = new URL(OUT_PATH, DEVICE_ORIGIN);
	out.searchParams.set(OUT_PARAM, url);
	return out.toString();
}

/** Only an address on the web is handed to the browser; anything else is not a link out. */
export function outsideAddress(raw: string | null): string | null {
	if (!raw) return null;
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
	} catch {
		return null;
	}
}

/** Open `url` in the system browser from the device's own origin. */
export function openInSystemBrowser(url: string): Promise<boolean> {
	const browser = systemBrowser();
	if (!browser) return Promise.resolve(false);
	return browser.open({ url }).then(
		() => true,
		() => false
	);
}

/**
 * Watch the document for presses on links that lead elsewhere.
 *
 * One listener on the document rather than a prop on every link: there are a
 * handful of these today and there will be more, and a rule somebody has to
 * remember at each call site is a rule that is wrong by next month.
 */
export function sendOutsideLinksToTheBrowser(): () => void {
	if (typeof document === 'undefined' || !inPhoneApp()) return () => {};

	const onClick = (event: MouseEvent) => {
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

		const link = (event.target as Element | null)?.closest?.('a');
		if (!(link instanceof HTMLAnchorElement) || !leavesTheApp(link)) return;

		const browser = systemBrowser();
		if (!browser) {
			// On an instance: no bridge here, so the trip through the device's
			// copy — if the shell is new enough to have the page it goes to.
			if (location.origin === DEVICE_ORIGIN) return;
			if (!shellVersion || !atLeast(shellVersion, OUT_SINCE)) return;
			event.preventDefault();
			location.assign(outTripAddress(link.href));
			return;
		}

		event.preventDefault();
		browser.open({ url: link.href }).catch(() => {
			// The plugin refused, so the ordinary navigation is better than
			// nothing happening at all when somebody presses a link.
			location.href = link.href;
		});
	};

	document.addEventListener('click', onClick);
	return () => document.removeEventListener('click', onClick);
}
