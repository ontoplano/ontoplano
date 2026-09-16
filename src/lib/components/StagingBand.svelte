<script lang="ts">
	import Banner from '$lib/components/Banner.svelte';
	import { useT } from '$lib/i18n';

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

	const t = useT();
</script>

<Banner kind="warning">
	<strong>{t('staging.heading')}</strong>
	{t('staging.body')}
	{#if detail}<span class="detail">{detail}</span>{/if}
</Banner>

<style>
	.detail {
		color: var(--color-gray-600);
	}
</style>
