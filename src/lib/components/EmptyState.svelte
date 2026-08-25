<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';

	/**
	 * Nothing here yet — and the fastest way out of that.
	 *
	 * An empty screen is the one a new account sees first, and ours said "No goals
	 * yet" in grey and left the person to find the button themselves. A sentence
	 * explaining what the thing is, and the button that makes one, in the place
	 * they are already looking.
	 */
	let {
		icon,
		title,
		description = '',
		action
	}: {
		icon: IconName;
		title: string;
		description?: string;
		/** The button that ends the emptiness. */
		action?: Snippet;
	} = $props();
</script>

<div class="flex flex-col items-center gap-3 px-6 py-12 text-center">
	<span class="text-gray-300">
		<Icon name={icon} size={32} />
	</span>
	<div>
		<p class="text-sm font-medium text-gray-900">{title}</p>
		{#if description}
			<p class="mx-auto mt-1 max-w-sm text-sm text-gray-500">{description}</p>
		{/if}
	</div>
	{#if action}
		<div class="mt-1">{@render action()}</div>
	{/if}
</div>
