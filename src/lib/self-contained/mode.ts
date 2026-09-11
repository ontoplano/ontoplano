/**
 * Whether this copy of the app is its own instance.
 *
 * Declared, not detected. The self-contained build ships with
 * `PUBLIC_ONTOPLANO_SELF_CONTAINED=true` baked in and everything follows from it; a
 * server build never sets it. The `?selfContained` query switch exists for one
 * audience — a build with `PUBLIC_ONTOPLANO_SELF_CONTAINED_OPT_IN=true`, which is the
 * e2e suite driving both modes through one server — and is dead in any build
 * that did not opt in, so a visitor typing it at a hosted instance changes
 * nothing.
 */
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

export function isSelfContained(): boolean {
	if (!browser) return false;
	if (isSelfContainedBuild()) return true;
	return (
		env.PUBLIC_ONTOPLANO_SELF_CONTAINED_OPT_IN === 'true' &&
		new URLSearchParams(location.search).has('selfContained')
	);
}

/**
 * Whether this is the built self-contained app, as opposed to the `?selfContained`
 * switch driving a page that a server is also serving.
 *
 * The difference decides what happens to a request the device cannot answer:
 * behind the switch it goes to the server, which is there; in the built app
 * there is no server at all, so it must become a sentence rather than a
 * request that hangs or comes back empty.
 */
export function isSelfContainedBuild(): boolean {
	return browser && env.PUBLIC_ONTOPLANO_SELF_CONTAINED === 'true';
}
