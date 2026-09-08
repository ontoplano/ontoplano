<script lang="ts">
	import { browser } from '$app/environment';
	import { enablePush, pushSupported } from '$lib/push';
	import { page } from '$app/state';

	/**
	 * The one thing in this app that reaches out.
	 *
	 * Everything else waits to be visited, which is why a planner stops helping
	 * in week two. This asks the server for what has fallen due, raises the
	 * system's own notification for each one, and plays a sound if that reminder
	 * asked for one.
	 *
	 * ## It draws nothing
	 *
	 * There used to be a card: a panel floating above the navigation bar with the
	 * reminder in it and an × to close. It is gone. A reminder that has already
	 * arrived as a notification does not also need a second copy of itself on the
	 * screen with its own separate dismissal — that is two things to close for
	 * one thing that happened, and the phone's notification is the better of the
	 * two, since it arrives whether or not the app is in front.
	 *
	 * So what is left is machinery: the poll, the notification, the sound, and
	 * the stamp that stops a thing being announced twice. Asking the browser for
	 * permission moved to the Reminders page, which is where somebody already is
	 * when they want this to work. Dismissing lives there too.
	 *
	 * A reminder is marked delivered only once it has actually been announced, so
	 * a failed poll loses nothing and one that fell due overnight still arrives.
	 * Web push is a separate channel with its own stamp — see `$lib/push.ts` and
	 * the delivery job — so the two cannot swallow each other.
	 */
	type Due = { id: number; message: string; sound: string | null };

	const EVERY = 60_000;

	/**
	 * What has already been said, so a poll that overlaps the request marking
	 * them delivered cannot say it again.
	 */
	// A plain Set on purpose: nothing renders from it, so reactivity would be a
	// proxy around a thing only this function ever reads.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const announced = new Set<number>();

	/** Consecutive polls with the page out of sight, which slows them down. */
	let outOfSight = 0;

	async function poll() {
		if (!browser) return;
		/*
		 * A page out of sight still asks, just less often.
		 *
		 * It used to skip entirely whenever the tab was not in front — and a tab
		 * in the background is the ordinary way to have this app open all day, so
		 * somebody with it open on a second screen was told nothing until they
		 * looked. Every fifth minute rather than every minute: enough that a
		 * reminder is never more than five minutes late on a machine that is
		 * awake, cheap enough that a forgotten tab is not a battery complaint.
		 * A phone with the screen off is push's job, not this one's.
		 */
		if (document.visibilityState !== 'visible') {
			outOfSight += 1;
			if (outOfSight % 5 !== 0) return;
		} else {
			outOfSight = 0;
		}

		try {
			const res = await fetch('/api/reminders');
			if (!res.ok) return;

			const body = (await res.json()) as { due?: Due[] };
			const fresh = (body.due ?? []).filter((r) => !announced.has(r.id));
			if (fresh.length === 0) return;

			for (const item of fresh) announced.add(item.id);
			announce(fresh);

			await fetch('/api/reminders', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids: fresh.map((r) => r.id) })
			});
		} catch {
			// Offline, or the server went away. It is still due next minute.
		}
	}

	/**
	 * The sound, for the reminders that asked for one.
	 *
	 * One element reused rather than one per reminder: two alarms in the same
	 * minute is a thing that happens, and two overlapping copies of the same
	 * ringtone is not a sound anybody wants. The server decides whether this
	 * one is audible at all — the page only plays what it is handed.
	 */
	let audio: HTMLAudioElement | undefined = $state();

	function ring(items: Due[]) {
		const sound = items.find((item) => item.sound)?.sound;
		if (!sound || !audio) return;
		audio.src = sound;
		void audio.play().catch(() => {
			// A browser that will not play without a gesture is not an error —
			// the notification has been raised either way.
		});
	}

	function announce(items: Due[]) {
		ring(items);
		if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
		for (const item of items) {
			try {
				new Notification(item.message, { tag: `ontoplano-reminder-${item.id}`, body: 'ontoplano' });
			} catch {
				// Some browsers refuse one outside a service worker, where push
				// already raises it. Nothing else to fall back to, and nothing lost.
			}
		}
	}

	/**
	 * A browser that already said yes, signed up again on every load.
	 *
	 * Permission survives forever; a push subscription does not — it is dropped
	 * when site data is cleared, when the push service rotates it, when the
	 * worker is replaced. Re-registering costs one request against an upsert and
	 * is the difference between reminders that keep working for months and
	 * reminders that stop without anybody noticing.
	 *
	 * Asking in the first place is the Reminders page's job: a browser only takes
	 * that from a click, and this component has nothing to click.
	 */
	$effect(() => {
		if (!browser || !pushSupported() || Notification.permission !== 'granted') return;
		const key = page.data.pushKey;
		if (!key) return;
		void enablePush(key);
	});

	$effect(() => {
		if (!browser) return;

		poll();
		const timer = setInterval(poll, EVERY);
		// Coming back to the tab is exactly when you want to know what you missed.
		document.addEventListener('visibilitychange', poll);

		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', poll);
		};
	});
</script>

<!--
	All that is drawn: one element for every reminder that rings, because two
	overlapping copies of the same ringtone is not a sound anybody wants.
-->
<audio bind:this={audio} class="hidden" preload="none"></audio>
