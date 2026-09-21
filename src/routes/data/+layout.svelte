<script lang="ts">
	/**
	 * A data stream is part of Integrations, wherever it answers.
	 *
	 * The page lives at `/data/<slug>` because that address is what a script
	 * pushes readings to and what somebody pastes into a graph — but it is
	 * reached from Connections, and without the room's strip it read as a page
	 * belonging to nothing: "the tab selector is gone and I don't see it as
	 * part of something anymore but an isolated page".
	 *
	 * The same strip the room draws, told which tab it is under.
	 */
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { children }: { children: Snippet } = $props();

	const connections = resolve('/settings/integrations/connections');
	const tabs = [
		{ href: resolve('/settings/integrations'), label: t('rooms.integrations.tabs.ai') },
		{ href: connections, label: t('rooms.integrations.tabs.connections') }
	];
</script>

<TabbedRoom
	title={t('rooms.integrations.title')}
	{tabs}
	belongsTo={connections}
	label={t('rooms.integrations.sections')}
>
	{@render children()}
</TabbedRoom>
