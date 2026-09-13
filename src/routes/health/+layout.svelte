<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
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
		{ href: resolve('/health/workouts'), label: 'Workouts' },
		{ href: resolve('/health/recipes'), label: 'Recipes' },
		...data.streams.map((s) => ({ href: resolve('/data/[slug]', { slug: s.slug }), label: s.name }))
	]);
</script>

<TabbedRoom title="Health" {tabs} label="Health sections">
	{@render children()}
</TabbedRoom>
