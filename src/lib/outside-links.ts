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
import { inPhoneApp } from './instance-choice';

/** The slice of Capacitor's Browser plugin this uses. */
type SystemBrowser = { open(options: { url: string }): Promise<void> };

function systemBrowser(): SystemBrowser | null {
	const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
	const found = capacitor?.Plugins?.Browser;
	return found ? (found as SystemBrowser) : null;
}

/** Whether following this address would take somebody out of the app. */
function leavesTheApp(link: HTMLAnchorElement): boolean {
	const href = link.getAttribute('href') ?? '';
	// A fragment, a path, a mailto, a tel: none of them are another website.
	if (!/^https?:\/\//i.test(href)) return false;
	try {
		return new URL(href, location.href).origin !== location.origin;
	} catch {
		return false;
	}
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
		if (!browser) return;

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
