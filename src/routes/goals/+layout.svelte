<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { children }: { children: Snippet } = $props();
</script>

<!-- What is under way, and its History — the tabs are `ROOM_TABS.goals`. -->
<TabbedRoom title={t('goals.goals')} room="goals" label={t('rooms.goals.sections')}>
	{@render children()}
</TabbedRoom>
