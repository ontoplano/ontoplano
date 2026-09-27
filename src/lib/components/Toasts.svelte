<script lang="ts">
	/**
	 * The one place on the screen where the app speaks.
	 *
	 * Three stores feed it — `notify` for success and errors, `say` for a
	 * receipt, `undo` for something that can still be taken back — and they
	 * used to be two layers in opposite corners with two looks. One layer and
	 * one `Toast` now, so a message is a message wherever it came from.
	 */
	import { beforeNavigate } from '$app/navigation';
	import Toast from '$lib/components/Toast.svelte';
	import { dismiss, notices } from '$lib/notify.svelte';
	import { said, unsay } from '$lib/said.svelte';
	import { flushNow, takeBack, undo, undoable } from '$lib/undo.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	/** How often the counts are redrawn and the expired notices dropped. */
	const TICK_MS = 200;

	let now = $state(Date.now());

	const waiting = $derived(undoable());
	const timed = $derived(
		waiting.length > 0 || said.items.length > 0 || notices.items.some((n) => n.until !== null)
	);

	$effect(() => {
		if (!timed) return;
		const tick = setInterval(() => {
			now = Date.now();
			for (const n of notices.items) if (n.until !== null && n.until <= now) dismiss(n.id);
		}, TICK_MS);
		return () => clearInterval(tick);
	});

	beforeNavigate(flushNow);
</script>

<svelte:window onbeforeunload={flushNow} />

{#if notices.items.length > 0 || said.items.length > 0 || waiting.length > 0}
	<!-- Newest last, which is the bottom: nearest the thumb on a phone. -->
	<div class="toasts float-layer" aria-live="polite">
		{#each notices.items as notice (notice.id)}
			<Toast
				kind={notice.kind}
				message={notice.message}
				{now}
				until={notice.until}
				ondismiss={() => dismiss(notice.id)}
			/>
		{/each}
		{#each said.items as item (item.id)}
			<Toast
				message={item.message}
				{now}
				until={item.until}
				window={item.window}
				action={item.action
					? {
							label: item.action.label,
							run: () => {
								const run = item.action?.run;
								unsay(item.id);
								run?.();
							}
						}
					: undefined}
			/>
		{/each}
		{#each waiting as item (item.id)}
			<Toast
				kind="info"
				message={item.message}
				{now}
				until={item.until}
				window={undo.seconds * 1000}
				action={{ label: t('ui.undo'), icon: 'undo', run: () => takeBack(item.id) }}
			/>
		{/each}
	</div>
{/if}

<style>
	.toasts {
		position: fixed;
		/* Above the bar the rooms are on, and above whatever the phone itself
		   keeps down there. The same two numbers the bar is built from. */
		bottom: calc(var(--safe-bottom) + var(--mobile-nav-height) + 0.75rem);
		right: 0.75rem;
		left: 0.75rem;
		z-index: 60;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		pointer-events: none;
	}

	@media (width >= 64rem) {
		.toasts {
			bottom: 1.5rem;
			right: 1.5rem;
			left: auto;
			width: 26rem;
		}
	}
</style>
