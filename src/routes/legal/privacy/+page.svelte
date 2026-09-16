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
	In one SQLite database on {data.hosted
		? 'the server that runs this instance'
		: 'the machine you installed it on'}.
	{#if data.hosted}
		Backups are replicated to object storage.
	{:else}
		Backups are whatever you configured; nobody else has a copy.
	{/if}
</p>

<h2>{t('legal.privacy.whoCanSeeIt')}</h2>
<p>
	{#if data.hosted}
		The person running this instance can, technically — it is their database. There is no way to
		sign in as your account: the administration pages list accounts and coarse events like a
		registration or a plan change, and nothing of what you wrote. Nobody else has access.
	{:else}
		Whoever administers the machine, which is you.
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
	Backups are the exception, and the honest caveat: a snapshot taken before you deleted still
	contains what you deleted until it rotates out{#if data.hosted}, which happens within
		{data.backupRetentionDays} days{/if}.
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
