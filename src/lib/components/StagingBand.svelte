<script lang="ts">
	import Banner from '$lib/components/Banner.svelte';

	/**
	 * This is not the real instance.
	 *
	 * Loud on purpose, and on every page rather than only on the way in. Signed
	 * in, staging used to look exactly like the real instance, which is the state
	 * where somebody puts a real week into it.
	 *
	 * It says nothing about how the instance is configured any more, because it
	 * no longer decides anything: registration, billing and email verification
	 * are whatever this box's env file says, exactly as they are in production.
	 * The band is the label, and the label is the whole of what staging is.
	 */
	let { detail = '' }: { detail?: string } = $props();
</script>

<Banner kind="warning">
	<strong>Staging.</strong> A copy of Ontoplano for trying things on. Nothing here is promised to
	survive.
	{#if detail}<span class="detail">{detail}</span>{/if}
</Banner>

<style>
	.detail {
		color: var(--color-gray-600);
	}
</style>
