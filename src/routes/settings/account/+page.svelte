<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { momentOf } from '$lib/when';
	import { page } from '$app/state';
	import { useWhen } from '$lib/when-context.svelte';
	import { CHOOSE_PATH, askAgainOnThisPhone, inPhoneApp } from '$lib/instance-choice';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { getAction } from '$lib/shortcuts';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$lib/enhance';
	import Banner from '$lib/components/Banner.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { listCursor } from '$lib/actions/list-cursor';
	import { resolve } from '$app/paths';
	import { EMPTY_CONFIRMATION, ERASE_CONFIRMATION } from '$lib/danger';
	import { notify } from '$lib/notify.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import SettingGroup from '$lib/components/SettingGroup.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { MAX_DISPLAY_NAME_LENGTH } from '$lib/display-name';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/**
	 * Whether this instance is the device it is running on.
	 *
	 * Then most of this page is about something that does not exist: there is
	 * no address to sign in with, no password, no sessions it opened, and no
	 * mail. What is left is what somebody comes to an account page for when
	 * something has gone wrong — the data out, the data in, and the end of it.
	 * One flag rather than a test per absent thing, so a card added later shows
	 * here until somebody decides it should not.
	 */
	const onDevice = $derived('onDevice' in data && data.onDevice === true);

	/**
	 * What happens after the delete on a device: the file, then the way out.
	 *
	 * The action deleted the rows, and it ran inside the worker that owns the
	 * database — so it could not also throw that database away, which is the
	 * other half of unmaking an instance that is a phone. This asks the worker
	 * to empty its own storage and then leaves for the screen that chooses
	 * where your ontoplano lives, where making a new one is a press away.
	 *
	 * On a server this is the ordinary enhance: the action redirects and there
	 * is nothing else to do.
	 */
	const deleting: SubmitFunction =
		() =>
		async ({ result, update }) => {
			const gone =
				onDevice && result.type === 'failure' && (result.data as { gone?: boolean })?.gone === true;
			if (!gone) return update();

			const { ask } = await import('$lib/isolated/client');
			await ask('db.destroy');
			location.href = CHOOSE_PATH;
		};

	let editing = $state<'name' | 'email' | 'password' | null>(null);
	let confirming = $state(false);

	let downloading = $state(false);
	/** Held after a successful export, so a double-click cannot spend two. */
	let cooling = $state(false);
	let exportError: string | null = $state(null);

	/**
	 * How long an export may take before the button stops waiting for it.
	 *
	 * Two minutes: an account with a full gallery is tens of megabytes to
	 * gather, serialise and send, and cutting a good export off is worse than
	 * waiting. This is not a performance budget — it is the guarantee that the
	 * button always comes back.
	 */
	const EXPORT_LIMIT_MS = 120_000;

	const COOLDOWN_MS = 5000;

	/** Whether the file should carry the picture bytes. On, for a backup. */
	let withPictures = $state(true);

	async function download() {
		if (downloading || cooling) return;

		downloading = true;
		exportError = null;

		/*
		 * And a limit on the waiting, so the button cannot stick.
		 *
		 * "Preparing…" with nothing behind it is the worst of the three things
		 * this can do — worse than a refusal and worse than a failure — because
		 * it is the only one that never ends. An export of a large account is
		 * slow enough that a short limit would cut off a good one, so this is
		 * generous; what matters is that there is one.
		 */
		const giveUp = new AbortController();
		let gaveUp = false;
		const stop = setTimeout(() => {
			gaveUp = true;
			giveUp.abort();
		}, EXPORT_LIMIT_MS);

		try {
			// Names this press, so a request the browser repeats is charged once.
			// Not `randomUUID`: that needs a secure context, and a self-hosted
			// instance may be served over plain http.
			const once = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
				b.toString(16).padStart(2, '0')
			).join('');
			const query = `once=${once}${withPictures ? '' : '&pictures=no'}`;
			const res = await fetch(`${resolve('/settings/account/export')}?${query}`, {
				signal: giveUp.signal
			});

			if (!res.ok) {
				/*
				 * A refusal arrives as plain text, not as JSON.
				 *
				 * `$lib/server/refuse` answers an enhanced form with an action
				 * envelope and everything else — this fetch included — with the
				 * sentence as text. Reading only JSON threw that away and showed
				 * the generic "did not come back", which is a sentence about the
				 * network for something the server said on purpose.
				 */
				const said = (await res.text().catch(() => '')).trim();
				let message = said;
				try {
					message = JSON.parse(said)?.message ?? said;
				} catch {
					// It was the sentence itself.
				}
				exportError = message || t('settings.account.exportDidNotComeBack');
				notify.error(exportError);
				return;
			}

			// A blob rather than a navigation, so we know when it actually arrived.
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `ontoplano-export-${new Date().toISOString().slice(0, 10)}${withPictures ? '' : '-no-pictures'}.json`;
			link.click();
			URL.revokeObjectURL(url);

			cooling = true;
			setTimeout(() => (cooling = false), COOLDOWN_MS);
		} catch {
			exportError = gaveUp
				? t('settings.account.exportTakingTooLong')
				: t('settings.account.exportCheckConnection');
			notify.error(exportError);
		} finally {
			clearTimeout(stop);
			downloading = false;
			// The allowance has changed on the server; say so without a reload.
			await invalidateAll();
		}
	}
	let emptying = $state(false);
	/** The danger zone, closed until it is opened. */
	let dangerOpen = $state(false);

	let confirmRevoke = $state<string | null>(null);
	let confirmSignOutAll = $state(false);
	let selected = $state(-1);

	/**
	 * This device first, then the rest newest first, and only the first few
	 * until asked: a browser that signs in on every visit leaves dozens of
	 * lines, and the page was a screen of them between the password and the
	 * export.
	 */
	const SESSIONS_SHOWN = 5;
	let allSessions = $state(false);
	const sortedSessions = $derived(
		[...data.sessions].sort((a, b) => Number(b.current) - Number(a.current))
	);
	const shownSessions = $derived(
		allSessions ? sortedSessions : sortedSessions.slice(0, SESSIONS_SHOWN)
	);

	/** Times come from the server as UTC; the browser knows what they mean here. */
	function when(iso: string): string {
		const d = new Date(iso);
		return momentOf(d, now(), { year: undefined });
	}

	const notice = $derived(form?.success ? form.message : null);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		) {
			if (e.key !== 'Escape') return;
		}

		if (e.key === 'Escape') {
			editing = null;
			confirming = false;
			confirmRevoke = null;
			confirmSignOutAll = false;
			return;
		}

		if (editing || confirming) return;

		const action = getAction('/settings/account', e.key);
		if (action === 'navigate-down') {
			e.preventDefault();
			selected = Math.min(selected + 1, shownSessions.length - 1);
		}
		if (action === 'navigate-up') {
			e.preventDefault();
			selected = Math.max(selected - 1, 0);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<FormError message={form?.message} />
	{#if notice}
		<Banner kind="success" message={notice} />
	{/if}

	<!--
		The installed app being behind the instance, said here too.

		The band at the top of the shell can be put away for the session, which
		is right — somebody mid-sentence should be able to get rid of it. This
		is the page they come to when they go looking, so it says the same thing
		without a way to dismiss it: they arrived on purpose.
	-->
	{#if page.data.appUpdate}
		<Banner
			kind="warning"
			message="{t('home.updateTheApp')}{t('home.itIsAndThisInstance', {
				app: page.data.appUpdate.app,
				instance: page.data.appUpdate.instance
			})}"
		/>
	{/if}

	<!--
		One surface, a subject per band, a setting per row.

		This was a card per sentence — eight headers, eight bodies of one line,
		and a white gap between each — so the page was three screens tall for
		what is a dozen answers. See `SettingGroup` and `SettingRow`.
	-->
	<RoomSurface>
		<!--
			Everything that needs a server behind it.

			An address to sign in with, the password for it, the mail this instance
			sends and the sessions it has opened — a device that is its own instance
			has none of them, and a row about each one saying so would be a page of
			apologies. What is below is the part that is the same either way: your
			data, and the end of it.
		-->
		<!-- The name the app calls you by: on a device as much as on a server. -->
		<SettingGroup title={t('settings.account.profile')}>
			<SettingRow
				label={t('settings.account.displayName')}
				hint={t('settings.account.displayNameHint')}
			>
				<p class="mt-1 text-sm font-medium break-all text-gray-900">{page.data.user?.name}</p>
				{#snippet control()}
					<button onclick={() => (editing = 'name')} class="btn btn-sm">
						<Icon name="edit" />
						{t('settings.account.change')}
					</button>
				{/snippet}
			</SettingRow>
		</SettingGroup>

		{#if !onDevice}
			<SettingGroup title={t('settings.account.signingIn')}>
				<SettingRow
					label={t('settings.account.emailAddress')}
					hint={data.emailChangeAllowed
						? t('settings.account.aNewAddressHasTo')
						: t('settings.account.changingItIsTurnedOff')}
				>
					<p class="mt-1 text-sm font-medium break-all text-gray-900">{data.email}</p>
					{#if !data.emailVerified}
						<p class="mt-0.5 text-sm text-gray-500">{t('settings.account.thisOneHasNotBeen')}</p>
					{/if}
					{#snippet control()}
						{#if data.emailChangeAllowed}
							<button onclick={() => (editing = 'email')} class="btn btn-sm">
								<Icon name="edit" />
								{t('settings.account.change')}
							</button>
						{/if}
					{/snippet}
				</SettingRow>
				<SettingRow
					label={t('settings.account.password')}
					hint={t('settings.account.changingItSignsOutEvery')}
				>
					{#snippet control()}
						<button onclick={() => (editing = 'password')} class="btn btn-sm">
							<Icon name="edit" />
							{t('settings.account.change')}
						</button>
					{/snippet}
				</SettingRow>
				<!--
					The phone's only door out. The desktop has Sign out in the header
					menu; the bottom bar carries no menu, so this page — where the
					account's other session controls already live — is where a finger
					finds it.
				-->
				<SettingRow
					label={t('settings.account.signOut')}
					hint={t('settings.account.thisDeviceOnlyTheSessions')}
				>
					{#snippet control()}
						<form method="post" action="/login?/signOut" use:enhance>
							<button type="submit" class="btn btn-sm">
								<Icon name="sign-out" />
								{t('settings.account.signOut')}
							</button>
						</form>
					{/snippet}
				</SettingRow>
			</SettingGroup>

			<SettingGroup title={t('settings.account.mail')}>
				<!-- A switch, like every other on/off in settings: a button that said
				     "Turn on" and then "Turn off" changed its own width under the
				     finger and read as an action rather than a state. -->
				<SettingRow
					label={t('settings.account.weeklyReview')}
					hint={data.weeklyReviewMail
						? t('settings.account.oneMessageOnAMonday', { hour: data.weeklyReviewHour })
						: t('settings.account.offTurnItOnAnd', { hour: data.weeklyReviewHour })}
				>
					{#if !data.emailConfigured}
						<p class="mt-0.5 text-sm text-gray-500">
							{t('settings.account.thisInstanceHasNoMail')}
						</p>
					{/if}
					{#snippet control()}
						<form method="post" action="?/setWeeklyReviewMail" use:enhance>
							<input type="hidden" name="on" value={data.weeklyReviewMail ? 'false' : 'true'} />
							<input
								type="checkbox"
								class="toggle"
								checked={data.weeklyReviewMail}
								aria-label={t('settings.account.weeklyReview')}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>
						</form>
					{/snippet}
				</SettingRow>
			</SettingGroup>

			<SettingGroup
				title={t('settings.account.whereYouAreSignedIn')}
				description={t('settings.account.oneLinePerSignInAnything')}
				dataTour="account-sessions"
			>
				{#each shownSessions as s, i (s.id)}
					<div class="list-row" data-row use:listCursor={selected === i}>
						<span class="row-rail text-gray-500"><Icon name="key" size={16} /></span>
						<div class="list-row-main">
							<p class="text-sm font-medium text-gray-900">
								{s.device}
								{#if s.current}
									<span class="eyebrow ml-2 text-gray-500">{t('settings.account.thisDevice')}</span>
								{/if}
							</p>
							<p class="tabular text-xs text-gray-500">
								{t('settings.account.lastSeen')}
								{when(s.lastSeen)}
								{t('settings.account.middotSignedIn')}
								{when(s.createdAt)}
								{#if s.ipAddress}&middot; {s.ipAddress}{/if}
							</p>
						</div>
						{#if !s.current}
							<form
								method="post"
								action="?/revokeSession"
								use:enhance={() =>
									async ({ update }) => {
										confirmRevoke = null;
										await update();
									}}
								class="list-row-actions"
							>
								<input type="hidden" name="id" value={s.id} />
								{#if confirmRevoke === s.id}
									<button class="btn btn-danger btn-sm" use:armed
										>{t('settings.account.confirm')}</button
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
										onclick={() => (confirmRevoke = s.id)}
										class="icon-btn icon-btn-danger"
										title={t('settings.account.signOut')}
										aria-label={t('settings.account.signOut')}><Icon name="sign-out" /></button
									>
								{/if}
							</form>
						{/if}
					</div>
				{:else}
					<EmptyState compact icon="check" title={t('settings.account.noOtherSessions')} />
				{/each}
				{#if sortedSessions.length > SESSIONS_SHOWN}
					<div class="px-4 py-2">
						<button
							type="button"
							class="btn btn-sm"
							aria-expanded={allSessions}
							onclick={() => (allSessions = !allSessions)}
						>
							<Icon name={allSessions ? 'chevron-up' : 'chevron-down'} />
							{t('settings.account.allSessions', { count: sortedSessions.length })}
						</button>
					</div>
				{/if}
				{#if data.sessions.length > 1}
					<!-- A verb about every row, on a row of its own under them. Both
					     states in one cell, so arming the confirmation moves nothing. -->
					<SettingRow
						label={t('settings.account.signOutEverywhere')}
						hint={t('settings.account.thisSignsOutEveryDevice')}
					>
						{#snippet control()}
							<form
								method="post"
								action="?/signOutEverywhere"
								use:enhance={() =>
									async ({ update }) => {
										confirmSignOutAll = false;
										await update();
									}}
								class="grid"
							>
								<button
									type="button"
									onclick={() => (confirmSignOutAll = true)}
									class="btn btn-sm col-start-1 row-start-1"
									class:invisible={confirmSignOutAll}
									><Icon name="sign-out" />{t('settings.account.signOutEverywhere')}</button
								>
								<span
									class="col-start-1 row-start-1 flex items-center justify-end gap-1"
									class:invisible={!confirmSignOutAll}
								>
									{#if confirmSignOutAll}
										<button type="submit" class="btn btn-danger btn-sm" use:armed
											>{t('settings.account.confirm')}</button
										>
										<button
											type="button"
											onclick={() => (confirmSignOutAll = false)}
											class="icon-btn"
											title={t('ui.cancel')}
											aria-label={t('ui.cancel')}><Icon name="close" /></button
										>
									{/if}
								</span>
							</form>
						{/snippet}
					</SettingRow>
				{/if}
			</SettingGroup>
		{/if}

		<SettingGroup title={t('settings.account.yourData')}>
			<SettingRow
				label={t('settings.account.exportYourData')}
				hint={t('settings.account.everythingThisAccountOwnsAs')}
				dataTour="account-export"
			>
				<!--
					The pictures are most of the weight. Their bytes ride in the JSON as
					base64, so an account with a gallery in it makes a file bigger than a
					small instance will accept back — which is exactly when somebody is
					exporting to move rather than to keep. Leaving them out is a choice on
					the file, not a different feature.
				-->
				<label class="mt-2 flex cursor-pointer items-start gap-2 text-sm">
					<input type="checkbox" bind:checked={withPictures} class="mt-0.5" />
					<span>
						<span class="text-gray-900">{t('settings.account.includePictures')}</span>
						<span class="block text-gray-500">{t('settings.account.theyAreMostOfThe')}</span>
					</span>
				</label>
				<!--
					Always says where you stand, rather than only warning near the end.
					A limit you only hear about when you hit it feels like a trap; a
					count you can see is just a fact. Never red or amber: small coloured
					text is the one place colour cannot carry meaning here.
				-->
				{#if exportError}
					<p class="mt-2 flex items-center gap-1.5 text-sm text-gray-900">
						<Icon name="warning" size={14} />{exportError}
					</p>
				{:else if onDevice}
					<!-- Nothing to ration: this is the device asking itself for a copy of
					     what is already on it. -->
				{:else if data.exports.remaining <= 0}
					<p class="mt-2 flex items-center gap-1.5 text-sm text-gray-900">
						<Icon name="warning" size={14} />{t('settings.account.noExportsLeftToday', {
							allowed: data.exports.allowed,
							unlocksIn: data.exports.unlocksIn ?? ''
						})}
					</p>
				{:else}
					<p
						class="mt-2 text-sm {data.exports.remaining === 1
							? 'font-medium text-gray-900'
							: 'text-gray-500'}"
					>
						{t('settings.account.exportsLeft', {
							count: data.exports.allowed,
							remaining: data.exports.remaining
						})}
						{#if data.exports.unlocksIn}
							{t('settings.account.theAllowanceResets')} {data.exports.unlocksIn}.
						{/if}
					</p>
				{/if}
				{#snippet control()}
					<!--
						Fetched rather than linked.

						A plain `<a download>` never re-renders the page, so the allowance
						kept saying two left until you reloaded — and there was nothing to
						stop a double-click spending both. This knows exactly when the file
						has arrived: it refreshes the count then, and holds the button for
						five seconds so the second click of a double lands on nothing.

						Both words in one cell, so the button is the width of the longer
						and does not change size while it works.
					-->
					<button
						type="button"
						onclick={download}
						disabled={data.exports.remaining <= 0 || downloading || cooling}
						class="btn btn-sm"
					>
						<Icon name="download" />
						<span class="grid">
							<span class="col-start-1 row-start-1" class:invisible={downloading}
								>{t('settings.account.download')}</span
							>
							<span class="col-start-1 row-start-1" class:invisible={!downloading}
								>{t('settings.account.preparing')}</span
							>
						</span>
					</button>
				{/snippet}
			</SettingRow>
			<!--
				Beside the export, because it is the same question the other way
				round: "can I get my things in, and can I get them out again". The
				doing is a page of its own — moving in happens once.
			-->
			<SettingRow
				label={t('settings.account.bringThingsIn')}
				hint={t('settings.account.aListFromTodoistGoogle')}
			>
				{#snippet control()}
					<a href={resolve('/settings/account/import')} class="btn btn-sm">
						<Icon name="arrow-right" />
						{t('settings.account.import')}
					</a>
				{/snippet}
			</SettingRow>
			<!--
				The way out of the instance, not out of the account.

				In the app it goes to the copy of the app on the phone, never to
				`/instance` on the server being left — see `askAgainOnThisPhone`.
				Either signal, because neither covers the other: the cookie is set
				from `?app=android` at launch and is the only thing that sees a
				Trusted Web Activity; the user agent is what a page still sees once
				the app has sent it to a server. A browser has no copy of the app to
				hand back to, so it goes to the chooser on this instance instead.
			-->
			<SettingRow label={t('settings.account.thisInstance')}>
				<p class="mt-0.5 text-sm text-gray-500">
					{#if onDevice}
						{t('settings.account.thisAppIsOpenOn')}
						<strong class="text-gray-700">{t('settings.account.itsOwnCopyOnThis')}</strong>{t(
							'settings.account.switchingPointsItAt'
						)}
					{:else}
						{t('settings.account.thisAppIsOpenOn')}
						<strong class="text-gray-700">{data.host}</strong>{t(
							'settings.account.switchingPointsItAt2'
						)}
					{/if}
				</p>
				{#snippet control()}
					{#if data.nativeApp || inPhoneApp()}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- another origin, not a route -->
						<a href={askAgainOnThisPhone()} class="btn btn-sm"
							><Icon name="server" />{t('settings.account.switchInstance')}</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{:else}
						<a href={resolve('/instance')} class="btn btn-sm"
							><Icon name="server" />{t('settings.account.switchInstance')}</a
						>
					{/if}
				{/snippet}
			</SettingRow>
		</SettingGroup>

		<!--
			The irreversible things, last, and closed until somebody opens them:
			a person who came to change their password should not have to look at
			two Delete buttons. The same band as every other subject — the words
			say danger, and each button is the danger button.
		-->
		<SettingGroup id="danger-zone" title={t('settings.account.dangerZone')}>
			{#snippet actions()}
				<button
					type="button"
					class="icon-btn icon-btn-sm"
					aria-expanded={dangerOpen}
					title={t('settings.account.dangerZone')}
					aria-label={t('settings.account.dangerZone')}
					onclick={() => (dangerOpen = !dangerOpen)}
				>
					<Icon name={dangerOpen ? 'chevron-up' : 'chevron-down'} />
				</button>
			{/snippet}
			{#if dangerOpen}
				<!--
					Two on a server, one on a device: emptying an account and ending it
					differ by the address you sign in with afterwards, and a device has
					none, so there the soft one would be a longer road to the same place.
				-->
				{#if !onDevice}
					<SettingRow
						label={t('settings.account.deleteEverythingInThisAccount')}
						hint={t('settings.account.everyTaskNoteHabitGoal')}
					>
						{#snippet control()}
							<button onclick={() => (emptying = true)} class="btn btn-danger btn-sm">
								<Icon name="trash" />
								{t('settings.account.deleteEverything')}
							</button>
						{/snippet}
					</SettingRow>
				{/if}
				<SettingRow
					label={onDevice
						? t('settings.account.deleteThisInstance')
						: t('admin.id.deleteThisAccount')}
					hint={onDevice
						? t('settings.account.everythingOnThisDeviceAnd')
						: t('settings.account.theDataAndTheAccount')}
				>
					{#snippet control()}
						<button onclick={() => (confirming = true)} class="btn btn-danger btn-sm">
							<Icon name="trash" />
							{onDevice
								? t('settings.account.deleteInstance')
								: t('settings.account.deleteAccount')}
						</button>
					{/snippet}
				</SettingRow>
			{/if}
		</SettingGroup>
	</RoomSurface>

	<Modal
		open={editing === 'name'}
		error={form?.message}
		onclose={() => (editing = null)}
		title={t('settings.account.changeYourName')}
		size="sm"
	>
		<form
			id="name-form"
			method="post"
			action="?/rename"
			use:enhance={() =>
				async ({ update, result }) => {
					await update();
					if (result.type === 'success') editing = null;
				}}
		>
			<FormGrid>
				<Field label={t('settings.account.displayName')} span={12} required>
					<OneLine
						name="name"
						value={page.data.user?.name ?? ''}
						required
						autofocus
						maxlength={MAX_DISPLAY_NAME_LENGTH}
					/>
				</Field>
			</FormGrid>
		</form>
		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (editing = null)}>{t('ui.cancel')}</button>
			<button type="submit" form="name-form" class="btn btn-primary">{t('ui.save')}</button>
		{/snippet}
	</Modal>

	{#if !onDevice}
		<Modal
			open={editing === 'email' && data.emailChangeAllowed}
			error={form?.message}
			onclose={() => (editing = null)}
			title={t('settings.account.changeYourEmailAddress')}
			description={t('settings.account.nothingChangesUntilTheLink')}
			size="sm"
		>
			{#if !data.emailConfigured}
				<Banner kind="info" message={t('settings.account.thisServerHasNoMail')} />
			{/if}
			<form
				id="email-form"
				method="post"
				action="?/changeEmail"
				class="mt-4"
				use:enhance={() =>
					async ({ update, result }) => {
						if (result.type === 'success') editing = null;
						await update({ reset: result.type === 'success' });
					}}
			>
				<FormGrid>
					<Field label={t('settings.account.newAddress')} span={12} required>
						<input name="newEmail" type="email" required autocomplete="email" class="input" />
					</Field>
					<Field label={t('settings.account.yourPassword')} span={12} required>
						<input
							name="password"
							type="password"
							required
							autocomplete="current-password"
							class="input"
						/>
					</Field>
				</FormGrid>
			</form>
			{#snippet footer()}
				<button type="button" class="btn" onclick={() => (editing = null)}>{t('ui.cancel')}</button>
				<button type="submit" form="email-form" class="btn btn-primary"
					>{t('settings.account.sendConfirmation')}</button
				>
			{/snippet}
		</Modal>

		<Modal
			open={editing === 'password'}
			error={form?.message}
			onclose={() => (editing = null)}
			title={t('settings.account.changeYourPassword')}
			description={t('settings.account.everyOtherSignedInDeviceIs')}
			size="sm"
		>
			<form
				id="password-form"
				method="post"
				action="?/changePassword"
				use:enhance={() =>
					async ({ update, result }) => {
						if (result.type === 'success') editing = null;
						await update({ reset: result.type === 'success' });
					}}
			>
				<FormGrid>
					<Field label={t('settings.account.currentPassword')} span={12} required>
						<input
							name="currentPassword"
							type="password"
							required
							autocomplete="current-password"
							class="input"
						/>
					</Field>
					<Field label={t('settings.account.newPassword')} span={12} required>
						<input
							name="newPassword"
							type="password"
							required
							minlength="8"
							autocomplete="new-password"
							class="input"
						/>
					</Field>
					<Field label={t('settings.account.newPasswordAgain')} span={12} required>
						<input
							name="confirmPassword"
							type="password"
							required
							minlength="8"
							autocomplete="new-password"
							class="input"
						/>
					</Field>
				</FormGrid>
			</form>

			{#snippet footer()}
				<button type="button" class="btn" onclick={() => (editing = null)}>{t('ui.cancel')}</button>
				<button type="submit" form="password-form" class="btn btn-primary"
					>{t('settings.account.changePassword')}</button
				>
			{/snippet}
		</Modal>
	{/if}

	<Modal
		open={emptying}
		error={form?.success ? undefined : form?.message}
		onclose={() => (emptying = false)}
		title={t('settings.account.deleteEverythingInThisAccount')}
		description={t('settings.account.everyRowYouHaveMade')}
		size="sm"
	>
		<!--
			The sheet closes when it worked and stays open when it did not: a wrong
			password is answered in front of the person who typed it.
		-->
		<form
			id="empty-form"
			method="post"
			action="?/empty"
			use:enhance={() =>
				async ({ update, result }) => {
					if (result.type === 'success') emptying = false;
					await update({ reset: result.type === 'success' });
				}}
		>
			<FormGrid>
				<Field
					label={t('settings.account.import.typeWordToConfirm', {
						word: `“${EMPTY_CONFIRMATION}”`
					})}
					span={12}
					required
				>
					<input name="confirm" autocomplete="off" required class="input" />
				</Field>
				<Field label={t('settings.account.yourPassword')} span={12} required>
					<input
						name="password"
						type="password"
						autocomplete="current-password"
						required
						class="input"
					/>
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (emptying = false)}>{t('ui.cancel')}</button>
			<button type="submit" form="empty-form" class="btn btn-danger"
				>{t('settings.account.deleteEverything')}</button
			>
		{/snippet}
	</Modal>

	<Modal
		open={confirming}
		error={form?.message}
		onclose={() => (confirming = false)}
		title={onDevice
			? t('settings.account.deleteThisInstance')
			: t('settings.account.deleteYourAccount')}
		description={t('settings.account.everyRowBelongingToYou')}
		size="sm"
	>
		<form id="delete-form" method="post" action="?/delete" use:enhance={deleting}>
			<FormGrid>
				<!--
					A device has no address to type back and no password to give.
					The word stands for both: it is the same thing the other
					dialog asks for, and it is the only proof available here that
					somebody meant it.
				-->
				<Field
					label={onDevice
						? t('settings.account.import.typeWordToConfirm', { word: `“${ERASE_CONFIRMATION}”` })
						: t('settings.account.import.typeWordToConfirm', { word: `“${data.email}”` })}
					span={12}
					required
				>
					<input name={onDevice ? 'confirm' : 'email'} autocomplete="off" required class="input" />
				</Field>
				{#if !onDevice}
					<Field label={t('settings.account.yourPassword')} span={12} required>
						<input
							name="password"
							type="password"
							autocomplete="current-password"
							required
							class="input"
						/>
					</Field>
				{/if}
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (confirming = false)}
				>{t('ui.cancel')}</button
			>
			<button type="submit" form="delete-form" class="btn btn-danger"
				>{t('settings.account.deletePermanently')}</button
			>
		{/snippet}
	</Modal>
</div>
