import { DEVICE_ORIGIN, RING_PARAM, inPhoneApp } from '$lib/instance-choice';

/**
 * The instance's half of "this phone would like to ring for you".
 *
 * A phone cannot be woken by an instance — Android's web view has no Push API
 * — so it books Android's own alarms instead, which needs a key this instance
 * has to mint. Minting needs a session, so it happens here; keeping the key
 * needs the shell, which only the copy of ontoplano on the device can reach.
 * Two origins, one act, and the only thing that can cross between them is an
 * address.
 *
 * So a launch that found no key says so (`?ring=1`, put there by
 * `launchAddress`), this answers by minting one, and hands it to the device
 * copy at `/ring`, which stores it and comes straight back. Once per phone,
 * per instance. Nobody is asked, because there is nothing to ask: somebody
 * signed in to their own ontoplano in an app they installed, on a phone they
 * are holding, has already said everything that needs saying.
 *
 * Everything here fails quietly. A launch is the worst possible moment to put
 * an error in front of somebody, the cost of failing is that reminders arrive
 * while the app is open — which is what happened before any of this existed —
 * and the next launch tries again.
 */

/** Where keys are made. The action is there and not on the page that wants it
 *  because the isolated build compiles page server files into its worker, and
 *  the token service is not something to compile into a browser. */
const MINT = '/settings/integrations?/ringOnThisPhone';

export async function handOverRingerKey(url: URL): Promise<void> {
	if (!inPhoneApp() || url.searchParams.get(RING_PARAM) !== '1') return;

	try {
		const made = await fetch(MINT, {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body: new FormData()
		});
		if (!made.ok) return;

		/*
		 * A form action answers with a shape SvelteKit's client normally
		 * unwraps; here there is no form, so the one field this needs is read
		 * out of it. Anything else — a redirect to sign in, an error — has no
		 * key in it and stops this quietly.
		 */
		const key = keyFrom(await made.text());
		if (!key) return;

		location.replace(
			`${DEVICE_ORIGIN}/ring?at=${encodeURIComponent(url.origin)}&key=${encodeURIComponent(key)}`
		);
	} catch {
		// Offline, refused, no such route: the app carries on as it is.
	}
}

/** The key, out of an action's answer, without pretending to parse the rest. */
function keyFrom(body: string): string | null {
	return /onto_[A-Za-z0-9_-]+/.exec(body)?.[0] ?? null;
}
