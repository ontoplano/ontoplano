<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	/**
	 * No tabs here any more.
	 *
	 * People and notebooks used to be tabs inside the journal, which meant
	 * finding them required knowing they were behind Diary first. They are their
	 * own entries in the navigation now, and each page says what it is.
	 */
</script>

{@render children()}
