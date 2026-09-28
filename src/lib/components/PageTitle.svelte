<script lang="ts">
	import { page } from '$app/state';
	import { setPageTitle, titleOf } from '$lib/page-title.svelte';

	/**
	 * The browser tab's words for a screen that is not a room's tab.
	 *
	 * The shell titles every room from its bar and its tabs; this is for the
	 * rest — terms, the offline page, an error. It hands its parts to the shell,
	 * which builds the title the same way it builds every other one, and it
	 * writes the tag itself too so the server's first answer already has it.
	 */
	let {
		parts
	}: {
		/** Most specific first; the app's name is added after them. */
		parts: string | string[];
	} = $props();

	const list = $derived(Array.isArray(parts) ? parts : [parts]);

	setPageTitle(() => list);
</script>

<svelte:head><title>{titleOf(list, page.data.appName ?? '')}</title></svelte:head>
