<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { findDestinations, type Destination } from '$lib/destinations';
	import { KIND_LABELS, MIN_QUERY, type Hit } from '$lib/search';
	import { palette } from '$lib/palette.svelte';

	/**
	 * One box that goes anywhere.
	 *
	 * Two lists in one: the places in the app, matched as you type, and the
	 * things you own, fetched from `/api/search`. The first is instant and the
	 * second arrives when it arrives, so typing never waits on the network.
	 *
	 * It is also the accessible path to everything a gesture menu would do — a
	 * radial menu is invisible to a screen reader, and this is not.
	 */
	let query = $state('');
	let cursor = $state(0);
	let hits = $state<Hit[]>([]);
	let input = $state<HTMLInputElement | null>(null);

	const places = $derived(findDestinations(query).slice(0, query ? 6 : 8));
	type Row = { sort: 'place'; place: Destination } | { sort: 'thing'; hit: Hit };
	const rows = $derived<Row[]>([
		...places.map((place) => ({ sort: 'place' as const, place })),
		...hits.slice(0, 12).map((hit) => ({ sort: 'thing' as const, hit }))
	]);

	function show() {
		palette.open = true;
		query = '';
		hits = [];
		cursor = 0;
		// The input only exists once the dialog has rendered.
		queueMicrotask(() => input?.focus());
	}

	function hide() {
		palette.open = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		const typing =
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement;

		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			if (palette.open) hide();
			else show();
			return;
		}

		// `/` as well, because Ctrl+K is the browser's own search box in Firefox
		// and this should not be a fight over a key. Only when nothing is being
		// typed into, which is the same guard every other shortcut here uses.
		if (!palette.open && e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			show();
			return;
		}

		if (!palette.open) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			hide();
			return;
		}
		if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
			e.preventDefault();
			cursor = Math.min(cursor + 1, Math.max(rows.length - 1, 0));
		}
		if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
			e.preventDefault();
			cursor = Math.max(cursor - 1, 0);
		}
		if (e.key === 'Enter' && typing) {
			e.preventDefault();
			choose(rows[cursor]);
		}
	}

	async function choose(row: Row | undefined) {
		// `goto` targets that `resolve()` cannot check: a hit's href is built from
		// the row it was found in, and the search page carries a query string.
		if (!row) {
			// Nothing highlighted: fall through to the full results page.
			if (query.trim().length >= MIN_QUERY) {
				hide();
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				await goto(`${resolve('/search')}?q=${encodeURIComponent(query)}`);
			}
			return;
		}

		hide();
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(row.sort === 'place' ? row.place.href : row.hit.href);
	}

	// It can also be opened from outside, by the header button.
	$effect(() => {
		if (palette.open) queueMicrotask(() => input?.focus());
	});

	// Debounced, and only once there is enough to be worth asking about.
	$effect(() => {
		const q = query.trim();
		cursor = 0;
		if (!palette.open || q.length < MIN_QUERY) {
			hits = [];
			return;
		}

		const timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				if (res.ok) hits = (await res.json()).hits;
			} catch {
				// A palette that cannot reach the server still navigates.
			}
		}, 160);

		return () => clearTimeout(timer);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if palette.open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-gray-900/40 px-4 pt-[12vh]"
		onclick={(e) => e.target === e.currentTarget && hide()}
	>
		<div class="w-full max-w-xl border border-gray-200 bg-white shadow-overlay" role="dialog">
			<input
				bind:this={input}
				bind:value={query}
				placeholder="Go anywhere, or find anything"
				aria-label="Command palette"
				class="w-full border-b border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none"
			/>

			<div class="max-h-[50vh] overflow-y-auto">
				<!-- The destinations are typed; a hit's href is built from the row it was
				     found in, so `resolve()` has nothing to check. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				{#each rows as row, i (row.sort === 'place' ? `p${row.place.href}` : `h${row.hit.kind}${row.hit.id}`)}
					<a
						href={row.sort === 'place' ? row.place.href : row.hit.href}
						onclick={hide}
						onmouseenter={() => (cursor = i)}
						class="flex items-center gap-3 px-4 py-2.5 text-sm {i === cursor ? 'bg-gray-100' : ''}"
					>
						{#if row.sort === 'place'}
							<Icon name={row.place.icon} class="shrink-0 text-gray-500" />
							<span class="text-gray-900">{row.place.label}</span>
							{#if row.place.group}
								<span class="text-xs text-gray-500">{row.place.group}</span>
							{/if}
						{:else}
							<Icon name="tag" class="shrink-0 text-gray-300" />
							<span class="min-w-0 flex-1 truncate text-gray-900">{row.hit.title}</span>
							<span class="eyebrow shrink-0 text-gray-500">{KIND_LABELS[row.hit.kind]}</span>
						{/if}
					</a>
				{/each}
				<!-- eslint-enable svelte/no-navigation-without-resolve -->

				{#if rows.length === 0}
					<p class="px-4 py-6 text-center text-sm text-gray-500">
						{query.trim().length < MIN_QUERY ? 'Type to search' : 'Nothing matches'}
					</p>
				{/if}
			</div>

			<div
				class="kbd-hint flex items-center gap-3 border-t border-gray-200 px-4 py-2 text-xs text-gray-500"
			>
				<span><kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">↑↓</kbd> move</span>
				<span><kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">↵</kbd> open</span>
				<span
					><kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">esc</kbd> close</span
				>
				<!-- The same syntax the search page teaches, where somebody typing is
				     most likely to want it. -->
				<span class="ml-auto"
					><kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">todo:</kbd>
					<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">in:</kbd> narrow</span
				>
			</div>
		</div>
	</div>
{/if}
