<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { scrollHints } from '$lib/actions/scroll-hints';
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

	<!-- One tab today and built to grow, so it gets the scrolling row now rather
	     than the day a third one makes the strip wrap. -->
	<nav
		use:scrollHints
		class="scroll-hints flex gap-0 border-b border-gray-200 md:gap-1"
		aria-label="Finance sections"
	>
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				aria-current={isActive(tab.href) ? 'page' : undefined}
				class="tab-link border-b-2 px-2 py-2 text-sm font-medium whitespace-nowrap transition sm:px-4 {isActive(
					tab.href
				)
					? 'border-gray-900 text-gray-900'
					: 'border-transparent text-gray-500 hover:text-gray-700'}"
			>
				{tab.label}
			</a>
		{/each}
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</nav>

	{@render children()}
</div>
