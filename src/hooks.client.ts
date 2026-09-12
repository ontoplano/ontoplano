/**
 * The one place early enough for the bridge.
 *
 * On an isolated instance the very first thing the client does — before any
 * layout mounts — is fetch its route's data, and that fetch must already be
 * answered from the device. This module is evaluated before SvelteKit's
 * router starts, which is what makes it the right place and the layout the
 * wrong one.
 */
import { isIsolated, isIsolatedBuild } from '$lib/isolated/mode';
import { sendOutsideLinksToTheBrowser } from '$lib/outside-links';
import { backGestureGoesBack } from '$lib/phone-back';
import { installIsolatedBridge } from '$lib/isolated/bridge';
import { servePicturesToServiceWorker } from '$lib/isolated/pictures';
import {
	ARRIVING_AT,
	ARRIVING_HOME,
	ARRIVING_TO_ASK,
	forgetInstance,
	inPhoneApp,
	rememberInstance,
	storedInstance
} from '$lib/instance-choice';

/*
 * Which ontoplano this launch is for.
 *
 * Every phone app carries the whole app inside it and boots on that copy, so
 * the first thing a launch does is read what the person chose last time: an
 * address means go there, "this phone" means stay, and nothing written down
 * means nobody has been asked, which is what the instance screen is for.
 *
 * It also takes the answer when one arrives in the address. A page an instance
 * served cannot write this, because storage belongs to an origin and that is
 * not the origin the app boots from — so leaving an instance is a navigation
 * back here carrying what was decided. This runs before the router, which is
 * why the answer is acted on before anything draws.
 *
 * Only inside the phone app, and only on the copy it carries. A browser at a
 * hosted instance is already where it was told to be, and sending it anywhere
 * on the strength of a key in its own storage would be the app deciding where
 * somebody's week lives.
 */
if (inPhoneApp() && isIsolatedBuild()) {
	const carried = new URLSearchParams(location.search);

	if (carried.has(ARRIVING_TO_ASK)) {
		// "Ask me again" — the way out of an instance, and the one arrival that
		// must not be sent anywhere: the question is the destination.
		forgetInstance();
	} else if (carried.has(ARRIVING_HOME)) {
		rememberInstance(null);
		location.replace('/');
	} else if (carried.get(ARRIVING_AT)) {
		const instance = carried.get(ARRIVING_AT)!;
		rememberInstance(instance);
		location.replace(instance);
	} else {
		/*
		 * An address is a real navigation — it leaves this origin.
		 *
		 * "Nobody has been asked yet" is not: it is a move to a screen this app
		 * already carries, and `location.replace` for that asks the shell to
		 * serve `/instance` as a file. Capacitor's own file server has no such
		 * file and answers nothing, which is a white screen on first launch —
		 * the state every fresh install is in. So that one is left to the
		 * router, in the root layout, where it is one line of `goto`.
		 */
		const going = storedInstance();
		if (going) location.replace(going);
	}
}

if (isIsolated()) {
	installIsolatedBridge();
	servePicturesToServiceWorker();
}

/*
 * And in the phone app, anything that is not this instance opens outside it.
 *
 * Not only on the isolated build: an app pointed at a server has the same web
 * view and the same problem — the documentation replaced the app and the back
 * gesture minimised it.
 */
/*
 * Nothing here may take the app down with it.
 *
 * These are conveniences for the phone — a link that opens outside the app, a
 * back gesture that goes back — and this module runs while the client is
 * starting. A throw here is not a broken convenience, it is a blank screen:
 * one of them called `.then` on a Capacitor listener handle that is not a
 * promise, and every build of the app opened to nothing at all, on every
 * flavour, with one line in logcat to say why.
 *
 * So each is called on its own and each is allowed to fail on its own. If the
 * back gesture cannot be wired up, the app still opens.
 */
function optional(what: string, start: () => unknown): void {
	try {
		start();
	} catch (e) {
		console.warn(`ontoplano: ${what} is not available here`, e);
	}
}

optional('opening outside links in the browser', sendOutsideLinksToTheBrowser);
optional('the back gesture', backGestureGoesBack);
