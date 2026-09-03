<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { flushNow, takeBack, undo } from '$lib/undo.svelte';

	/**
	 * What just happened, and the way back.
	 *
	 * One line per held action — a deletion, a todo ticked off — stacked above the
	 * bottom bar on a phone and in the corner on a wide screen. It counts down,
	 * because a window you cannot see the end of is a window you do not trust.
	 */
	let now = $state(Date.now());

	$effect(() => {
		if (undo.pending.length === 0) return;

		const tick = setInterval(() => (now = Date.now()), 200);
		return () => clearInterval(tick);
	});

	// Leaving the page sends what is waiting. A confirmed delete must not be
	// forgotten because somebody clicked a link four seconds later.
	beforeNavigate(flushNow);
</script>

<svelte:window onbeforeunload={flushNow} />

{#if undo.pending.length > 0}
	<div
		class="float-layer pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:items-end lg:px-6"
	>
		{#each undo.pending as item (item.id)}
			{@const left = Math.max(0, Math.ceil((item.until - now) / 1000))}
			<div
				class="pointer-events-auto flex w-full max-w-sm items-center gap-3 border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white shadow-overlay"
				role="status"
			>
				<span class="min-w-0 flex-1 truncate">{item.message}</span>
				<span class="tabular shrink-0 text-xs text-gray-500">{left}s</span>
				<button
					onclick={() => takeBack(item.id)}
					class="shrink-0 font-medium text-white underline underline-offset-2"
				>
					<Icon name="undo" /> Undo
				</button>
			</div>
		{/each}
	</div>
{/if}
