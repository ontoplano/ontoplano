<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	/**
	 * Two halves of one room, which is why they are tabs and not two rooms.
	 *
	 * They are the same rows: "I need it" is a shopping list, and the same
	 * thing with an address is "I have it, in the second drawer". Splitting
	 * them into separate rooms would mean adding a thing twice.
	 */
	const tabs = [
		{ href: resolve('/inventory/list'), label: 'To buy' },
		{ href: resolve('/inventory/things'), label: 'What I have' }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="shrink-0 text-lg font-bold text-gray-900">Inventory</h1>
	</div>

	<div class="flex gap-1 border-b border-gray-200">
		<!-- Resolved where the tabs are built, above; the rule reads the href
		     expression and cannot see through the array. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				class="px-4 py-2 text-sm font-medium transition {isActive(tab.href)
					? 'border-b-2 border-gray-900 text-gray-900'
					: 'text-gray-500 hover:text-gray-700'}"
			>
				{tab.label}
			</a>
		{/each}
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>

	{@render children()}
</div>
