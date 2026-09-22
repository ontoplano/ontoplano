<script lang="ts">
	import { dateOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { enhance } from '$lib/enhance';
	import OneLine from '$lib/components/OneLine.svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import { mailKindLabel } from '$lib/mail-kinds';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/**
	 * Which row is asking to be sure.
	 *
	 * Promoting somebody hands them every account on the instance, and the
	 * button sits in a list you scroll — so it arms first, and the confirming
	 * button is `armed` so a double-click cannot land on it.
	 */
	let changing = $state<string | null>(null);

	const confirmed = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			changing = null;
			await update();
		};
	};

	/** Which failed mail is asking to be dropped. */
	let dismissing = $state<number | null>(null);

	const confirmedDismiss = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			dismissing = null;
			await update();
		};
	};

	const kindLabel = mailKindLabel;

	function when(iso: string): string {
		return dateOf(iso, now(), {});
	}

	function ago(iso: string): string {
		const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
		if (minutes < 1) return t('admin.justNow');
		if (minutes < 60) return t('admin.minutesAgo', { count: minutes });
		const hours = Math.round(minutes / 60);
		if (hours < 24) return t('admin.hoursAgo', { count: hours });
		return when(iso);
	}
</script>

<FormError message={form?.message} />

<!--
	Above everything, because it is worth more than everything else on this page.
	An instance that means to charge and cannot used to look completely normal:
	registrations succeeded, trials started, nothing anywhere said the card step
	had been skipped. Registration refuses now — this is the sentence that says
	why, where somebody will actually be standing when they wonder.
