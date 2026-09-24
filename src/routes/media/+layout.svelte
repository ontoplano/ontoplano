<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { children }: { children: Snippet } = $props();
</script>

<TabbedRoom title={t('rooms.media.title')} room="media" label={t('rooms.media.sections')}>
	{@render children()}
</TabbedRoom>
