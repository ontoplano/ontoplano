<script lang="ts">
	/**
	 * The box that narrows a list by what it says, at the head of a `FilterBar`.
	 *
	 * It fills the slot the strip gives it; how wide that slot is belongs to
	 * `FilterBar`, so every room's box is the same size in the same place.
	 */
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		value = $bindable(''),
		/** The placeholder, and the box's name for a screen reader. */
		label,
		...rest
	}: HTMLInputAttributes & {
		value?: string;
		label: string;
	} = $props();
</script>

<label class="block w-full">
	<span class="sr-only">{label}</span>
	<input
		type="search"
		bind:value
		placeholder={label}
		autocomplete="off"
		class="input input-sm"
		{...rest}
	/>
</label>
