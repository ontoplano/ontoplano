<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * The recipe, at arm's length.
	 *
	 * Cooking is the one time somebody uses this app with wet hands, from across
	 * a counter, while something is on the heat. The ordinary recipe page is the
	 * wrong shape for that: two columns, 14px type, and a screen that goes dark
	 * halfway through the onions.
	 *
	 * So: one column, big type, the ingredients pinned above the method, and a
	 * wake lock. Ticking an ingredient is deliberately not saved — it is about
	 * this pan, not this recipe.
	 */
	type Ingredient = {
		id: number;
		name: string;
		quantity: number | null;
		unit: string | null;
		note: string | null;
	};

	let {
		title,
		ingredients,
		methodHtml,
		onclose
	}: {
		title: string;
		ingredients: Ingredient[];
		/** Already escaped by `renderMarkdown`. */
		methodHtml: string;
		onclose: () => void;
	} = $props();

	let used = $state<number[]>([]);

	/**
	 * A `<dialog>`, not a fixed overlay.
	 *
	 * The first version was `fixed inset-0 z-50` and the close button was
	 * unreachable: the page renders inside a `<main>` that establishes its own
	 * stacking context, so no z-index in there can climb over the site header.
	 * `showModal()` puts this in the browser's top layer, above everything, and
	 * brings the focus trap and the inert background with it.
	 */
	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (dialog && !dialog.open) dialog.showModal();
	});

	/**
	 * Keep the screen awake.
	 *
	 * Not supported everywhere and not worth a fallback: the worst case is the
	 * screen dimming, which is what happens today anyway. It is also released by
	 * the browser when the tab is hidden, so it is re-acquired on return.
	 */
	let lock: WakeLockSentinel | null = null;

	async function hold() {
		try {
			lock = await navigator.wakeLock?.request('screen');
		} catch {
			lock = null;
		}
	}

	function onVisible() {
		if (document.visibilityState === 'visible' && !lock) hold();
	}

	$effect(() => {
		hold();
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			lock?.release();
			lock = null;
		};
	});

	onDestroy(() => lock?.release());

	function toggle(id: number) {
		used = used.includes(id) ? used.filter((u) => u !== id) : [...used, id];
	}

	function amount(i: Ingredient): string {
		return [i.quantity, i.unit].filter(Boolean).join(' ');
	}

	/**
	 * The method's checkboxes, made tickable.
	 *
	 * `renderMarkdown` emits them disabled everywhere else, and rightly: a
	 * checkbox that forgets what you told it is worse than a bullet. Here it is
	 * the point — the ticks are about this pan, not this recipe, exactly like
	 * the ingredients above them.
	 */
	let body: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!body) return;
		for (const box of body.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
			box.disabled = false;
		}
	});
</script>

<dialog
	bind:this={dialog}
	oncancel={(e) => {
		e.preventDefault();
		onclose();
	}}
	class="cook-sheet m-0 h-full max-h-none w-full max-w-none bg-white p-0"
>
	<div class="flex h-full flex-col">
		<header
			class="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-4 py-3"
		>
			<h1 class="min-w-0 truncate text-lg font-bold text-gray-900">{title}</h1>
			<button
				onclick={onclose}
				class="btn btn-sm"
				title="Leave cook mode"
				aria-label="Leave cook mode"
			>
				<Icon name="close" size={18} />
			</button>
		</header>

		<div class="min-h-0 flex-1 overflow-y-auto">
			<div class="mx-auto max-w-3xl px-4 py-6">
				{#if ingredients.length}
					<!-- Pinned, because the question during step four is always "how much
					     of the thing from step one". -->
					<ul
						class="sticky top-0 z-10 mb-6 flex flex-wrap gap-x-6 gap-y-2 border-b border-gray-200 bg-white pb-4"
					>
						{#each ingredients as i (i.id)}
							<li>
								<button
									type="button"
									onclick={() => toggle(i.id)}
									class="text-left text-lg leading-tight {used.includes(i.id)
										? 'text-gray-500 line-through'
										: 'text-gray-900'}"
									title={used.includes(i.id) ? 'Not used yet' : 'Used'}
								>
									{#if amount(i)}<span class="tabular font-semibold">{amount(i)}</span>{/if}
									{i.name}
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				{#if methodHtml}
					<!-- `renderMarkdown` escapes everything before it emits a tag. -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div bind:this={body} class="md cook text-xl leading-relaxed text-gray-900">
						{@html methodHtml}
					</div>
				{:else}
					<p class="text-lg text-gray-500">No method written for this one yet.</p>
				{/if}
			</div>
		</div>
	</div>
</dialog>
