<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Notebooks is one room with several shelves — the notebooks, the diary,
	 * the ideas, what the weekly review writes, the people and the labels.
	 *
	 * Notebooks is the general one, which is why it names the room and comes
	 * first: a diary is one notebook-shaped practice among the subjects you
	 * write against. The list is `NOTEBOOK_TABS`, and every one of them but the
	 * first is put away by the preference of the same name.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<TabbedRoom title={t('rooms.notebooks.title')} room="diary" label={t('rooms.notebooks.sections')}>
	{@render children()}
</TabbedRoom>
