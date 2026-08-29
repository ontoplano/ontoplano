<script lang="ts">
	import Banner from '$lib/components/Banner.svelte';

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

<Banner kind="warning">
	<strong>Staging.</strong> Accounts here are open to anyone with the address, and the data is not
	promised to survive.
	{#if detail}<span class="detail">{detail}</span>{/if}
</Banner>

<style>
	.detail {
		color: var(--color-gray-600);
	}
</style>
