<script lang="ts">
	import { page } from '$app/state';
	import { GLOBAL_SHORTCUTS, PAGE_SHORTCUTS, getDisplayShortcuts } from '$lib/shortcuts';

	let show = $state(false);

	let currentPath = $derived(page.url.pathname);
	let pageDisplay = $derived(getDisplayShortcuts(currentPath));
	let pageLabel = $derived(PAGE_SHORTCUTS[currentPath]?.label);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === '?') {
			e.preventDefault();
			show = !show;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed right-4 bottom-4 z-50">
	{#if show}
		<div class="mb-2 w-72 border border-gray-200 bg-white p-4 shadow-sm">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-sm font-bold text-gray-900">Keyboard Shortcuts</h3>
				<button
					onclick={() => (show = false)}
					class="text-xs text-gray-400 hover:text-gray-600"
				>
					close
				</button>
			</div>

		{#if pageDisplay.length > 0}
			<div class="mb-3">
				<h4 class="mb-1 text-xs font-medium text-gray-500">{pageLabel}</h4>
				<div class="space-y-0.5">
					{#each pageDisplay as s}
						<div class="flex items-center justify-between text-xs">
							<kbd class="border border-gray-300 bg-gray-50 px-1 font-mono">{s.displayKey}</kbd>
							<span class="text-gray-600">{s.description}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

			<div>
				<h4 class="mb-1 text-xs font-medium text-gray-500">Global</h4>
				<div class="space-y-0.5">
				{#each GLOBAL_SHORTCUTS as s}
					<div class="flex items-center justify-between text-xs">
						<kbd class="border border-gray-300 bg-gray-50 px-1 font-mono">{s.key === 'Escape' ? 'Esc' : s.key}</kbd>
						<span class="text-gray-600">{s.description}</span>
					</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<button
		onclick={() => (show = !show)}
		class="flex h-8 w-8 items-center justify-center border border-gray-300 bg-white text-sm text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-700"
		title="Keyboard shortcuts (?)"
	>
		?
	</button>
</div>
