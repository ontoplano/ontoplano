<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import { TASK_TABS } from '$lib/sections';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { children }: { children: Snippet } = $props();

	// `TASK_TABS`, not a list of its own: the wheel names what is in this room
	// before you go there, and it reads the same declaration.
	const tabs = $derived(
		TASK_TABS.map((tab) => ({
			// `resolve` takes a literal, so the addresses are matched here rather
			// than built — a tab whose address is not a route of this app stops
			// the build.
			href: resolve(tab.href as '/tasks/plan'),
			label: t(tab.label)
		}))
	);
</script>

<TabbedRoom
	title={t('rooms.tasks.title')}
	{tabs}
	label={t('rooms.tasks.sections')}
	dataTour="planner-tabs"
>
	{@render children()}
</TabbedRoom>
