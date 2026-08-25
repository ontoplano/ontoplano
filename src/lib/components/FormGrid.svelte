<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The twelve-column grid a form's fields sit on.
	 *
	 * One row height, one gutter, one place to change either. Fields declare a
	 * span; nothing declares a pixel width.
	 */
	let { children }: { children: Snippet } = $props();
</script>

<div class="grid grid-cols-12 items-start gap-x-4 gap-y-3">
	{@render children()}
</div>
