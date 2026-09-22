<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { onMount } from 'svelte';
	import { useT } from '$lib/i18n';
	import type { PageServerData } from './$types';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

	/*
	 * Straight on, without anybody pressing anything. `replace` rather than
	 * `assign`: this page is a step in a handshake, and going back to it would
	 * be going back to a code that has already been spent.
	 */
	onMount(() => location.replace(data.to));
</script>

<div class="mx-auto w-full max-w-lg px-4 py-10">
	<Card title={t('oauth.takingYouBack')}>
		<p class="text-sm text-gray-600">{t('oauth.handingYouBackTo', { client: data.client })}</p>
		<!-- The way on where script did not run, rather than a dead end. -->
		<p class="mt-3">
			<a href={data.to} class="btn btn-primary btn-sm" rel="nofollow">{t('oauth.continue')}</a>
		</p>
	</Card>
</div>
