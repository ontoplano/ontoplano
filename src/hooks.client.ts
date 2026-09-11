/**
 * The one place early enough for the bridge.
 *
 * On a local instance the very first thing the client does — before any
 * layout mounts — is fetch its route's data, and that fetch must already be
 * answered from the device. This module is evaluated before SvelteKit's
 * router starts, which is what makes it the right place and the layout the
 * wrong one.
 */
import { isLocalApp } from '$lib/local/mode';
import { installLocalBridge } from '$lib/local/bridge';

if (isLocalApp()) installLocalBridge();
