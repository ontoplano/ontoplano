<script lang="ts">
	import { dateOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { enhance } from '$lib/enhance';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import CardGrid from '$lib/components/CardGrid.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import { listCursor } from '$lib/actions/list-cursor';
	import { getAction } from '$lib/shortcuts';
	import type { PlainKey } from '$lib/i18n/keys';
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
	/** The subscriber whose removal is being confirmed. */
	let removing = $state<number | null>(null);

	const confirmedDismiss = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			dismissing = null;
			await update();
		};
	};

	const kindLabel = mailKindLabel;

	/*
	 * The order of the accounts. The server answers newest first; the other
	 * orders are this page's own, since the list is one page long.
	 */
	const ORDERS = ['joined', 'email'] as const;
	type Order = (typeof ORDERS)[number];
	const ORDER_LABELS: Record<Order, PlainKey> = {
		joined: 'admin.orderJoined',
		email: 'admin.orderAddress'
	};
	let order = $state<Order>('joined');
	let direction = $state<'asc' | 'desc'>('desc');
	const accounts = $derived.by(() => {
		const sorted = [...data.accounts].sort((a, b) =>
			order === 'email' ? a.email.localeCompare(b.email) : a.createdAt.localeCompare(b.createdAt)
		);
		return direction === 'desc' ? sorted.reverse() : sorted;
	});

	/** The one role word every account wears, whatever the role. */
	function roleLabel(account: { isOwner: boolean; role: string }): string {
		if (account.isOwner) return t('admin.owner');
		return account.role === 'admin' ? t('admin.admin') : t('admin.member');
	}

	let cursor = $state(-1);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;
		const action = getAction('/admin', e.key);
		if (action === 'navigate-down' || action === 'navigate-up') {
			e.preventDefault();
			if (accounts.length === 0) return;
			cursor = Math.min(
				Math.max(cursor + (action === 'navigate-down' ? 1 : -1), 0),
				accounts.length - 1
			);
		} else if (action === 'open' && accounts[cursor]) {
			e.preventDefault();
			goto(resolve('/admin/[id]', { id: accounts[cursor].id }));
		}
	}

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

<svelte:window onkeydown={handleKeydown} />

