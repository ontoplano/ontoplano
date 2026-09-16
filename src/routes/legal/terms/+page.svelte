<script lang="ts">
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head><title>{t('legal.terms.termsOntoplano')}</title></svelte:head>

<h1>{t('legal.terms.terms')}</h1>
<p class="updated">Last updated {data.updated}.</p>

<p>
	These are the terms for using this instance of ontoplano, run by {data.operator}. Using it means
	agreeing to them. They are short because there is not much to say.
</p>

<h2>{t('legal.terms.theAccountIsYours')}</h2>
<p>
	{t('legal.terms.whatYouWriteHereBelongs')}
</p>
<p>
	Keep your password to yourself, and tell {data.contactEmail ?? 'whoever runs this instance'} if you
	think somebody else has it.
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
	A new account gets {data.trialDays} days free{data.trialRequiresCard
		? ', and is asked for a card at the start so the subscription can begin when the trial ends'
		: ' and is not asked for a card'}. It costs {data.monthly} a month{#if data.yearly}, or {data.yearly}{/if}.
	Payment is handled by {data.provider} as merchant of record — they take the payment, issue the invoice
	and handle the tax.
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
	If a charge was wrong, write to {data.contactEmail ?? 'whoever runs this instance'} and it will be refunded.
</p>

<h2>{t('legal.terms.whatIsPromisedAboutIt')}</h2>
<p>
	{#if data.hosted}
		This is run by one person on ordinary infrastructure. It is not a bank. Expect it to be up
		nearly all the time, expect occasional restarts for updates, and expect no compensation if it is
		down for an afternoon — there is no uptime guarantee here and it would be dishonest to write
		one. What is promised instead is that your data is backed up off the machine, that you can
		export it at any moment without asking, and that if this instance ever shuts down you will be
		told well beforehand with your export still working.
	{:else}
		This is a self-hosted instance: it is up when the machine it runs on is up, which is your
		business rather than anyone else's.
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
<p>
	The software is provided as it is, without warranty. Liability, where it cannot be excluded, is
	limited to what you paid in the last twelve months. Disputes go to the courts of
	{data.jurisdiction}.
</p>
