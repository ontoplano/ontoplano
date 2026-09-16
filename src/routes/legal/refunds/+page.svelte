<script lang="ts">
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head><title>{t('legal.refunds.refundsOntoplano')}</title></svelte:head>

<h1>{t('legal.refunds.refunds')}</h1>
<p class="updated">{t('legal.refunds.lastUpdated', { updated: data.updated })}</p>

{#if !data.hosted}
	<!--
		A self-hosted copy sells nothing, so it has nothing to refund. Saying so
		is better than a page of policy about payments that never happen — and
		better than a 404, because the footer links here from every instance.
	-->
	<p>
		{t('legal.refunds.thisInstanceIsSomebodySOwn')}
	</p>
{:else}
	<p>{t('legal.refunds.shortVersionYouGetDays', { trialDays: data.trialDays })}</p>

	<h2>{t('legal.refunds.beforeTheFirstCharge')}</h2>
	<p>
		{t('legal.refunds.aNewAccountRunsFor', {
			trialDays: data.trialDays,
			for: data.trialRequiresCard
				? t('legal.refunds.aCardIsAsked')
				: t('legal.refunds.andNoCardIsAsked')
		})}
	</p>

	<h2>{t('legal.refunds.theSevenDaysAfterA')}</h2>
	<p>
		{t('legal.refunds.brazilianConsumerLawThe')}
	</p>
	<p>
		{t('legal.refunds.askWithinSevenDaysOf')}
	</p>

	<h2>{t('legal.refunds.afterThat')}</h2>
	<p>
		{t('legal.refunds.cancelWheneverYouLikeThe')}
	</p>
	<p>
		{t('legal.refunds.twoExceptionsHonouredWithoutArgument')}
	</p>

	<h2>{t('legal.refunds.howToAsk')}</h2>
	<p>
		{t('legal.refunds.writeToFromThe', {
			instance: data.contactEmail ?? t('legal.refunds.whoeverRunsThisInstance')
		})}
	</p>
	{#if data.provider}
		<p>{t('legal.refunds.paymentIsHandledByAs', { provider: data.provider })}</p>
	{/if}

	<h2>{t('legal.refunds.whatARefundDoesTo')}</h2>
	<p>
		<strong>{t('legal.refunds.nothingIsDeleted')}</strong>
		{t('legal.refunds.aRefundedOrEndedSubscription')}
	</p>
{/if}
