<script lang="ts">
	/**
	 * The one secondary verb a list has about all of it — Areas, Categories —
	 * in a `FilterBar`'s `verb` slot.
	 *
	 * One element at every width: its glyph and its word where there is room,
	 * the glyph alone on a phone, with the word still its name and tooltip.
	 */
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let {
		icon,
		/** What it does, in a word. */
		label,
		...rest
	}: HTMLButtonAttributes & {
		icon: IconName;
		label: string;
	} = $props();
</script>

<button type="button" class="btn btn-sm shrink-0" title={label} aria-label={label} {...rest}>
	<Icon name={icon} size={14} />
	<span class="hidden sm:inline">{label}</span>
</button>
