<script lang="ts">
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head><title>{t('legal.refunds.refundsOntoplano')}</title></svelte:head>

<h1>{t('legal.refunds.refunds')}</h1>
<p class="updated">Last updated {data.updated}.</p>

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
	<p>
		Short version: you get {data.trialDays} days free before anything is charged, you can cancel at any
		moment, and if you were charged for something you did not want, you are refunded.
	</p>

	<h2>{t('legal.refunds.beforeTheFirstCharge')}</h2>
	<p>
		A new account runs for {data.trialDays} days without paying{data.trialRequiresCard
			? '. A card is asked for at the start so the subscription can begin when the trial ends, and nothing is taken until it does'
			: ' and no card is asked for'}. Cancelling in those days costs nothing, because nothing has
		been charged.
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
		Write to {data.contactEmail ?? 'whoever runs this instance'}, from the address on the account,
		and say which charge. There is no form.
	</p>
	{#if data.provider}
		<p>
			Payment is handled by {data.provider} as merchant of record: they take the payment and issue the
			invoice, so the refund is made through them and lands back on the same card.
		</p>
	{/if}

	<h2>{t('legal.refunds.whatARefundDoesTo')}</h2>
	<p>
		<strong>{t('legal.refunds.nothingIsDeleted')}</strong>
		{t('legal.refunds.aRefundedOrEndedSubscription')}
	</p>
{/if}
