<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: resolve('/tasks/plan'), label: 'Plan' },
		{ href: resolve('/tasks/board'), label: 'Board' },
		{ href: resolve('/tasks/todo'), label: 'To-do' },
		{ href: resolve('/tasks/activities'), label: 'Activities' },
		{ href: resolve('/tasks/review'), label: 'Review' }
	];
</script>

<TabbedRoom title="Tasks" {tabs} label="Tasks sections" dataTour="planner-tabs">
	{@render children()}
</TabbedRoom>
