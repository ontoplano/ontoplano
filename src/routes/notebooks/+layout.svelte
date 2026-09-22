<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import { isHidden, NOTEBOOK_TABS, type HideableSection } from '$lib/sections';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	/**
	 * Notebooks is one room with several shelves — the notebooks, the diary,
	 * the ideas, what the weekly review writes, the people and the labels.
	 *
	 * Notebooks is the general one, which is why it names the room and comes
	 * first: a diary is one notebook-shaped practice among the subjects you
	 * write against. People stays its own entry: it reads like a directory,
	 * not like writing.
	 *
	 * The list is `NOTEBOOK_TABS`, and every one of them is put away by the
	 * preference of the same name. This was six tabs written out here, four of
	 * which ignored the preference that claimed to hide them — so somebody who
	 * put the diary away still had a Diary tab, and Weekly notes and Tags could
	 * not be put away at all.
	 */
	const tabs = $derived(
		NOTEBOOK_TABS.filter((tab) => !isHidden(data.hiddenSections, tab.id as HideableSection)).map(
			(tab) => ({
				// `resolve` takes a literal, so the addresses are matched here rather
				// than built: the list is `as const`, and a tab whose address is not a
				// route of this app stops the build.
				href: resolve(tab.href as '/notebooks'),
				label: t(tab.label)
			})
		)
	);
</script>

<TabbedRoom title={t('rooms.notebooks.title')} {tabs} label={t('rooms.notebooks.sections')}>
	{@render children()}
</TabbedRoom>
