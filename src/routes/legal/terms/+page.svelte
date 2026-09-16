<script lang="ts">
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head><title>{t('legal.terms.termsOntoplano')}</title></svelte:head>

<h1>{t('legal.terms.terms')}</h1>
<p class="updated">{t('legal.terms.lastUpdated', { updated: data.updated })}</p>

<p>{t('legal.terms.theseAreTheTermsFor', { operator: data.operator })}</p>

<h2>{t('legal.terms.theAccountIsYours')}</h2>
<p>
	{t('legal.terms.whatYouWriteHereBelongs')}
</p>
<p>
	{t('legal.terms.keepYourPasswordToYourself', {
		instance: data.contactEmail ?? 'whoever runs this instance'
	})}
</p>

<h2>{t('legal.terms.whatYouMayNotDo')}</h2>
<ul>
	<li>{t('legal.terms.storeAnythingIllegalWhereThis')}</li>
	<li>{t('legal.terms.useItToAttackThe')}</li>
	<li>{t('legal.terms.resellAccessToSomebodyElseS')}</li>
</ul>
<p>
	{t('legal.terms.anAccountDoingOneOf')}
</p>

<h2>{t('legal.terms.paying')}</h2>
<p>
	{t('legal.terms.aNewAccountGets')}
	{data.trialDays}
	{t('legal.terms.daysFree')}{data.trialRequiresCard
		? ', and is asked for a card at the start so the subscription can begin when the trial ends'
		: ' and is not asked for a card'}{t('legal.terms.itCosts')}
	{data.monthly}
	{t('legal.terms.aMonth')}{#if data.yearly}{t('legal.terms.or')} {data.yearly}{/if}{t(
		'legal.terms.paymentIsHandledBy'
	)}
	{data.provider}
	{t('legal.terms.asMerchantOfRecord')}
</p>
{#if data.trialRequiresCard}
	<p>
		{t('legal.terms.youWillBeEmailedTwo')}
	</p>
{/if}
<p>
	{t('legal.terms.cancelAnyTimeTheSubscription')}
	<strong>{t('legal.terms.nothingIsDeletedWhenIt')}</strong>
	{t('legal.terms.everythingYouWroteStaysWhere')}
</p>
<p>
	{t('legal.terms.ifAChargeWasWrong', {
		instance: data.contactEmail ?? 'whoever runs this instance'
	})}
</p>

<h2>{t('legal.terms.whatIsPromisedAboutIt')}</h2>
<p>
	{#if data.hosted}
		{t('legal.terms.thisIsRunByOne')}
	{:else}
		{t('legal.terms.thisIsASelfHostedInstance')}
	{/if}
</p>

<h2>{t('legal.terms.endingIt')}</h2>
<p>
	{t('legal.terms.deleteTheAccountFromSettings')}
</p>

<h2>{t('legal.terms.theSoftware')}</h2>
<p>
	{t('legal.terms.ontoplanoIsOpenSourceUnder')}
</p>

<h2>{t('legal.terms.theBoringPart')}</h2>
<p>{t('legal.terms.theSoftwareIsProvidedAs', { jurisdiction: data.jurisdiction })}</p>
