<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	/**
	 * Three views of the same material: what you wrote, who it was about, and
	 * what subject it belonged to. Neither people nor notebooks are a separate
	 * section — they are indexes into the journal.
	 */
	const tabs = [
		{ path: '/diary', label: 'Entries' },
		{ path: '/diary/people', label: 'People' },
		{ path: '/diary/notebooks', label: 'Notebooks' }
	] as const;
</script>

<div class="space-y-4">
	<h1 class="text-lg font-bold text-gray-900">Diary</h1>

	<nav class="flex gap-1 border-b border-gray-200">
		{#each tabs as tab (tab.path)}
			{@const active = page.url.pathname === tab.path}
			<a
				href={resolve(tab.path)}
				class="border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors {active
					? 'font-semibold text-gray-900'
					: 'border-transparent text-gray-500 hover:text-gray-900'}"
				style={active ? 'border-color: var(--section-accent)' : ''}
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
