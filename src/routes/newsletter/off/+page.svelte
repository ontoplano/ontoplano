<script lang="ts">
	import { resolve } from '$app/paths';
	import { useT } from '$lib/i18n';

	const t = useT();
	let { data } = $props();
</script>

<svelte:head><title>{t('newsletter.off.unsubscribedOntoplano')}</title></svelte:head>

<div class="mx-auto max-w-md p-8 text-center">
	<h1 class="text-lg font-semibold text-gray-900">{t('ui.done')}</h1>
	<p class="mt-2 text-sm text-gray-500">
		{t('newsletter.off.nothingMoreWillBeSent', { email: data.email })}
	</p>
	<a href={resolve('/')} class="btn mt-6 inline-block">{t('newsletter.off.goToOntoplano')}</a>
</div>
