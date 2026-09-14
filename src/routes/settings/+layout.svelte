<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { settingsTabs } from '$lib/settings-tabs';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types';

	/**
	 * Settings is a room like any other.
	 *
	 * It drew its own heading and its own strip, so it was the one place in
	 * the app where the tabs did not answer a swipe and the header was a
	 * different height from every room's — and arriving at the last tab left
	 * the strip scrolled with the name half off it. It uses the same component
	 * the rooms do now, which is where the swipe, the movement and the bar's
	 * shape live.
	 */
	let { children, data }: { children: Snippet; data: LayoutServerData } = $props();

	const tabs = $derived(settingsTabs(data));
</script>

<TabbedRoom title="Settings" {tabs} label="Settings sections">
	{@render children()}
</TabbedRoom>
