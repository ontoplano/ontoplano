<script lang="ts">
	import { launchAddress, storedInstance } from '$lib/instance-choice';
	import { ringFor, stopRinging } from '$lib/phone-notifications';

	/**
	 * Where the phone is told what to ring for.
	 *
	 * The two halves of this cannot meet anywhere else. An instance can mint a
	 * key, because that is where the session is; only the copy of ontoplano the
	 * phone carries can hand that key to the shell, because the shell's plugins
	 * reach its own origin and no further. So the instance sends somebody here
	 * with the answer, this stores it, and the app goes back to where it was.
	 *
	 * The key rides in the address because the two origins have nothing else in
	 * common — storage belongs to an origin, and there is no server on this side
	 * to post to. It is the narrowest key the app issues, it is replaced rather
	 * than added to whenever this runs again, and the address it rides in exists
	 * for one frame inside a web view with no address bar. `location.replace`
	 * twice, so it is not a page anybody can go back to.
	 *
	 * Nothing here is a screen: whatever is drawn is what somebody sees for the
	 * length of one round trip to the shell.
	 */
	let said = $state('Setting the alarm clock…');

	$effect(() => {
		const carried = new URLSearchParams(location.search);
		const instance = carried.get('at') ?? storedInstance();
		const key = carried.get('key');

		/*
		 * Back where it came from, carrying what happened.
		 *
		 * This page is a flicker: from the outside, pressing "set it up" went
		 * somewhere and came straight back to the screen you were on, which
		 * looks exactly like a button that does nothing. The word on the
		 * address is what lets the app say otherwise — see `hooks.client.ts`.
		 */
		const done = (where: string | null, rang?: 'on' | 'off' | 'failed') =>
			location.replace(where ? launchAddress(where, rang ? { rang } : {}) : '/');

		if (carried.has('off')) {
			stopRinging().then(() => done(instance, 'off'));
			return;
		}

		if (!instance || !key) {
			said = 'Nothing to set. Opening ontoplano…';
			done(instance);
			return;
		}

		ringFor(instance, key).then((ok) => {
			said = ok ? 'Done. Opening ontoplano…' : 'This phone could not take it.';
			// Even when it failed: standing on a blank page holding a key in the
			// address is worse than going on without alarms.
			done(instance, ok ? 'on' : 'failed');
		});
	});
</script>

<p class="p-6 text-sm text-gray-500">{said}</p>
