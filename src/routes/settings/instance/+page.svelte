<script lang="ts">
	import { dateOf, momentOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import NumberBox from '$lib/components/NumberBox.svelte';
	import { enhance } from '$lib/enhance';
	import OneLine from '$lib/components/OneLine.svelte';
	import { settingsForm } from '$lib/actions/settings-form';
	import { armed } from '$lib/actions/armed';
	import Banner from '$lib/components/Banner.svelte';
	import CopyBlock from '$lib/components/CopyBlock.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import SettingGroup from '$lib/components/SettingGroup.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';
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
	const now = useWhen();

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
	let inviting = $state(false);

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
		return momentOf(iso, now(), { year: undefined });
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
		return dateOf(iso, now());
	}
</script>

<div class="space-y-4">
	<FormError message={form?.message} />

	{#if data.staging}
		<StagingBand detail={t('settings.instance.stagingDetail')} />
	{/if}

	<!--
		One surface, a subject per band, a fact or a setting per row — the shape
		the account page has. It was a card per subject with a Save button in
		each, several of them under one grey header each for a single checkbox.
		The switches save themselves now; the only fields that need a press are
		the ones you type into.
	-->
	<RoomSurface>
		<SettingGroup
			title={t('settings.instance.whatIsRunning')}
			description={onDevice
				? t('settings.instance.whichOntoplanoThisIsAnd')
				: t('settings.instance.whetherTheLastDeployIs')}
		>
			<!--
				Which of the two this is, said before anything else on the page.
				Somebody can be running this copy and one behind a server at the
				same time, and the two are the same app to look at — so the screen
				that answers "what am I looking at" has to answer that part first.
			-->
			{#if onDevice}
				<SettingRow
					label={t('settings.instance.instance')}
					hint={t('settings.instance.thisDeviceOnItsOwn')}
				>
					{#snippet control()}
						<span class="text-sm font-semibold text-gray-900"
							>{t('settings.instance.isolated')}</span
						>
					{/snippet}
				</SettingRow>
			{/if}
			<SettingRow label={t('settings.instance.version')}>
				{#snippet control()}
					<span class="tabular text-sm font-semibold text-gray-900" data-testid="app-version">
						{data.build.version}
						<span class="font-normal text-gray-500">({data.build.commit})</span>
					</span>
				{/snippet}
			</SettingRow>
			<SettingRow label={t('settings.instance.built')}>
				{#snippet control()}
					<span class="text-sm text-gray-900">
						{ago(data.build.builtAt)}
						<span class="text-gray-500">· {exactly(data.build.builtAt)}</span>
					</span>
				{/snippet}
			</SettingRow>
			<!-- A server can be older than the build it reports; here the page you
			     are looking at is the build. -->
			{#if !onDevice}
				<SettingRow label={t('settings.instance.runningSince')}>
					{#if !restartedIntoThisBuild}
						<div class="mt-2">
							<Banner kind="warning">
								{t('settings.instance.thisProcessIsOlderThan')}
								<code class="tabular">{t('settings.instance.makeRestartServer')}</code>
							</Banner>
						</div>
					{/if}
					{#snippet control()}
						<span class="text-sm text-gray-900">
							{ago(data.build.startedAt)}
							<span class="text-gray-500">· {exactly(data.build.startedAt)}</span>
						</span>
					{/snippet}
				</SettingRow>
				<SettingRow
					label={t('settings.instance.registrationInForce')}
					hint={data.effectiveRegistration !== data.config.registration.mode
						? t('settings.instance.theEnvironmentOverridesThe', {
								mode: data.config.registration.mode
							})
						: ''}
				>
					{#snippet control()}
						<span class="text-sm font-medium text-gray-900">{data.effectiveRegistration}</span>
					{/snippet}
				</SettingRow>
			{:else if storage}
				<SettingRow
					label={t('settings.instance.whereTheDataIs')}
					hint={t('settings.instance.tables', { tables: storage.tables })}
				>
					{#snippet control()}
						<code class="tabular text-sm break-all text-gray-900">{storage.path}</code>
					{/snippet}
				</SettingRow>
			{/if}
		</SettingGroup>

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
					timer of their own. This says which of them this box actually has.

					A glyph and a word, never red or green text: the state is said by
					the tick or the warning and by the sentence beside it.
				-->
				<SettingGroup
					title={t('settings.instance.theServicesBesideTheApp')}
					description={t('settings.instance.theAppAnswersRequestsThese')}
				>
					{#each data.companions as row (row.unit)}
						<SettingRow label={t(row.label)} hint={row.detail}>
							{#if row.fix}
								<code class="tabular mt-1 block text-xs break-all text-gray-600">{row.fix}</code>
							{/if}
							{#snippet control()}
								<span
									class="flex items-center gap-1.5 text-sm font-medium text-gray-900"
									title={row.detail}
								>
									<Icon name={row.ok ? 'check' : 'warning'} size={16} />
									{row.ok ? t('settings.instance.running') : t('settings.instance.notRunning')}
								</span>
							{/snippet}
						</SettingRow>
					{/each}
				</SettingGroup>
			{/if}

			<!--
				Read, not edit: a wrong value takes the app off the air, and the way
				back is a text editor and a restart on the box. Blank on the demo,
				where everybody is signed into its one administrator account.
			-->
			<SettingGroup title={t('settings.instance.whereItRuns')}>
				<SettingRow
					label={t('settings.instance.deployment')}
					hint={t('settings.instance.whereTheServerListensSet')}
				>
					{#snippet control()}
						<code class="tabular text-sm break-all text-gray-900">
							{#if data.demo}
								<span class="text-gray-500">{t('settings.instance.hiddenOnTheDemo')}</span>
							{:else}
								{data.config.server.host}:{data.config.server.port}
							{/if}
						</code>
					{/snippet}
				</SettingRow>
				<SettingRow
					label={t('settings.instance.database')}
					hint={t('settings.instance.whereYourDataIsStored')}
				>
					{#snippet control()}
						<code class="tabular text-sm break-all text-gray-900">
							{#if data.demo}
								<span class="text-gray-500">{t('settings.instance.hiddenOnTheDemo')}</span>
							{:else}
								{data.config.database.path}
							{/if}
						</code>
					{/snippet}
				</SettingRow>
			</SettingGroup>

			<SettingGroup
				title={t('settings.instance.whoCanRegister')}
				description={t('settings.instance.anInstanceOnTheOpen')}
			>
				{#if data.effectiveRegistration !== data.config.registration.mode}
					<!--
						The radios show the file; the environment can force something
						else. What is stored and what is in force are two different facts
						and the page shows both.
					-->
					<div class="px-4 py-3">
						<Banner kind="warning">
							<strong>{data.effectiveRegistration}</strong>
							{t('settings.instance.rightNowSetInThe')}
						</Banner>
					</div>
				{/if}
				<form
					id="registration-form"
					method="post"
					action="?/setRegistration"
					use:settingsForm={{ notice: t('settings.instance.registrationSaved') }}
					hidden
				></form>
				<!-- Each choice saves itself: a Save under three radios was a second
				     press for one answer. -->
				{#each REGISTRATION_MODES as mode (mode.key)}
					<label class="block cursor-pointer hover:bg-gray-50">
						<SettingRow label={t(mode.label)} hint={t(mode.hint)}>
							{#snippet control()}
								<input
									type="radio"
									name="mode"
									form="registration-form"
									value={mode.key}
									checked={data.config.registration.mode === mode.key}
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								/>
							{/snippet}
						</SettingRow>
					</label>
				{/each}
			</SettingGroup>

			{#if data.newsletter}
				{@const list = data.newsletter}
				<SettingGroup title={t('settings.instance.theMailingList')}>
					<SettingRow
						label={t('settings.instance.theMailingList')}
						hint={t('settings.instance.peopleWhoAskedToBe')}
					>
						<p class="mt-1 text-sm text-gray-500">
							<span class="font-medium text-gray-900">{list.confirmed}</span>
							{t('settings.instance.confirmed')}{#if list.pending > 0}{t('settings.instance.and')}
								{list.pending}
								{t('settings.instance.whoHaveNotFollowedThe')}{/if}{t(
								'settings.instance.onlyConfirmedAddressesAre'
							)}
						</p>
						{#snippet control()}
							<form method="post" action="?/exportSubscribers" use:enhance={exportList}>
								<button class="btn btn-sm" disabled={list.confirmed === 0}>
									<Icon name="download" />
									{t('settings.instance.export')}
								</button>
							</form>
						{/snippet}
					</SettingRow>
				</SettingGroup>
			{/if}

			<SettingGroup
				title={t('settings.instance.whatAnAccountMayChange')}
				description={t('settings.instance.anAddressIsWhatAn')}
			>
				<SettingRow
					label={t('settings.instance.letPeopleMoveTheirAccount')}
					hint={t('settings.instance.offByDefaultTheChange')}
				>
					{#snippet control()}
						<form
							method="post"
							action="?/setEmailChange"
							use:settingsForm={{ notice: t('settings.language.saved') }}
						>
							<input
								type="checkbox"
								class="toggle"
								name="allowEmailChange"
								value="true"
								checked={data.config.account.allowEmailChange}
								aria-label={t('settings.instance.letPeopleMoveTheirAccount')}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>
						</form>
					{/snippet}
				</SettingRow>
			</SettingGroup>

			<!--
				One action reads both fields, so both carry `form=` to the one form:
				the switch saves itself, and the address is saved by its own button
				beside it.
			-->
			<SettingGroup
				title={t('settings.instance.reportsAndSuggestions')}
				description={t('settings.instance.whenAPageBreaksIn')}
			>
				<form
					id="reports-form"
					method="post"
					action="?/setClientErrors"
					use:settingsForm={{ notice: t('settings.language.saved') }}
					hidden
				></form>
				<SettingRow
					label={t('settings.instance.offerToSendWhatBroke')}
					hint={t('settings.instance.offByDefaultEachPerson')}
				>
					{#snippet control()}
						<input
							type="checkbox"
							class="toggle"
							name="clientErrors"
							value="true"
							form="reports-form"
							checked={data.config.reports.clientErrors}
							aria-label={t('settings.instance.offerToSendWhatBroke')}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						/>
					{/snippet}
				</SettingRow>
				<SettingRow
					label={t('settings.instance.sendReportsAndSuggestionsTo')}
					hint={t('settings.instance.leaveItEmptyAndThey')}
				>
					{#snippet control()}
						<label class="block w-64 max-w-full">
							<span class="sr-only">{t('settings.instance.sendReportsAndSuggestionsTo')}</span>
							<input
								type="email"
								name="feedbackEmail"
								form="reports-form"
								value={data.config.reports.feedbackEmail}
								autocomplete="off"
								class="input input-sm"
								placeholder={t('settings.instance.youExampleCom')}
							/>
						</label>
						<button type="submit" form="reports-form" class="btn btn-sm btn-primary">
							<Icon name="check" />
							{t('ui.save')}
						</button>
					{/snippet}
				</SettingRow>
			</SettingGroup>

			<!--
				Invitations are not only for a closed instance: where the instance
				sells, a code hands over a month of the app at sign-up with no card
				asked for. Where it is closed, the code also lets somebody in.
			-->
			<SettingGroup
				title={t('settings.instance.invitations')}
				description={data.sellsAnything
					? t('settings.instance.aCodeSomebodyTypesWhen')
					: t('settings.instance.aCodeSomebodyTypesWhen2')}
			>
				{#snippet actions()}
					<span class="eyebrow tabular text-gray-600"
						>{t('settings.instance.open', { length: open.length })}</span
					>
					<button type="button" class="btn btn-sm" onclick={() => (inviting = true)}>
						<Icon name="plus" />
						{t('settings.instance.newInvitation')}
					</button>
				{/snippet}
				{#if fresh}
					<!-- Shown once, right after it is made. The link as well as the
					     code: it opens the register form with the code already in it. -->
					<div class="space-y-2 px-4 py-3">
						<Banner kind="success" message={t('settings.instance.handThisOverNow')} />
						<CopyBlock text={fresh} label={t('ui.copy')} />
						<CopyBlock text={inviteLink(fresh)} label={t('settings.instance.copyLink')} />
					</div>
				{/if}
				{#each [...open, ...used] as invite (invite.id)}
					<div class="list-row">
						<div class="list-row-main">
							<p class="text-sm text-gray-900">{invite.note || t('settings.instance.noNote')}</p>
							<p class="text-xs text-gray-500">
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
							</p>
						</div>
						{#if invite.usedAt}
							<span class="eyebrow shrink-0 text-gray-500">{t('settings.instance.used')}</span>
						{:else}
							<form
								method="post"
								action="?/revokeInvite"
								use:enhance={() =>
									async ({ update }) => {
										confirmRevoke = null;
										await update();
									}}
								class="list-row-actions"
							>
								<input type="hidden" name="id" value={invite.id} />
								{#if confirmRevoke === invite.id}
									<button class="btn btn-danger btn-sm" use:armed
										>{t('settings.instance.yesRevoke')}</button
									>
									<button
										type="button"
										onclick={() => (confirmRevoke = null)}
										class="icon-btn"
										title={t('ui.cancel')}
										aria-label={t('ui.cancel')}><Icon name="close" /></button
									>
								{:else}
									<button
										type="button"
										onclick={() => (confirmRevoke = invite.id)}
										class="icon-btn icon-btn-danger"
										title={t('settings.instance.revoke')}
										aria-label={t('settings.instance.revoke')}><Icon name="trash" /></button
									>
								{/if}
							</form>
						{/if}
					</div>
				{:else}
					<EmptyState
						icon="key"
						title={t('settings.instance.noInvitationsYet')}
						description={t('settings.instance.makeOneWhenSomebodyNeeds')}
					/>
				{/each}
			</SettingGroup>
		{/if}
	</RoomSurface>

	{#if !onDevice}
		<Modal
			open={inviting}
			error={form?.message}
			onclose={() => (inviting = false)}
			title={t('settings.instance.newInvitation')}
			size="sm"
		>
			<form
				id="invite-form"
				method="post"
				action="?/createInvite"
				use:enhance={() =>
					async ({ update, result }) => {
						if (result.type === 'success') inviting = false;
						await update({ reset: result.type === 'success' });
					}}
			>
				<FormGrid>
					<Field
						label={t('settings.instance.whoIsItFor')}
						span={12}
						hint={t('settings.instance.forYourOwnMemoryThey')}
					>
						<OneLine
							name="note"
							placeholder={t('settings.instance.myBrother')}
							class="input"
							autofocus
						/>
					</Field>
					<Field
						label={t('settings.instance.codeExpiresIn')}
						span={6}
						hint={t('settings.instance.daysLeaveEmptyForNo')}
					>
						<NumberBox autocomplete="off" name="expiresInDays" min="1" max="365" />
					</Field>
					{#if data.sellsAnything}
						<!-- Two different clocks: how long the code works for, and how long
						     what it hands over lasts. -->
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
			</form>
			{#snippet footer()}
				<button type="button" class="btn" onclick={() => (inviting = false)}
					>{t('ui.cancel')}</button
				>
				<button type="submit" form="invite-form" class="btn btn-primary">
					<Icon name="plus" />
					{t('settings.instance.newInvitation')}
				</button>
			{/snippet}
		</Modal>
	{/if}
</div>
