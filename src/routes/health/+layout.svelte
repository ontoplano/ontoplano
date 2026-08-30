<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let {
		children,
		data
	}: { children: Snippet; data: { streams: { slug: string; name: string }[] } } = $props();

	/**
	 * Habits, and then whatever this account measures.
	 *
	 * "Weight" was a hardcoded tab, which told every stranger the app had
	 * opinions about their body and was empty for almost all of them. Weight is
	 * one data stream that one producer pushes; it earns a tab by existing.
	 */
	// Through `resolve` rather than a template string: a stream's slug reaches
	// the URL as a parameter of the route that owns it, so a slug with anything
	// interesting in it is escaped rather than pasted.
	const tabs = $derived([
		{ href: resolve('/health/habits'), label: 'Habits' },
		...data.streams.map((s) => ({ href: resolve('/data/[slug]', { slug: s.slug }), label: s.name }))
	]);

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="shrink-0 text-lg font-bold text-gray-900">Health</h1>
	</div>

	<div class="flex gap-1 border-b border-gray-200">
		<!--
			Resolved where the tabs are built, above — a stream's tab has to be,
			because its slug is a route parameter. The rule reads the href
			expression and cannot see through the array.
		-->
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
