<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { isHidden, MEDIA_TABS, type HideableSection } from '$lib/sections';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		children,
		data
	}: {
		children: Snippet;
		data: { hiddenSections: string[] };
	} = $props();

	/**
	 * The room's shelves, less whatever this account put away.
	 *
	 * The order and the names are `MEDIA_TABS`, which the wheel reads as well
	 * — it names what is in a room before you go there.
	 */
	const tabs = $derived(
		MEDIA_TABS.filter((tab) => !isHidden(data.hiddenSections, tab.id as HideableSection)).map(
			(tab) => ({ href: resolve(tab.href as '/media/audios'), label: t(tab.label) })
		)
	);
</script>

<TabbedRoom title={t('rooms.media.title')} {tabs} label={t('rooms.media.sections')}>
	{@render children()}
</TabbedRoom>
