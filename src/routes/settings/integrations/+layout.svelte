<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: resolve('/settings/integrations'), label: 'AI' },
		{ href: resolve('/settings/integrations/connections'), label: 'Integrations' }
	];
</script>

<TabbedRoom title="Integrations" {tabs} label="Integration sections">
	{@render children()}
</TabbedRoom>
