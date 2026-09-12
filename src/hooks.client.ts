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
import { installIsolatedBridge } from '$lib/isolated/bridge';
import { servePicturesToServiceWorker } from '$lib/isolated/pictures';
import { CHOOSE_PATH, inPhoneApp, storedChoice, storedInstance } from '$lib/instance-choice';

/*
 * Which ontoplano this launch is for.
 *
 * Every phone app carries the whole app inside it and boots on that copy, so
 * the first thing a launch does is read what the person chose last time: an
 * address means go there, "this phone" means stay, and nothing written down
 * means nobody has been asked, which is what the instance screen is for.
 *
 * Only inside the phone app, and only on the copy it carries. A browser at a
 * hosted instance is already where it was told to be, and sending it anywhere
 * on the strength of a key in its own storage would be the app deciding where
 * somebody's week lives.
 */
if (inPhoneApp() && isIsolatedBuild()) {
	const going = storedInstance();
	if (going) location.replace(going);
	else if (!storedChoice() && !location.pathname.startsWith(CHOOSE_PATH)) {
		location.replace(CHOOSE_PATH);
	}
}

if (isIsolated()) {
	installIsolatedBridge();
	servePicturesToServiceWorker();
}
