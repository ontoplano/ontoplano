<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	/**
	 * Notebooks is one room with two shelves — the notebooks, and the diary.
	 *
	 * Notebooks is the general one, which is why it names the room and comes
	 * first: a diary is one notebook-shaped practice among the subjects you
	 * write against. People stays its own entry: it reads like a directory,
	 * not like writing.
	 */
	// The preference that hides the notebooks section hides its tab; the room
	// then opens on the diary.
	const tabs = $derived([
		...(data.hiddenSections.includes('notebooks')
			? []
			: [{ href: resolve('/notebooks'), label: 'Notebooks' }]),
		{ href: resolve('/notebooks/diary'), label: 'Diary' },
		// Ideas is writing too — a line you jot and come back to — and a room of
		// its own in the bar for something that small was a room nobody entered.
		// It can still be put away, like every other part of the app.
		...(data.hiddenSections.includes('ideas')
			? []
			: [{ href: resolve('/notebooks/ideas'), label: 'Ideas' }]),
		// What the weekly review writes. It is writing, and it was reachable only
		// from the week it belonged to — which is a thing nobody navigates to.
		{ href: resolve('/notebooks/weekly'), label: 'Weekly notes' },
		{ href: resolve('/notebooks/people'), label: 'People' }
	]);
</script>

<TabbedRoom title="Notebooks" {tabs} label="Notebooks sections">
	{@render children()}
</TabbedRoom>
