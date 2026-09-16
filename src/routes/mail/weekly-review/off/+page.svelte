<script lang="ts">
	import { resolve } from '$app/paths';
	import { useT } from '$lib/i18n';

	const t = useT();
</script>

<svelte:head><title>{t('mail.weeklyReview.off.weeklyReviewTurnedOff')}</title></svelte:head>

<div class="mx-auto max-w-md p-8 text-center">
	<h1 class="text-lg font-semibold text-gray-900">{t('mail.weeklyReview.off.turnedOff')}</h1>
	<p class="mt-2 text-sm text-gray-500">
		{t('mail.weeklyReview.off.noMoreMondayMessagesYour')}
	</p>
	<a href={resolve('/')} class="btn mt-6 inline-block">{t('mail.weeklyReview.off.goToOntoplano')}</a
	>
</div>
