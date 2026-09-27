<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * A row's round box while a list is selecting — see `SelectionBar`.
	 *
	 * Round rather than square so it never reads as the tick that finishes a
	 * task, which sits in the same place when nobody is selecting.
	 */
	let { checked, label, ontoggle }: { checked: boolean; label: string; ontoggle: () => void } =
		$props();
</script>

<button
	type="button"
	role="checkbox"
	aria-checked={checked}
	aria-label={label}
	title={label}
	class="-m-1 flex items-start justify-center self-start p-1 pointer-coarse:w-11"
	onclick={ontoggle}
>
	<span
		style="border-radius: 50%"
		class="flex size-7 items-center justify-center border border-gray-500 hover:bg-gray-200"
		class:bg-gray-200={checked}
		>{#if checked}<Icon name="check" />{/if}</span
	>
</button>
