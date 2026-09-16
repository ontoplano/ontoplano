<script lang="ts">
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head><title>{t('legal.privacy.privacyOntoplano')}</title></svelte:head>

<h1>{t('legal.privacy.privacy')}</h1>
<p class="updated">{t('legal.privacy.lastUpdated', { updated: data.updated })}</p>

<p>
	{t('legal.privacy.ontoplanoHoldsADiaryYour')}
</p>

<h2>{t('legal.privacy.whatIsStored')}</h2>
<ul>
	<li>{t('legal.privacy.yourEmailAddressAndName')}</li>
	<li>{t('legal.privacy.aHashOfYourPassword')}</li>
	<li>
		{t('legal.privacy.everythingYouWriteBlocksTasks')}
	</li>
	<li>
		{t('legal.privacy.aShortHistoryOfWhat')}
	</li>
	<li>{t('legal.privacy.theAddressYouConnectedFrom')}</li>
</ul>

<h2>{t('legal.privacy.whereItIsStored')}</h2>
<p>
	{t('legal.privacy.inOneSqliteDatabaseOn')}
	{data.hosted
		? t('legal.privacy.theServerThatRunsThis')
		: t('legal.privacy.theMachineYouInstalledIt')}.
	{#if data.hosted}
		{t('legal.privacy.backupsAreReplicatedToObject')}
	{:else}
		{t('legal.privacy.backupsAreWhateverYouConfigured')}
	{/if}
</p>

<h2>{t('legal.privacy.whoCanSeeIt')}</h2>
<p>
	{#if data.hosted}
		{t('legal.privacy.thePersonRunningThisInstance')}
	{:else}
		{t('legal.privacy.whoeverAdministersTheMachineWhich')}
	{/if}
</p>
<p>{t('legal.privacy.thereIsNoAnalyticsNo')}</p>

<h2>{t('legal.privacy.whoElseIsInvolved')}</h2>
<ul>
	<li>
		<strong>{t('legal.privacy.mail')}</strong>
		{t('legal.privacy.confirmationAndPasswordResetMessagesGo')}
	</li>
	<li>
		<strong>{t('legal.privacy.payment')}</strong>{t('legal.privacy.ifYouSubscribeHandlesThe', {
			provider: data.provider
		})}
	</li>
	<li>
		<strong>{t('legal.privacy.plugins')}</strong>
		{t('legal.privacy.anythingYouConnectWithAn')}
	</li>
</ul>

<h2>{t('legal.privacy.takingItWithYouAnd')}</h2>
<p>
	{t('legal.privacy.settingsAccountExportsEverything')}
</p>
<p>
	{t('legal.privacy.backupsAreTheExceptionAnd')}{#if data.hosted}{t(
			'legal.privacy.whichHappensWithin'
		)}
		{data.backupRetentionDays}
		{t('legal.privacy.days')}{/if}.
</p>

<h2>{t('legal.privacy.cookies')}</h2>
<p>
	{t('legal.privacy.oneCalled')} <code>{t('legal.privacy.betterAuthSessionToken')}</code>{t(
		'legal.privacy.whichIsWhatKeeps'
	)}
</p>

<h2>{t('legal.privacy.askingAboutAnyOfThis')}</h2>
{#if data.contactEmail}
	<p>
		{t('legal.privacy.writeTo')} <a href="mailto:{data.contactEmail}">{data.contactEmail}</a>{t(
			'legal.privacy.itIsReadBy'
		)}
	</p>
{:else}
	<p>{t('legal.privacy.askWhoeverRunsThisInstance')}</p>
{/if}
