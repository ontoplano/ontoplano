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
			href: resolve('/settings/integrations/chat'),
			label: t('rooms.integrations.tabs.chat')
		},
		{
			href: resolve('/settings/integrations/connections'),
			label: t('rooms.integrations.tabs.connections')
		}
	];
</script>

<TabbedRoom title={t('rooms.integrations.title')} {tabs} label={t('rooms.integrations.sections')}>
	{@render children()}
</TabbedRoom>
