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
		},
		{
			href: resolve('/settings/integrations/widget'),
			label: t('rooms.integrations.tabs.widgets')
		}
	];
</script>

<!--
	Inside Settings, which already has a bar and its tabs.

	`nested` so this draws only its own strip, at the top of the surface
	Settings put there — it used to draw the whole of a room again, which gave
	the page two bars, two titles and two bands of page ground between them.
-->
<div class="integrations">
	<TabbedRoom
		nested
		title={t('rooms.integrations.title')}
		{tabs}
		label={t('rooms.integrations.sections')}
	>
		<div class="integrations-body">{@render children()}</div>
	</TabbedRoom>
</div>

<style>
	/*
	 * The surface steps out to the edges of the room, as it does one level up.
	 *
	 * Settings' own body pulls a full-width surface flush with its sides, but
	 * only a few levels down, and a page under this strip sits deeper than
	 * that — so the tabs' pages were an inset card with a rem of white round
	 * it while Account and Preferences ran edge to edge.
	 */
	@media (width >= 40rem) {
		/* Its rule runs edge to edge under the tabs, like the surface under it. */
		.integrations :global(.room-tabs-nested) {
			margin-inline: -1rem;
			padding-inline: 1rem;
		}

		.integrations-body :global(.room-surface) {
			margin-inline: -1rem;
			border-inline-width: 0;
			border-radius: 0 !important;
		}
	}

	@media (width < 40rem) {
		.integrations-body :global(.room-surface) {
			border-inline-width: 0;
		}
	}
</style>
