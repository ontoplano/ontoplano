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
	if (env.PUBLIC_ONTOPLANO_SELF_CONTAINED === 'true') return true;
	return (
		env.PUBLIC_ONTOPLANO_SELF_CONTAINED_OPT_IN === 'true' &&
		new URLSearchParams(location.search).has('selfContained')
	);
}
