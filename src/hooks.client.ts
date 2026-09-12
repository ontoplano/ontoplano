/**
 * The one place early enough for the bridge.
 *
 * On a self-contained instance the very first thing the client does — before any
 * layout mounts — is fetch its route's data, and that fetch must already be
 * answered from the device. This module is evaluated before SvelteKit's
 * router starts, which is what makes it the right place and the layout the
 * wrong one.
 */
import { isSelfContained } from '$lib/self-contained/mode';
import { installSelfContainedBridge } from '$lib/self-contained/bridge';
import { servePicturesToServiceWorker } from '$lib/self-contained/pictures';

if (isSelfContained()) {
	installSelfContainedBridge();
	servePicturesToServiceWorker();
}
