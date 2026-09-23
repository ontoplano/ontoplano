<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: resolve('/settings/integrations'), label: t('rooms.integrations.tabs.ai') },
		{
			href: resolve('/settings/integrations/connections'),
			label: t('rooms.integrations.tabs.connections')
		}
	];
</script>

<!--
	Inside Settings, which already has a bar and its tabs.

	`nested` so this draws only its own strip, at the top of the surface
	Settings put there — it used to draw the whole of a room again, which gave
	the page two bars, two titles and two bands of page ground between them.
-->
<TabbedRoom
	nested
	title={t('rooms.integrations.title')}
	{tabs}
	label={t('rooms.integrations.sections')}
>
	{@render children()}
</TabbedRoom>
