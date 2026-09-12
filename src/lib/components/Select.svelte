<script lang="ts">
	/**
	 * A dropdown, the app's own.
	 *
	 * It is a real `<select>` underneath — a phone opens its own wheel, a
	 * keyboard types to jump, a screen reader knows what it is — and the box
	 * around it is drawn by `.select` in `layout.css` rather than by whatever
	 * the operating system thinks a dropdown looks like.
	 *
	 * A component rather than a class so that the day the box changes, or a
	 * label or an error slot is added to it, there is one file to change
	 * instead of fifty call sites.
	 */
	import type { HTMLSelectAttributes } from 'svelte/elements';

	let {
		value = $bindable(),
		class: extra = '',
		children,
		...rest
	}: HTMLSelectAttributes & {
		value?: string | number | null;
		class?: string;
		children?: import('svelte').Snippet;
	} = $props();
</script>

<select bind:value class="select {extra}" {...rest}>
	{@render children?.()}
</select>