{#snippet sortControl()}
	<SortControl
		value={order}
		options={ORDERS}
		labels={ORDER_LABELS}
		{direction}
		onpick={(next) => (order = next)}
		onflip={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
		label={t('admin.orderAccountsBy')}
	/>
{/snippet}

<div class="space-y-4 pt-4">
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
		Two columns of cards, each one foldable: the page is read two cards at a
		time, and the rest can be folded out of the way — remembered per card.
		Inside the room's gutter on every side, the top included: the grid is
		not one card meeting the track, so it floats like the rest of the page.
	-->
	<CardGrid class="items-start">
		<Card id="admin-accounts" title={t('admin.accounts')} flush collapsible>
			<RoomToolbar inset>
				{#snippet tools()}
					<FilterBar
						name="accounts"
						on={!!data.query}
						onclear={() => goto(resolve('/admin'))}
						trailing={sortControl}
					>
						{#snippet lead()}
							<!-- A plain GET form: the URL is the state, so a search can be kept. -->
							<form method="get" class="contents">
								<SearchField name="q" value={data.query} label={t('admin.searchAccounts')} />
							</form>
						{/snippet}
						{#snippet count()}
							<ShowingCount
								total={data.accounts.length}
								shown={data.accounts.length}
								said={(count) => t('admin.accountsShowing', { count })}
							/>
						{/snippet}
					</FilterBar>
				{/snippet}
			</RoomToolbar>

			{#if data.accounts.length === 0}
				{#if data.query}
					<EmptyState filtered onclear={() => goto(resolve('/admin'))} />
				{:else}
					<EmptyState icon="user" title={t('admin.noAccountsYet')} />
				{/if}
			{:else}
				<div class="divide-y divide-gray-200">
					{#each accounts as account, at (account.id)}
						<div class="list-row" data-row use:listCursor={cursor === at}>
							<span class="row-rail"></span>
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

							<span class="chip shrink-0">{roleLabel(account)}</span>

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

		<!-- What went wrong, what happened, what was sent in. -->
		{#if data.mailFailures.length > 0}
			<!-- Only rendered when something is wrong: an empty "all mail fine"
				     card would train the eye to skip this spot. -->
			<Card
				id="admin-mail-failures"
				title={t('admin.mailThatDidNotGo')}
				description={t('admin.theWatchersAreToldThis')}
				flush
				collapsible
			>
				<div class="divide-y divide-gray-200">
					{#each data.mailFailures as failure (failure.id)}
						<div class="list-row" data-row>
							<span class="row-rail"></span>
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
											<Icon name="send" />
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

		{#if data.newsletter}
			<!-- Who gets the release mail, and what has gone to them. -->
			<Card
				id="admin-mailing-list"
				title={t('admin.mailingList')}
				description={t('admin.mailingListDescription', {
					count: data.newsletter.subscribers.length
				})}
				flush
				collapsible
			>
				<div class="divide-y divide-gray-200" data-tour="admin-mailing-list">
					{#each data.newsletter.subscribers as one (one.id)}
						<div class="list-row" data-row>
							<span class="row-rail"></span>
							<div class="list-row-main">
								<p class="truncate text-sm text-gray-900">{one.email}</p>
								<p class="mt-0.5 text-xs text-gray-500">
									{t('admin.subscribedFrom', { source: one.source, when: ago(one.since) })}
								</p>
							</div>
							<div class="list-row-actions">
								{#if removing === one.id}
									<form
										method="post"
										action="?/unsubscribe"
										use:enhance={() =>
											async ({ update }) => {
												removing = null;
												await update();
											}}
									>
										<input type="hidden" name="id" value={one.id} />
										<button class="btn btn-sm btn-danger" use:armed>{t('admin.confirm')}</button>
									</form>
									<button
										type="button"
										class="icon-btn"
										title={t('ui.cancel')}
										aria-label={t('ui.cancel')}
										onclick={() => (removing = null)}><Icon name="close" /></button
									>
								{:else}
									<button
										type="button"
										class="icon-btn icon-btn-danger"
										title={t('admin.takeOffTheList')}
										aria-label={t('admin.takeOffTheList')}
										onclick={() => (removing = one.id)}
									>
										<Icon name="trash" />
									</button>
								{/if}
							</div>
						</div>
					{:else}
						<div class="px-4">
							<EmptyState icon="send" title={t('admin.nobodyOnTheList')} compact />
						</div>
					{/each}
				</div>
			</Card>

			<!-- What has gone to them: one row per release mail, apart from the
				     addresses so a mail does not read as one more person on the list. -->
			<Card
				id="admin-release-mails"
				title={t('admin.releaseMails')}
				description={t('admin.releaseMailsDescription')}
				flush
				collapsible
			>
				<div class="divide-y divide-gray-200">
					{#each data.newsletter.issues as issue (issue.id)}
						<div class="list-row">
							<span class="row-rail"></span>
							<div class="list-row-main">
								<p class="truncate text-sm text-gray-900">{issue.subject}</p>
								<p class="mt-0.5 text-xs text-gray-500">
									{t('admin.issueSent', {
										sent: issue.sent,
										failed: issue.failed,
										when: ago(issue.sentAt)
									})}
								</p>
							</div>
						</div>
					{:else}
						<div class="list-row">
							<span class="row-rail"></span>
							<p class="list-row-main text-sm text-gray-500">{t('admin.noIssueYet')}</p>
						</div>
					{/each}
				</div>
			</Card>
		{/if}

		<Card
			id="admin-lately"
			title={t('admin.lately')}
			description={t('admin.everyAccountSHistoryInOne')}
			flush
			collapsible
		>
			{#snippet actions()}
				<button
					type="button"
					class="icon-btn"
					title={t('admin.refresh')}
					aria-label={t('admin.refresh')}
					onclick={() => invalidateAll()}
				>
					<Icon name="refresh" />
				</button>
			{/snippet}
			{#if data.events.length === 0}
				<EmptyState icon="clock" title={t('admin.nothingRecordedYet')} compact />
			{:else}
				<!-- Bounded by the server rather than by a scroll box: the page
					     scrolls, and "Show older" asks for more. -->
				<div class="divide-y divide-gray-200">
					{#each data.events as event (event.id)}
						<div class="list-row" data-row>
							<span class="row-rail"></span>
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
			id="admin-sent-in"
			title={t('admin.whatPeopleSentIn')}
			description={t('admin.problemsSomebodyReportedIdeasThey')}
			flush
			collapsible
		>
			{#if data.clientErrors.length === 0}
				<EmptyState icon="info" title={t('admin.nothingReported')} compact />
			{:else}
				<div class="divide-y divide-gray-200">
					{#each data.clientErrors as report (report.id)}
						<details class="sent-in py-3 pr-4 text-sm">
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
									class="mt-2 border border-gray-200 bg-gray-50 p-2 text-xs break-all whitespace-pre-wrap text-gray-700">{report.stack}</pre>
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
	</CardGrid>
</div>

<style>
	/* On the rows' text column, like the lists above it. */
	.sent-in {
		padding-inline-start: var(--row-text-x);
	}
</style>
