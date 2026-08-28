<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * This is not the real instance.
	 *
	 * Loud on purpose, and on every page that could mislead somebody about which
	 * instance they are on. The failure it exists to prevent is not a visitor
	 * being confused — it is the flag being left on in production and nobody
	 * noticing for a week, so it has to be impossible to miss for the person who
	 * set it as much as for the person who arrives.
	 */
	let { detail = '' }: { detail?: string } = $props();
</script>

<div class="staging-band">
	<Icon name="warning" size={16} />
	<p>
		<strong>Staging.</strong> This instance is for trying things out. Accounts are open to anyone
		with the address, and the data here is not promised to survive.
		{#if detail}<span class="detail">{detail}</span>{/if}
	</p>
</div>

<style>
	.staging-band {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		border: 1px solid color-mix(in srgb, var(--color-amber-600, #d97706) 45%, transparent);
		border-left: 4px solid var(--color-amber-600, #d97706);
		border-radius: var(--radius-sm, 0);
		background-color: color-mix(in srgb, var(--color-amber-600, #d97706) 8%, var(--color-white));
		padding: 0.7rem 0.9rem;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--color-gray-900);
	}

	.staging-band :global(svg) {
		flex: none;
		margin-top: 0.15rem;
		color: var(--color-amber-700, #b45309);
	}

	.detail {
		color: var(--color-gray-600);
	}
</style>
