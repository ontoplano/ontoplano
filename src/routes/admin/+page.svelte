<script lang="ts">
	import { dateOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { enhance } from '$lib/enhance';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
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

<div class="space-y-4">
	<FormError message={form?.message} />

	<!--
		Above everything, because it is worth more than everything else on this
		page. An instance that means to charge and cannot used to look completely
		normal; registration refuses now, and this is the sentence that says why.
	-->
	{#if data.billingSandbox}
		<Banner kind="error" message={t('admin.billingSandboxWarning')} />
	{/if}
	{#if data.billingBroken}
		<Banner kind="error">
			<p>{data.billingBroken}</p>
			<p class="mt-1">{t('admin.nobodyCanRegisterUntilThis')}</p>
		</Banner>
	{/if}

	<!--
		The accounts and what is happening to them, as one surface with a seam
		down the middle — the shape the people and notebooks rooms have — rather
		than four cards with the page showing between them.
	-->
	<div class="room-surface grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
		<Card title={t('admin.accounts')} flush pane>
			<RoomToolbar inset>
				{#snippet tools()}
					<!-- A plain GET form: the URL is the state, so a search can be kept. -->
					<form method="get" class="flex min-w-0 flex-1 items-center gap-3">
						<label class="block w-full sm:max-w-sm">
							<span class="sr-only">{t('admin.searchAccounts')}</span>
							<input
								type="search"
								name="q"
								value={data.query}
								placeholder={t('admin.searchAccounts')}
								autocomplete="off"
								class="input input-sm"
							/>
						</label>
						<span class="tabular shrink-0 text-xs text-gray-500"
							>{t('admin.accountsShowing', { count: data.accounts.length })}</span
						>
					</form>
				{/snippet}
			</RoomToolbar>

			{#if data.accounts.length === 0}
				<EmptyState
					icon="user"
					title={data.query ? t('admin.nobodyMatchesThat') : t('admin.noAccountsYet')}
				/>
			{:else}
				<div class="divide-y divide-gray-200">
					{#each data.accounts as account (account.id)}
						<div
							class="list-row account-row"
							class:is-admin={account.role === 'admin' || account.isOwner}
						>
							<a href="{resolve('/admin')}/{account.id}" class="list-row-main group">
								<span class="block truncate text-sm text-gray-900 group-hover:underline"
									>{account.email}</span
								>
								<span class="block text-xs text-gray-500">
									{account.name}
									{t('admin.joined')}
									{when(account.createdAt)} ·
									{t('admin.sessionCount', { count: account.sessions })}
									<!-- Who pays: a family payer and their riders read differently
									     from a plain subscriber. -->
									· {account.plan}
									{#if !account.emailVerified}{t('admin.unverified')}{/if}
								</span>
							</a>

							{#if account.isOwner}
								<span class="pill shrink-0" style="--pill: var(--section-accent)"
									>{t('admin.owner')}</span
								>
							{:else if account.role === 'admin'}
								<span class="pill shrink-0" style="--pill: var(--section-accent)"
									>{t('admin.admin')}</span
								>
							{:else}
								<span class="eyebrow shrink-0 text-gray-500">{account.role}</span>
							{/if}

							<div class="list-row-actions">
								{#if account.id === data.me}
									<!-- Your own keys are not yours to take: an instance whose last
									     administrator demoted themselves has nobody to undo it. -->
									<span class="text-xs text-gray-500">{t('admin.you')}</span>
								{:else if account.isOwner}
									<span class="text-xs text-gray-500">{t('admin.alwaysAnAdmin')}</span>
								{:else}
									<!-- Two steps, because an administrator can read and change every
									     account, and the button sits in a list you scroll. -->
									<form method="post" action="?/setRole" use:enhance={confirmed}>
										<input type="hidden" name="id" value={account.id} />
										<input
											type="hidden"
											name="role"
											value={account.role === 'member' ? 'admin' : 'member'}
										/>
										{#if changing === account.id}
											<span class="flex items-center gap-1">
												<button class="btn btn-sm btn-danger" use:armed>
													{account.role === 'member'
														? t('admin.yesMakeAdmin')
														: t('admin.yesRemoveAdmin')}
												</button>
												<button
													type="button"
													class="icon-btn"
													title={t('ui.cancel')}
													aria-label={t('ui.cancel')}
													onclick={() => (changing = null)}><Icon name="close" /></button
												>
											</span>
										{:else}
											<button
												type="button"
												class="icon-btn"
												title={account.role === 'member'
													? t('admin.makeAdmin')
													: t('admin.removeAdmin')}
												aria-label={account.role === 'member'
													? t('admin.makeAdmin')
													: t('admin.removeAdmin')}
												onclick={() => (changing = account.id)}><Icon name="shield" /></button
											>
										{/if}
									</form>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Card>

		<!-- The narrow column: what went wrong, what happened, what was stopped. -->
		<div class="divide-y divide-gray-200">
			{#if data.mailFailures.length > 0}
				<!-- Only rendered when something is wrong: an empty "all mail fine"
				     card would train the eye to skip this spot. -->
				<Card
					title={t('admin.mailThatDidNotGo')}
					description={t('admin.theWatchersAreToldThis')}
					flush
					pane
				>
					<div class="divide-y divide-gray-200">
						{#each data.mailFailures as failure (failure.id)}
							<div class="list-row">
								<div class="list-row-main">
									<p class="truncate text-sm text-gray-900">
										{kindLabel(failure.kind)}
										<span class="text-gray-500">→ {failure.toEmail}</span>
									</p>
									<p class="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-900">
										<Icon name="warning" size={12} />{failure.error}
									</p>
									<p class="mt-0.5 text-xs text-gray-500">
										{t('admin.lastAttempts', {
											count: failure.attempts,
											lastAttemptAt: ago(failure.lastAttemptAt)
										})}
									</p>
								</div>
								<div class="list-row-actions">
									{#if failure.retryable}
										<form method="post" action="?/retryMail" use:enhance>
											<input type="hidden" name="id" value={failure.id} />
											<button
												class="icon-btn"
												title={t('admin.sendItAgainAsIt')}
												aria-label={t('admin.sendItAgainAsIt')}
											>
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
											class="icon-btn icon-btn-danger"
											title={failure.retryable
												? t('admin.dropItWithoutSending')
												: t('admin.itsLinkHasExpired')}
											aria-label={failure.retryable
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

			<Card title={t('admin.lately')} description={t('admin.everyAccountSHistoryInOne')} flush pane>
				{#snippet actions()}
					<button
						type="button"
						class="icon-btn"
						title={t('admin.refresh')}
						aria-label={t('admin.refresh')}
						onclick={() => invalidateAll()}
					>
						<Icon name="undo" />
					</button>
				{/snippet}
				{#if data.events.length === 0}
					<EmptyState icon="clock" title={t('admin.nothingRecordedYet')} />
				{:else}
					<!--
						Contained and scrollable: on an instance in use this is the one
						list with no natural end.
					-->
					<div class="max-h-96 divide-y divide-gray-200 overflow-y-auto">
						{#each data.events as event (event.id)}
							<div class="list-row">
								<div class="list-row-main">
									<p class="truncate text-sm text-gray-900">{event.event.replaceAll('_', ' ')}</p>
									<p class="truncate text-xs text-gray-500">{event.email}</p>
								</div>
								<span class="shrink-0 text-xs text-gray-500">{ago(event.createdAt)}</span>
							</div>
						{/each}
						{#if data.events.length >= data.eventLimit}
							<!-- Reached through the URL rather than a fetch, so a deep look is
							     a link somebody can keep. -->
							<div class="px-4 py-2">
								<a
									href="{resolve('/admin')}?events={data.eventLimit + 50}{data.query
										? `&q=${encodeURIComponent(data.query)}`
										: ''}"
									class="btn btn-sm"
								>
									<Icon name="chevron-down" />
									{t('admin.showOlder')}
								</a>
							</div>
						{/if}
					</div>
				{/if}
			</Card>

			<!--
				What broke in somebody's browser, from accounts that agreed to send
				it, on an instance that turned the feature on.
			-->
			<Card
				title={t('admin.whatPeopleSentIn')}
				description={t('admin.problemsSomebodyReportedIdeasThey')}
				flush
				pane
			>
				{#if data.clientErrors.length === 0}
					<EmptyState icon="info" title={t('admin.nothingReported')} />
				{:else}
					<div class="max-h-96 divide-y divide-gray-200 overflow-y-auto">
						{#each data.clientErrors as report (report.id)}
							<details class="px-4 py-3 text-sm">
								<summary class="cursor-pointer list-none">
									<!-- Somebody sat down and wrote this one, so it reads
									     differently from a stack trace the app noticed on its own. -->
									{#if report.kind === 'report'}
										<span class="chip mr-2 align-middle">{t('admin.reported')}</span>
									{:else if report.kind === 'suggestion'}
										<span class="chip mr-2 align-middle">{t('admin.suggested')}</span>
									{/if}
									<span class="text-gray-900">{report.message}</span>
									<span class="block truncate text-xs text-gray-500">
										<!-- Three different absences: nobody was signed in, the
										     account has since gone, or the report carried no page. -->
										{report.email ??
											(report.userId ? t('admin.accountDeleted') : t('admin.notSignedIn'))} ·
										{report.url ?? t('admin.noPage')} · {ago(report.createdAt)}
									</span>
								</summary>
								{#if report.stack}
									<pre
										class="mt-2 max-h-48 overflow-auto border border-gray-200 bg-gray-50 p-2 text-xs whitespace-pre-wrap text-gray-700">{report.stack}</pre>
								{/if}
								{#if report.build}
									<!-- The build, not only the version: the version is not bumped
									     per commit, so it names a dozen builds. -->
									<p class="tabular mt-2 text-xs text-gray-500">{report.build}</p>
								{/if}
								{#if report.userAgent}
									<p class="mt-2 text-xs break-all text-gray-500">{report.userAgent}</p>
								{/if}
								<form method="post" action="?/dismissReport" use:enhance class="mt-2">
									<input type="hidden" name="id" value={report.id} />
									<button class="btn btn-sm"><Icon name="check" />{t('ui.dismiss')}</button>
								</form>
							</details>
						{/each}
					</div>
				{/if}
			</Card>
		</div>
	</div>
</div>

<style>
	/*
	 * Administrators are the handful of accounts that can act on the others, so
	 * "who has the keys" is answerable by looking: a rule down the side, the
	 * weight the cards' own accent uses, in both themes.
	 */
	.account-row.is-admin {
		box-shadow: inset 3px 0 0 var(--section-accent);
	}
</style>