-->
{#if data.billingSandbox}
	<div class="mb-4">
		<Banner kind="error" message={t('admin.billingSandboxWarning')} />
	</div>
{/if}
{#if data.billingBroken}
	<div class="mb-4">
		<Banner kind="error" message={data.billingBroken} />
		<p class="mt-2 text-sm text-gray-600">
			{t('admin.nobodyCanRegisterUntilThis')}
		</p>
	</div>
{/if}

<div class="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
	<Card title={t('admin.accounts')} description={t('admin.searchByNameOrAddress')} flush>
		<form method="get" class="flex gap-2 border-b border-gray-200 p-3">
			<OneLine
				name="q"
				placeholder={t('admin.somebodyExampleCom')}
				value={data.query}
				class="input"
			/>
			<button class="btn btn-sm"><Icon name="search" /> {t('ui.search')}</button>
		</form>

		{#if data.accounts.length === 0}
			<EmptyState icon="user" title={t('admin.nobodyMatchesThat')} />
		{:else}
			<div class="divide-y divide-gray-200">
				{#each data.accounts as account (account.id)}
					<div
						class="account-row flex items-center gap-3 px-4 py-3"
						class:is-admin={account.role === 'admin' || account.isOwner}
					>
						<a
							href="{resolve('/admin')}/{account.id}"
							class="min-w-0 flex-1 text-sm text-gray-900 hover:underline"
						>
							{account.email}
							<span class="block text-xs text-gray-500">
								{account.name}
								{t('admin.joined')}
								{when(account.createdAt)} ·
								{account.sessions}
								{account.sessions === 1 ? 'session' : 'sessions'}
								<!-- Who pays: a family payer and their riders read differently
								     from a plain subscriber, and support's first question when a
								     family's card fails is which four accounts hang off it. -->
								· {account.plan}
								{#if !account.emailVerified}{t('admin.unverified')}{/if}
							</span>
						</a>

						{#if account.isOwner}
							<span class="badge-role badge-owner shrink-0">{t('admin.owner')}</span>
						{:else if account.role === 'admin'}
							<span class="badge-role badge-admin shrink-0">{t('admin.admin')}</span>
						{:else}
							<span class="eyebrow shrink-0 text-gray-500">{account.role}</span>
						{/if}

						{#if account.id === data.me}
							<!-- Your own keys are not yours to take: an instance whose last
							     administrator demoted themselves has nobody who can undo it. -->
							<span class="shrink-0 text-xs text-gray-500">{t('admin.you')}</span>
						{:else if account.isOwner}
							<span class="shrink-0 text-xs text-gray-500">{t('admin.alwaysAnAdmin')}</span>
						{:else if changing === account.id}
							<form
								method="post"
								action="?/setRole"
								use:enhance={confirmed}
								class="flex shrink-0 gap-2"
							>
								<input type="hidden" name="id" value={account.id} />
								<input
									type="hidden"
									name="role"
									value={account.role === 'member' ? 'admin' : 'member'}
								/>
								<button class="btn btn-sm btn-danger" use:armed>
									{account.role === 'member' ? t('admin.yesMakeAdmin') : t('admin.yesRemoveAdmin')}
								</button>
								<button type="button" class="btn btn-sm" onclick={() => (changing = null)}>
									{t('ui.cancel')}
								</button>
							</form>
						{:else}
							<!-- Two steps, because an administrator can read and change every
							     account on the instance, and the button sits in a list you
							     scroll. -->
							<button class="btn btn-sm shrink-0" onclick={() => (changing = account.id)}>
								{account.role === 'member' ? t('admin.makeAdmin') : t('admin.removeAdmin')}
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</Card>

	<!-- The narrow column: what went wrong, what happened, what was stopped. -->
	<div class="space-y-4">
		{#if data.mailFailures.length > 0}
			<!-- Only rendered when something is wrong: an empty "all mail fine"
			     card would train the eye to skip this spot. The same open rows
			     make /healthz warn, which is what the watchers alert on. -->
			<Card title={t('admin.mailThatDidNotGo')} description={t('admin.theWatchersAreToldThis')}>
				<div class="divide-y divide-gray-200">
					{#each data.mailFailures as failure (failure.id)}
						<div class="flex items-center gap-2 py-2 text-sm">
							<div class="min-w-0 flex-1">
								<p class="truncate text-gray-900">
									{kindLabel(failure.kind)}
									<span class="text-gray-500">→ {failure.toEmail}</span>
								</p>
								<p class="mt-0.5 truncate text-xs text-red-600">{failure.error}</p>
								<p class="mt-0.5 text-xs text-gray-500">
									{t('admin.last', {
										attempts: failure.attempts,
										attempts2: failure.attempts === 1 ? 'attempt' : 'attempts',
										lastAttemptAt: ago(failure.lastAttemptAt)
									})}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								{#if failure.retryable}
									<form method="post" action="?/retryMail" use:enhance>
										<input type="hidden" name="id" value={failure.id} />
										<button class="btn btn-sm btn-quiet" title={t('admin.sendItAgainAsIt')}>
											<Icon name="undo" />
										</button>
									</form>
								{/if}
								{#if dismissing === failure.id}
									<form method="post" action="?/dismissMail" use:enhance={confirmedDismiss}>
										<input type="hidden" name="id" value={failure.id} />
										<button class="btn btn-sm btn-danger" use:armed>{t('admin.confirm')}</button>
									</form>
								{:else}
									<button
										class="btn btn-sm btn-quiet"
										title={failure.retryable
											? t('admin.dropItWithoutSending')
											: t('admin.itsLinkHasExpired')}
										onclick={() => (dismissing = failure.id)}
									>
										<Icon name="close" />
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</Card>
		{/if}

		<Card title={t('admin.lately')} description={t('admin.everyAccountSHistoryInOne')} flush>
			{#snippet actions()}
				<button type="button" class="btn btn-sm" onclick={() => invalidateAll()}>
					<Icon name="undo" />
					{t('admin.refresh')}
				</button>
			{/snippet}
			{#if data.events.length === 0}
				<EmptyState icon="clock" title={t('admin.nothingRecordedYet')} />
			{:else}
				<!--
					Contained and scrollable rather than however long the history
					happens to be. On an instance in use this is the one card with no
					natural end, and a page whose length is a function of how popular
					you are is a page that stops being readable exactly when it starts
					mattering.
				-->
				<div class="max-h-96 divide-y divide-gray-200 overflow-y-auto">
					{#each data.events as event (event.id)}
						<div class="flex items-baseline gap-2 px-4 py-2 text-sm">
							<span class="min-w-0 flex-1 truncate">
								<span class="text-gray-900">{event.event.replaceAll('_', ' ')}</span>
								<span class="block truncate text-xs text-gray-500">{event.email}</span>
							</span>
							<span class="shrink-0 text-xs text-gray-500">{ago(event.createdAt)}</span>
						</div>
					{/each}
					{#if data.events.length >= data.eventLimit}
						<!-- Reached through the URL rather than a fetch: the page already
						     knows how to load itself, and this way a deep look is a link
						     somebody can keep. -->
						<a
							href="{resolve('/admin')}?events={data.eventLimit + 50}{data.query
								? `&q=${encodeURIComponent(data.query)}`
								: ''}"
							class="block px-4 py-3 text-center text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900"
						>
							{t('admin.showOlder')}
						</a>
					{/if}
				</div>
			{/if}
		</Card>

		<!--
			What broke in somebody's browser.
			
			Only from accounts that agreed to send it, and only on an instance
			that turned the feature on. It used to go to the server log alone,
			which on the box is journald — so somebody pressing "Send" reached
			nobody who was not already tailing it, and the only way to find out
			was to be told in person.
		-->
		<Card
			title={t('admin.whatPeopleSentIn')}
			description={t('admin.problemsSomebodyReportedIdeasThey')}
			flush
		>
			{#if data.clientErrors.length === 0}
				<EmptyState icon="info" title={t('admin.nothingReported')} />
			{:else}
				<div class="max-h-96 divide-y divide-gray-200 overflow-y-auto">
					{#each data.clientErrors as report (report.id)}
						<details class="px-4 py-2 text-sm">
							<summary class="cursor-pointer list-none">
								<!-- Somebody sat down and wrote this one, so it reads differently
								     from a stack trace the app noticed on its own. -->
								{#if report.kind === 'report'}
									<span class="chip mr-2 align-middle">{t('admin.reported')}</span>
								{:else if report.kind === 'suggestion'}
									<span class="chip mr-2 border-blue-300 bg-blue-50 align-middle text-blue-800">
										{t('admin.suggested')}
									</span>
								{/if}
								<span class="text-gray-900">{report.message}</span>
								<span class="block truncate text-xs text-gray-500">
									<!-- Three different absences, and they mean different things: nobody
									     was signed in, the account has since gone, or the report
									     carried no page. -->
									{report.email ??
										(report.userId ? t('admin.accountDeleted') : t('admin.notSignedIn'))} ·
									{report.url ?? t('admin.noPage')} · {ago(report.createdAt)}
								</span>
							</summary>
							{#if report.stack}
								<pre
									class="mt-2 max-h-48 overflow-auto bg-gray-50 p-2 text-xs whitespace-pre-wrap text-gray-700">{report.stack}</pre>
							{/if}
							{#if report.userAgent}
								<p class="mt-2 text-xs break-all text-gray-500">{report.userAgent}</p>
							{/if}
							<form method="post" action="?/dismissReport" use:enhance class="mt-2">
								<input type="hidden" name="id" value={report.id} />
								<button class="btn btn-sm">{t('ui.dismiss')}</button>
							</form>
						</details>
					{/each}
				</div>
			{/if}
		</Card>

	</div>
</div>

<style>
	/*
	 * Administrators are the handful of accounts that can act on the others, so
	 * "who has the keys" should be answerable by looking rather than by reading.
	 *
	 * A rule down the side rather than a wash: a 6% tint is invisible on the
	 * dark theme and a heavier one is muddy on the light. A border is the same
	 * weight in both, and it is the idiom the cards already use.
	 */
	.account-row.is-admin {
		box-shadow: inset 3px 0 0 var(--section-accent);
		background-color: color-mix(in srgb, var(--section-accent) 10%, transparent);
	}

	.badge-role {
		border-radius: var(--radius-sm, 0);
		padding: 0.1rem 0.45rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.badge-admin {
		border: 1px solid color-mix(in srgb, var(--section-accent) 45%, transparent);
		color: var(--section-accent);
	}

	.badge-owner {
		background-color: var(--section-accent);
		color: var(--color-white);
	}
</style>
