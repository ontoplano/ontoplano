<script lang="ts">
	import { resolve } from '$app/paths';
	import StreamChart from '$lib/components/StreamChart.svelte';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

	const ranges = [30, 90, 180, 365];
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<div>
			<h1 class="text-lg font-bold text-gray-900">{data.stream.name}</h1>
			<p class="mt-0.5 text-sm text-gray-500">
				<code class="font-mono text-xs">{data.stream.slug}</code>
				{t('data.slug.fromPoints', {
					source: data.stream.source,
					length: data.points.length
				})}
			</p>
		</div>
		<nav class="flex gap-1">
			{#each ranges as days (days)}
				<a
					href="{resolve('/data/[slug]', { slug: data.stream.slug })}?days={days}"
					class="btn btn-sm {data.rangeDays === days ? 'on-fill' : ''}"
				>
					{days}d
				</a>
			{/each}
		</nav>
	</div>

	<div class="border border-gray-200 bg-white shadow-sm">
		<StreamChart points={data.points} display={data.stream.display} unit={data.stream.unit} />
	</div>

	<p class="text-xs text-gray-500">
		{t('data.slug.changeHowThisIsDisplayed')}
		<a href={resolve('/settings/integrations/connections')} class="underline underline-offset-2"
			>{t('data.slug.integrations')}</a
		>.
	</p>
</div>
