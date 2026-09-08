<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from '$lib/components/Icon.svelte';
	import { reminderHref } from '$lib/reminders';
	import { enablePush, pushSupported } from '$lib/push';
	import { page } from '$app/state';

	/**
	 * The one thing in this app that reaches out.
	 *
	 * Everything else waits to be visited, which is why a planner stops helping
	 * in week two. This asks the server once a minute — only while the tab is
	 * actually being looked at, because a background tab polling forever is a
	 * battery complaint — and puts whatever is due on the screen.
	 *
	 * If the browser has been given permission it also raises a system
	 * notification from the page itself. That only reaches somebody who has the
	 * app open; what reaches a phone with everything closed is web push, which
	 * this component signs the browser up for — see `$lib/push.ts` and the
	 * delivery job — and which is a separate channel with its own stamp, so the
	 * two cannot swallow each other.
	 *
	 * A reminder is marked delivered only once it is actually on screen, so a
	 * failed poll loses nothing and one that fell due overnight still arrives.
	 *
	 * The card leads to the day the block is on. A notification you cannot follow
	 * is one you have to remember twice — once because it told you, and again
	 * because looking at the thing it is about means going and finding it.
	 */
	type Due = {
		id: number;
		message: string;
		remindAt: string;
		subjectKind?: string | null;
		subjectId?: number | null;
		/** A URL to play, or null for the ones that only show. */
		sound?: string | null;
	};

	const EVERY = 60_000;

	let due = $state<Due[]>([]);
	let asked = $state(false);
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
			const fresh = (body.due ?? []).filter((r) => !due.some((d) => d.id === r.id));
			if (fresh.length === 0) return;

			due = [...due, ...fresh];
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
			// the notification itself has already been shown.
		});
	}

	/** A system notification, if this browser has been told it may. */
	function announce(items: Due[]) {
		ring(items);
		if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
		for (const item of items) {
			try {
				new Notification(item.message, { tag: `ontoplano-reminder-${item.id}`, body: 'ontoplano' });
			} catch {
				// Some browsers refuse outside a service worker. The card below stands.
			}
		}
	}

	/**
	 * Yes, from a click — which is the only place a browser will take it.
	 *
	 * Permission and a push subscription are two different things and both are
	 * asked for here: granting permission alone would raise notifications while
	 * the app is open and nothing at all once it is closed, which is the state
	 * this whole feature exists to leave.
	 */
	async function allow() {
		asked = true;
		await enablePush(page.data.pushKey ?? null);
	}

	/**
	 * A browser that already said yes, signed up again on every load.
	 *
	 * Permission survives forever; a push subscription does not — it is dropped
	 * when site data is cleared, when the push service rotates it, when the
	 * worker is replaced. Re-registering costs one request against an upsert and
	 * is the difference between reminders that keep working for months and
	 * reminders that stop without anybody noticing.
	 */
	$effect(() => {
		if (!browser || !pushSupported() || Notification.permission !== 'granted') return;
		const key = page.data.pushKey;
		if (!key) return;
		void enablePush(key);
	});

	async function dismiss(id: number) {
		due = due.filter((r) => r.id !== id);
		await fetch('/api/reminders', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'dismiss', ids: [id] })
		}).catch(() => {});
	}

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

	const canAsk = $derived(
		browser &&
			typeof Notification !== 'undefined' &&
			Notification.permission === 'default' &&
			!asked
	);
</script>

<!-- One element for every reminder that rings: two overlapping copies of the
     same ringtone is not a sound anybody wants. -->
<audio bind:this={audio} class="hidden" preload="none"></audio>

{#if due.length > 0}
	<!--
		Above the navigation bar on a phone and out of the corner on a desktop.
		Deliberately not a dialog: a reminder is news, not a question, and it must
		never stop you doing the thing it is reminding you about.
	-->
	<div
		class="float-layer fixed inset-x-3 z-[70] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-80"
		style="bottom: calc(var(--mobile-nav-height) + var(--safe-bottom) + 5.5rem)"
	>
		{#each due as reminder (reminder.id)}
			<div
				class="rise flex items-start gap-3 border border-gray-300 bg-white p-3 shadow-overlay"
				role="status"
			>
				<span class="mt-0.5 shrink-0 text-gray-500"><Icon name="clock" size={16} /></span>
				<div class="min-w-0 flex-1">
					<!-- Where the thing it is about actually is. Resolved in
					     `$lib/reminders.ts`, which the list uses too. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={reminderHref(reminder)}
						onclick={() => dismiss(reminder.id)}
						class="block text-sm font-medium text-gray-900 hover:underline"
					>
						{reminder.message}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<p class="tabular mt-0.5 text-xs text-gray-500">{reminder.remindAt.slice(11, 16)}</p>
					{#if canAsk}
						<button
							onclick={allow}
							class="mt-1.5 text-xs text-gray-500 underline hover:text-gray-900"
						>
							Let ontoplano notify you outside the tab
						</button>
					{/if}
				</div>
				<button
					onclick={() => dismiss(reminder.id)}
					class="shrink-0 text-gray-500 hover:text-gray-900"
					title="Dismiss"
					aria-label="Dismiss {reminder.message}"
				>
					<Icon name="close" size={16} />
				</button>
			</div>
		{/each}
	</div>
{/if}
