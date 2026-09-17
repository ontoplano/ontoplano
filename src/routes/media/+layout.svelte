<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { isHidden } from '$lib/sections';
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
	 * Recordings first, the gallery second.
	 *
	 * The room used to be the gallery and nothing else. Recordings are the tab
	 * somebody opens this room to make — a picture is chosen from a disk, a
	 * recording is made here — so it is the one the room lands on.
	 */
	const tabs = $derived([
		...(isHidden(data.hiddenSections, 'audios')
			? []
			: [{ href: resolve('/media/audios'), label: t('rooms.media.tabs.audios') }]),
		...(isHidden(data.hiddenSections, 'gallery')
			? []
			: [{ href: resolve('/media/gallery'), label: t('rooms.media.tabs.gallery') }])
	]);
</script>

<TabbedRoom title={t('rooms.media.title')} {tabs} label={t('rooms.media.sections')}>
	{@render children()}
</TabbedRoom>
