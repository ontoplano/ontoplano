<script lang="ts">
	import { useT } from '$lib/i18n';
	import PageTitle from '$lib/components/PageTitle.svelte';

	const t = useT();
	// Rendered from the cache when a navigation fails, so it must not depend on
	// anything loaded from the server.
</script>

<PageTitle parts={t('titles.offline')} />

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
