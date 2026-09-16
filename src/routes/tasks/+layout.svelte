<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { children }: { children: Snippet } = $props();

	const tabs = $derived([
		{ href: resolve('/tasks/plan'), label: t('rooms.tasks.tabs.plan') },
		{ href: resolve('/tasks/board'), label: t('rooms.tasks.tabs.board') },
		{ href: resolve('/tasks/todo'), label: t('rooms.tasks.tabs.todo') },
		{ href: resolve('/tasks/activities'), label: t('rooms.tasks.tabs.activities') },
		{ href: resolve('/tasks/review'), label: t('rooms.tasks.tabs.review') }
	]);
</script>

<TabbedRoom
	title={t('rooms.tasks.title')}
	{tabs}
	label={t('rooms.tasks.sections')}
	dataTour="planner-tabs"
>
	{@render children()}
</TabbedRoom>
