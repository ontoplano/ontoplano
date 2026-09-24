<script lang="ts">
	/**
	 * A data stream is a tab of Health — the room lists every stream the
	 * account has — so its page draws that room, with its own tab underlined.
	 */
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
