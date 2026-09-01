<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from '$lib/components/Icon.svelte';
	import { reminderHref } from '$lib/reminders';

	/**
	 * The one thing in this app that reaches out.
	 *
	 * Everything else waits to be visited, which is why a planner stops helping
	 * in week two. This asks the server once a minute — only while the tab is
	 * actually being looked at, because a background tab polling forever is a
	 * battery complaint — and puts whatever is due on the screen.
	 *
	 * If the browser has been given permission it also raises a system
	 * notification, which needs no push service and therefore nobody else in the
	 * path. That only works while a tab is open; the channel that works with the
	 * app closed is the Telegram bot on a self-hosted box, which reads the same
	 * rows.
	 *
	 * A reminder is marked delivered only once it is actually on screen, so a
	 * failed poll loses nothing and one that fell due overnight still arrives.
	 *
	 * The card leads to the day the block is on. A notification you cannot follow
	 * is one you have to remember twice — once because it told you, and again
	 * because looking at the thing it is about means going and finding it.
	 */
	type Due = { id: number; message: string; remindAt: string };

	const EVERY = 60_000;

	let due = $state<Due[]>([]);
	let asked = $state(false);

	async function poll() {
		if (!browser || document.visibilityState !== 'visible') return;

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

	/** A system notification, if this browser has been told it may. */
	function announce(items: Due[]) {
		if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
		for (const item of items) {
			try {
				new Notification(item.message, { tag: `ontoplano-reminder-${item.id}`, body: 'ontoplano' });
			} catch {
				// Some browsers refuse outside a service worker. The card below stands.
			}
		}
	}

	async function allow() {
		asked = true;
		if (typeof Notification === 'undefined') return;
		await Notification.requestPermission();
	}

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

{#if due.length > 0}
	<!--
		Above the navigation bar on a phone and out of the corner on a desktop.
		Deliberately not a dialog: a reminder is news, not a question, and it must
		never stop you doing the thing it is reminding you about.
	-->
	<div
		class="fixed inset-x-3 z-[70] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-80"
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
						href={reminderHref(reminder.remindAt)}
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
