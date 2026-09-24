<script lang="ts">
	import HealthRoom from '$lib/components/HealthRoom.svelte';
	import type { Snippet } from 'svelte';

	let {
		children,
		data
	}: {
		children: Snippet;
		data: { streams: { slug: string; name: string }[]; hiddenSections: string[] };
	} = $props();
</script>

<HealthRoom {data}>
	{@render children()}
</HealthRoom>
