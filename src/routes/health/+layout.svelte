<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { scrollHints } from '$lib/actions/scroll-hints';
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
		{ href: resolve('/health/workouts'), label: 'Workouts' },
		{ href: resolve('/health/recipes'), label: 'Recipes' },
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

	<!--
		Full size, and it scrolls when it has to — the same row Tasks and Settings
		have. Left to itself the strip wrapped, and a flex row wrapping inside a
		link breaks the word rather than the row: five tabs on a phone came out as
		"Hab / its", "Work / outs". The tabs keep their size, the row scrolls, and
		the chevron at the edge is what makes a tab you cannot see findable.
	-->
	<nav
		use:scrollHints
		class="scroll-hints flex gap-0 border-b border-gray-200 md:gap-1"
		aria-label="Health sections"
	>
		<!--
			Resolved where the tabs are built, above — a stream's tab has to be,
			because its slug is a route parameter. The rule reads the href
			expression and cannot see through the array.
		-->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		{#each tabs as tab (tab.href)}
			<!--
				The underline is on every tab, transparent where it is not the one you
				are on. Drawn only under the active tab it added two pixels to that
				tab alone, so the row twitched every time you changed section.
			-->
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
