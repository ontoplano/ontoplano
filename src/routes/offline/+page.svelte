<script lang="ts">
	import { useT } from '$lib/i18n';

	const t = useT();
	// Rendered from the cache when a navigation fails, so it must not depend on
	// anything loaded from the server.
</script>

<svelte:head><title>{t('offline.offlineOntoplano')}</title></svelte:head>

<div class="solo-screen bg-gray-100">
	<div class="solo-card sm:max-w-sm">
		<span class="eyebrow text-gray-600">{t('offline.noConnection')}</span>
		<p class="mt-2 text-sm text-gray-700">
			{t('offline.ontoplanoNeedsTheNetworkFor')}
		</p>
		<button onclick={() => location.reload()} class="btn btn-primary mt-4">
			{t('offline.tryAgain')}
		</button>
	</div>
</div>
