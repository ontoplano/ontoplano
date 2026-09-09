<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// One tab for now; the section is built to grow (income, a month's shape).
	const tabs = [{ href: resolve('/finance/bills'), label: 'Bills' }];

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="shrink-0 text-lg font-bold text-gray-900">Finance</h1>
	</div>

	<nav class="flex gap-1 border-b border-gray-200" aria-label="Finance sections">
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
	</nav>

	{@render children()}
</div>
