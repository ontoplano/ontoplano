<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { flushNow, takeBack, undoable } from '$lib/undo.svelte';
	import { said } from '$lib/said.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * What just happened, and the way back.
	 *
	 * One line per held action — a deletion, a todo ticked off — stacked above the
	 * bottom bar on a phone and in the corner on a wide screen. It counts down,
	 * because a window you cannot see the end of is a window you do not trust.
	 */
	let now = $state(Date.now());

	// Only what can still be taken back — an entry past its window is holding
	// the row on screen until the write lands, and has no toast to show.
	const waiting = $derived(undoable());

	$effect(() => {
		if (waiting.length === 0) return;

		const tick = setInterval(() => (now = Date.now()), 200);
		return () => clearInterval(tick);
	});

	// Leaving the page sends what is waiting. A confirmed delete must not be
	// forgotten because somebody clicked a link four seconds later.
	beforeNavigate(flushNow);
</script>

<svelte:window onbeforeunload={flushNow} />

<!--
	One place on the screen where the app speaks.

	Two kinds of message live here: something you can take back, which holds
	its window open, and something the app is merely confirming. Two float
	layers would stack on top of each other in the same corner, so they share
	this one.
-->
{#if waiting.length > 0 || said.items.length > 0}
	<div
		class="float-layer pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:items-end lg:px-6"
	>
		{#each said.items as item (item.id)}
			<div
				class="overlay-face pointer-events-auto flex w-full max-w-sm items-center gap-3 border px-4 py-3 text-sm shadow-overlay"
				role="status"
			>
				<Icon name="check" size={16} />
				<span class="min-w-0 flex-1">{item.message}</span>
			</div>
		{/each}
		{#each waiting as item (item.id)}
			{@const left = Math.max(0, Math.ceil((item.until - now) / 1000))}
			<div
				class="overlay-face pointer-events-auto flex w-full max-w-sm items-center gap-3 border px-4 py-3 text-sm shadow-overlay"
				role="status"
			>
				<span class="min-w-0 flex-1 truncate">{item.message}</span>
				<span class="overlay-face-quiet tabular shrink-0 text-xs">{left}s</span>
				<!-- No colour of its own: the face sets the ink, and a palette
				     colour here is the bug `.overlay-face-quiet` exists to stop. -->
				<button
					onclick={() => takeBack(item.id)}
					class="shrink-0 font-medium underline underline-offset-2"
				>
					<Icon name="undo" />
					{t('ui.undo')}
				</button>
			</div>
		{/each}
	</div>
{/if}
