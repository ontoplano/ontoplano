<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import { enhance } from '$app/forms';
	import OneLine from '$lib/components/OneLine.svelte';
	import { settingsForm } from '$lib/actions/settings-form';
	import { armed } from '$lib/actions/armed';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { REGISTRATION_MODES } from '$lib/registration';
	import StagingBand from '$lib/components/StagingBand.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/**
	 * Whether this instance is the device it is running on.
	 *
	 * Then most of this page is about somebody else's deployment: an address
	 * that is listened on, people who may register, timers beside the app, a
	 * mailing list, invitations. A phone has none of them. The two questions
	 * the tab exists to answer — what is running, and where the data is — it
	 * answers here too, and they are the whole screen.
	 */
	const onDevice = $derived('onDevice' in data && data.onDevice === true);

	/** The device's own answer to "where is my data", when it is the one asked. */
	const storage = $derived(
		'storage' in data ? (data.storage as { path: string; tables: number }) : null
	);

	/**
	 * The export, as a file the browser saves rather than a page of addresses.
	 *
	 * A `<form>` post rather than a link, so the addresses are never a URL that
	 * lands in a history, a proxy log or a shoulder. The action answers with the
	 * list and this turns it into a download without a navigation.
	 */
	const exportList = () => {
		return async ({ result }: { result: { type: string; data?: { addresses?: string[] } } }) => {
			const addresses = result.type === 'success' ? (result.data?.addresses ?? []) : [];
			if (addresses.length === 0) return;

			const blob = new Blob([addresses.join('\n') + '\n'], { type: 'text/plain' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'subscribers.txt';
			a.click();
			URL.revokeObjectURL(url);
		};
	};

	let confirmRevoke = $state<number | null>(null);
	let copied = $state<string | null>(null);

	/** Shown once, right after it is made: the code is no use on this page. */
	const fresh = $derived(
		form?.success && form.action === 'createInvite' ? (form.code ?? null) : null
	);

	const open = $derived(data.invites.filter((i) => !i.usedAt));
	const used = $derived(data.invites.filter((i) => i.usedAt));

	/** The register form, with the code already in it. */
	function inviteLink(code: string): string {
		const origin = typeof location === 'undefined' ? '' : location.origin;
		return `${origin}/login?register&invite=${encodeURIComponent(code)}`;
	}

	async function copy(code: string) {
		try {
			await navigator.clipboard.writeText(code);
			copied = code;
			setTimeout(() => (copied = null), 2000);
		} catch {
			// A browser that refuses the clipboard is not an error worth a banner;
			// the code is on screen and can be selected.
		}
	}

	/** "3 minutes ago", down to the granularity anybody reads at a glance. */
	function ago(iso: string): string {
		const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
		if (seconds < 90) return t('settings.instance.secondsAgo', { count: seconds });
		const minutes = Math.round(seconds / 60);
		if (minutes < 90) return t('settings.instance.minutesAgo', { count: minutes });
		const hours = Math.round(minutes / 60);
		if (hours < 36) return t('settings.instance.hoursAgo', { count: hours });
		return t('settings.instance.daysAgo', { count: Math.round(hours / 24) });
	}

	function exactly(iso: string): string {
		return new Date(iso).toLocaleString(t.locale, {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	/**
	 * Did the running process start from the build it is reporting?
	 *
	 * A build newer than the process means the deploy did not restart anything —
	 * the failure mode of every deploy script ever written, and one that looks
	 * exactly like success.
	 *
	 * The minute of slack is not politeness. In development both timestamps come
	 * from the same process seconds apart, in either order, and clocks on two
	 * machines are never exactly equal. A minute is far below the gap that
	 * matters, which is a deploy that visibly did nothing.
	 */
	const SLACK_MS = 60_000;
	const restartedIntoThisBuild = $derived(
		new Date(data.build.startedAt).getTime() >= new Date(data.build.builtAt).getTime() - SLACK_MS
	);

	function when(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(t.locale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<div class="space-y-4">
	<FormError message={form?.message} />

	{#if data.staging}
		<StagingBand
			detail="ONTOPLANO_STAGING=true in the server's environment. Unset it and restart to close the doors."
		/>
	{/if}

	<Card
		title={t('settings.instance.whatIsRunning')}
		description={onDevice
			? t('settings.instance.whichOntoplanoThisIsAnd')
			: t('settings.instance.whetherTheLastDeployIs')}
	>
		<dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
			<!--
				Which of the two this is, said before anything else on the page.

				Somebody can be running this copy and one behind a server at the
				same time, and the two are the same app to look at — so the screen
				that answers "what am I looking at" has to answer that part first.
				The main menu's mark is drained here for the same reason; this is
				the sentence behind it.
			-->
			{#if onDevice}
				<div>
					<dt class="text-sm text-gray-500">{t('settings.instance.instance')}</dt>
					<dd class="text-sm font-semibold text-gray-900">
						{t('settings.instance.isolated')}
						<span class="block font-normal text-gray-500">
							{t('settings.instance.thisDeviceOnItsOwn')}
						</span>
					</dd>
				</div>
			{/if}

			<div>
				<dt class="text-sm text-gray-500">{t('settings.instance.version')}</dt>
				<dd class="tabular text-lg font-semibold text-gray-900" data-testid="app-version">
					{data.build.version}
					<span class="text-sm font-normal text-gray-500">({data.build.commit})</span>
				</dd>
			</div>

			<div>
				<dt class="text-sm text-gray-500">{t('settings.instance.built')}</dt>
				<dd class="text-sm text-gray-900">
					{ago(data.build.builtAt)}
					<span class="text-gray-500">· {exactly(data.build.builtAt)}</span>
				</dd>
			</div>

			<!-- A server can be older than the build it reports; here the page you
			     are looking at is the build. -->
			{#if !onDevice}
				<div>
					<dt class="text-sm text-gray-500">{t('settings.instance.runningSince')}</dt>
					<dd class="text-sm text-gray-900">
						{ago(data.build.startedAt)}
						<span class="text-gray-500">· {exactly(data.build.startedAt)}</span>
					</dd>
				</div>
			{/if}

			{#if !onDevice}
				<div>
					<dt class="text-sm text-gray-500">{t('settings.instance.registrationInForce')}</dt>
					<dd class="text-sm text-gray-900">
						{data.effectiveRegistration}
						{#if data.effectiveRegistration !== data.config.registration.mode}
							<span class="text-amber-700"
								>{t('settings.instance.theEnvironmentOverridesThe', {
									mode: data.config.registration.mode
								})}</span
							>
						{/if}
					</dd>
				</div>
			{:else if storage}
				<div>
					<dt class="text-sm text-gray-500">{t('settings.instance.whereTheDataIs')}</dt>
					<dd class="text-sm text-gray-900">
						<span class="tabular">{storage.path}</span>
						<span class="text-gray-500"
							>{t('settings.instance.tables', { tables: storage.tables })}</span
						>
					</dd>
				</div>
			{/if}
		</dl>

		{#if !onDevice && !restartedIntoThisBuild}
			<div class="mt-4">
				<Banner kind="warning">
					{t('settings.instance.thisProcessIsOlderThan')}
					<code class="tabular">{t('settings.instance.makeRestartServer')}</code>
				</Banner>
			</div>
		{/if}
	</Card>

	<!--
		The rest of this page is somebody else's deployment.
		
		The timers beside the app, the address it listens on, who may register,
		the mailing list, what an account may change, where reports go, the
		invitations. An instance that is a phone has none of them — there is
		nobody else who could register and nothing listening — so they are
		absent rather than shown empty.
	-->
	{#if !onDevice}
		{#if data.companions.length > 0}
			<!--
				The processes the app needs beside itself.

				`ontoplano.service` alone is an app that works perfectly and never
				reminds anybody of anything: reminders, the weekly review mail and
				(where this instance sells) billing reconciliation each fire from a
				timer of their own. This says which of them this box actually has —
				and for reminders it reads the app's own record of being asked, which
				is true whatever is doing the asking.

				Blue for running and red for not, never green — and the word carries
				the meaning either way.
			-->
			<Card
				title={t('settings.instance.theServicesBesideTheApp')}
				description={t('settings.instance.theAppAnswersRequestsThese')}
			>
				<ul class="divide-y divide-gray-200">
					{#each data.companions as row (row.unit)}
						<li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
							<span
								class="h-2 w-2 shrink-0 self-center rounded-full {row.ok
									? 'bg-blue-600'
									: 'bg-red-600'}"
								aria-hidden="true"
							></span>
							<span class="text-sm font-medium text-gray-900">{t(row.label)}</span>
							<span class="text-sm {row.ok ? 'text-gray-600' : 'text-red-700'}">{row.detail}</span>
							{#if row.fix}
								<code class="tabular basis-full pl-5 text-xs text-gray-600 sm:basis-auto sm:pl-0"
									>{row.fix}</code
								>
							{/if}
						</li>
					{/each}
				</ul>
			</Card>
		{/if}

		<div class="grid gap-4 lg:grid-cols-2">
			<!--
				Read, not edit.
			
				The host and port were fields here, and there is no moment at which
				somebody signed into a running instance wants to change the address it
				is listening on from inside that instance: a wrong value takes the app
				off the air, and the way back is a text editor and a restart on the
				box. It is a fact about the deployment, like the database path beside
				it, so it is shown the same way.
			-->
			<!--
				Blank on the demo. Both of these describe somebody's server — the
				address it answers on, and a path that carries the name of the user it
				runs as — and everybody browsing the demo is signed into its one
				administrator account. The cards stay, because what this page is for is
				part of what the demo shows.
			-->
			<Card
				title={t('settings.instance.deployment')}
				description={t('settings.instance.whereTheServerListensSet')}
			>
				<p
					class="tabular border border-gray-200 bg-gray-50 px-3 py-2 text-sm break-all text-gray-700"
				>
					{#if data.demo}
						<span class="text-gray-500">{t('settings.instance.hiddenOnTheDemo')}</span>
					{:else}
						{data.config.server.host}:{data.config.server.port}
					{/if}
				</p>
			</Card>

			<Card
				title={t('settings.instance.database')}
				description={t('settings.instance.whereYourDataIsStored')}
			>
				<p
					class="tabular border border-gray-200 bg-gray-50 px-3 py-2 text-sm break-all text-gray-700"
				>
					{#if data.demo}
						<span class="text-gray-500">{t('settings.instance.hiddenOnTheDemo')}</span>
					{:else}
						{data.config.database.path}
					{/if}
				</p>
			</Card>
		</div>

		<Card
			title={t('settings.instance.whoCanRegister')}
			description={t('settings.instance.anInstanceOnTheOpen')}
		>
			{#if data.effectiveRegistration !== data.config.registration.mode}
				<!--
					The bug this fixes: the radios showed the file while the environment
					was forcing something else, so the page said "Closed" on an instance
					anybody could join. What is stored and what is in force are two
					different facts and the page has to show both.
				-->
				<div class="mb-4">
					<Banner kind="warning">
						<strong>{data.effectiveRegistration}</strong>
						{t('settings.instance.rightNowSetInThe')}
					</Banner>
				</div>
			{/if}

			<form
				method="post"
				action="?/setRegistration"
				use:settingsForm={{ notice: t('settings.instance.registrationSaved') }}
				class="space-y-3"
			>
				{#each REGISTRATION_MODES as mode (mode.key)}
					<label class="flex cursor-pointer items-start gap-3">
						<input
							type="radio"
							name="mode"
							value={mode.key}
							checked={data.config.registration.mode === mode.key}
							class="mt-1"
						/>
						<span>
							<span class="block text-sm font-medium text-gray-900">{t(mode.label)}</span>
							<span class="block text-sm text-gray-500">{t(mode.hint)}</span>
						</span>
					</label>
				{/each}

				<button class="btn btn-primary">{t('ui.save')}</button>
			</form>
		</Card>

		{#if data.newsletter}
			{@const list = data.newsletter}
			<Card
				title={t('settings.instance.theMailingList')}
				description={t('settings.instance.peopleWhoAskedToBe')}
			>
				{#snippet actions()}
					<form method="post" action="?/exportSubscribers" use:enhance={exportList}>
						<button class="btn btn-sm" disabled={list.confirmed === 0}>
							<Icon name="download" />
							{t('settings.instance.export')}
						</button>
					</form>
				{/snippet}
				<p class="text-sm text-gray-500">
					<span class="font-medium text-gray-900">{list.confirmed}</span>
					{t('settings.instance.confirmed')}{#if list.pending > 0}{t('settings.instance.and')}
						{list.pending}
						{t('settings.instance.whoHaveNotFollowedThe')}{/if}{t(
						'settings.instance.onlyConfirmedAddressesAre'
					)}
				</p>
			</Card>
		{/if}

		<Card
			title={t('settings.instance.whatAnAccountMayChange')}
			description={t('settings.instance.anAddressIsWhatAn')}
		>
			<form
				method="post"
				action="?/setEmailChange"
				use:settingsForm={{ notice: 'Saved.' }}
				class="space-y-3"
			>
				<label class="flex cursor-pointer items-start gap-3">
					<input
						type="checkbox"
						name="allowEmailChange"
						value="true"
						checked={data.config.account.allowEmailChange}
						class="mt-1"
					/>
					<span>
						<span class="block text-sm font-medium text-gray-900">
							{t('settings.instance.letPeopleMoveTheirAccount')}
						</span>
						<span class="block text-sm text-gray-500">
							{t('settings.instance.offByDefaultTheChange')}
						</span>
					</span>
				</label>

				<button class="btn btn-primary">{t('ui.save')}</button>
			</form>
		</Card>

		<Card
			title={t('settings.instance.reportsAndSuggestions')}
			description={t('settings.instance.whenAPageBreaksIn')}
		>
			<form
				method="post"
				action="?/setClientErrors"
				use:settingsForm={{ notice: 'Saved.' }}
				class="space-y-3"
			>
				<label class="flex cursor-pointer items-start gap-3">
					<input
						type="checkbox"
						name="clientErrors"
						value="true"
						checked={data.config.reports.clientErrors}
						class="mt-1"
					/>
					<span>
						<span class="block text-sm font-medium text-gray-900">
							{t('settings.instance.offerToSendWhatBroke')}
						</span>
						<span class="block text-sm text-gray-500">
							{t('settings.instance.offByDefaultEachPerson')}
						</span>
					</span>
				</label>

				<label class="block text-sm">
					<span class="block font-medium text-gray-900"
						>{t('settings.instance.sendReportsAndSuggestionsTo')}</span
					>
					<span class="block text-gray-500">
						{t('settings.instance.leaveItEmptyAndThey')}
					</span>
					<OneLine
						name="feedbackEmail"
						value={data.config.reports.feedbackEmail}
						class="input mt-1 w-full sm:max-w-sm"
						placeholder={t('settings.instance.youExampleCom')}
					/>
				</label>

				<button class="btn btn-primary">{t('ui.save')}</button>
			</form>
		</Card>

		<!--
			Invitations are not only for a closed instance.

			They used to be: open registration ignored a code outright, so on the
			instance that actually sells something an invitation meant nothing. What it
			means now is the thing worth giving away — a month of the app handed over at
			sign-up, no card asked for and no trial spent. The code still lets somebody
			in where the instance is closed; that is the smaller half of its job.
		-->
		<Card
			title={t('settings.instance.invitations')}
			description={data.sellsAnything
				? t('settings.instance.aCodeSomebodyTypesWhen')
				: t('settings.instance.aCodeSomebodyTypesWhen2')}
		>
			{#snippet actions()}
				<span class="eyebrow text-gray-600"
					>{t('settings.instance.open', { length: open.length })}</span
				>
			{/snippet}

			{#if fresh}
				<div class="mb-4 border border-blue-200 bg-blue-50 p-3">
					<p class="text-sm text-blue-900">
						{t('settings.instance.handThisOverNow')}
					</p>
					<div class="mt-2 flex items-center gap-2">
						<code
							class="tabular flex-1 border border-blue-200 bg-white px-3 py-2 text-sm break-all"
						>
							{fresh}
						</code>
						<button type="button" onclick={() => copy(fresh)} class="btn btn-sm">
							<Icon name="copy" />
							{copied === fresh ? 'Copied' : 'Copy'}
						</button>
					</div>
					<!--
						The link, not only the code.

						Sending somebody a string and telling them where to paste it is a step
						they can get wrong; this one opens the register form with the code
						already in it, which is the whole of what they have to do.
					-->
					<div class="mt-2 flex items-center gap-2">
						<code class="flex-1 border border-blue-200 bg-white px-3 py-2 text-xs break-all">
							{inviteLink(fresh)}
						</code>
						<button type="button" onclick={() => copy(inviteLink(fresh))} class="btn btn-sm">
							<Icon name="link" />
							{copied === inviteLink(fresh) ? 'Copied' : t('settings.instance.copyLink')}
						</button>
					</div>
				</div>
			{/if}

			<form method="post" action="?/createInvite" use:enhance>
				<FormGrid>
					<Field
						label={t('settings.instance.whoIsItFor')}
						span={12}
						hint={t('settings.instance.forYourOwnMemoryThey')}
					>
						<OneLine name="note" placeholder={t('settings.instance.myBrother')} class="input" />
					</Field>

					<Field
						label={t('settings.instance.codeExpiresIn')}
						span={6}
						hint={t('settings.instance.daysLeaveEmptyForNo')}
					>
						<NumberBox autocomplete="off" name="expiresInDays" min="1" max="365" />
					</Field>

					{#if data.sellsAnything}
						<!--
							The two dates on this form are different clocks and the labels say
							so: one is how long the code works for, the other is how long what
							it hands over lasts.
						-->
						<Field
							label={t('settings.instance.freeUntil')}
							span={6}
							hint={t('settings.instance.aFullAccountOnThe')}
						>
							<input
								autocomplete="off"
								name="grantsUntil"
								type="date"
								value={data.defaultGrantUntil}
								class="input tabular"
							/>
						</Field>
					{/if}
				</FormGrid>

				<div class="mt-4">
					<button class="btn btn-primary"
						><Icon name="plus" /> {t('settings.instance.newInvitation')}</button
					>
				</div>
			</form>

			{#if data.invites.length === 0}
				<div class="mt-4 border-t border-gray-200 pt-4">
					<EmptyState
						icon="key"
						title={t('settings.instance.noInvitationsYet')}
						description={t('settings.instance.makeOneWhenSomebodyNeeds')}
					/>
				</div>
			{:else}
				<div class="mt-4 divide-y divide-gray-200 border-t border-gray-200">
					{#each [...open, ...used] as invite (invite.id)}
						<div class="flex items-center gap-3 py-2 text-sm">
							<span class="min-w-0 flex-1">
								<span class="text-gray-900">{invite.note || t('settings.instance.noNote')}</span>
								<span class="block text-xs text-gray-500">
									{t('settings.instance.made')}
									{when(invite.createdAt)}
									{#if invite.usedAt}
										{t('settings.instance.used2')} {when(invite.usedAt)}
									{:else if invite.expiresAt}
										{t('settings.instance.codeExpires')} {when(invite.expiresAt)}
									{/if}
									{#if data.sellsAnything}
										· {invite.grantsUntil
											? t('settings.instance.freeUntilDate', { date: when(invite.grantsUntil) })
											: t('settings.instance.freeWithNoEndDate')}
									{/if}
								</span>
							</span>

							{#if invite.usedAt}
								<span class="eyebrow shrink-0 text-gray-500">{t('settings.instance.used')}</span>
							{:else if confirmRevoke === invite.id}
								<form
									method="post"
									action="?/revokeInvite"
									use:enhance={() =>
										async ({ update }) => {
											confirmRevoke = null;
											await update();
										}}
									class="flex shrink-0 items-center gap-1"
								>
									<input type="hidden" name="id" value={invite.id} />
									<button type="button" onclick={() => (confirmRevoke = null)} class="btn btn-sm">
										{t('ui.cancel')}
									</button>
									<button class="btn btn-danger btn-sm" use:armed
										>{t('settings.instance.yesRevoke')}</button
									>
								</form>
							{:else}
								<button
									onclick={() => (confirmRevoke = invite.id)}
									class="btn btn-danger btn-sm shrink-0"
								>
									<Icon name="trash" />
									{t('settings.instance.revoke')}
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</Card>
	{/if}
</div>
