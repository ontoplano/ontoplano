<script lang="ts">
	import { CHOOSE_PATH, askAgainOnThisPhone, inPhoneApp } from '$lib/instance-choice';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { getAction } from '$lib/shortcuts';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import Banner from '$lib/components/Banner.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { resolve } from '$app/paths';
	import { EMPTY_CONFIRMATION, ERASE_CONFIRMATION } from '$lib/danger';
	import { notify } from '$lib/notify.svelte';
	import { page } from '$app/state';
	import Card from '$lib/components/Card.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

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

	let editing = $state<'email' | 'password' | null>(null);
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
			const res = await fetch(
				resolve('/settings/account/export') + (withPictures ? '' : '?pictures=no'),
				{ signal: giveUp.signal }
			);

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
				exportError = message || 'The export did not come back. Try again in a moment.';
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
				? 'The export is taking too long. Try again, or leave the pictures out.'
				: 'The export did not come back. Check your connection and try again.';
			notify.error(exportError);
		} finally {
			clearTimeout(stop);
			downloading = false;
			// The allowance has changed on the server; say so without a reload.
			await invalidateAll();
		}
	}
	let emptying = $state(false);

	let confirmRevoke = $state<string | null>(null);
	let confirmSignOutAll = $state(false);
	let selected = $state(-1);

	/** Times come from the server as UTC; the browser knows what they mean here. */
	function when(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleString(undefined, {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
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
			selected = Math.min(selected + 1, data.sessions.length - 1);
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
		Everything that needs a server behind it.
		
		An address to sign in with, the password for it, the mail this instance
		sends and the sessions it has opened — a device that is its own instance
		has none of them, and a card about each one saying so would be a page of
		apologies. What is below the fold is the part that is the same either
		way: your data, and the end of it.
	-->
	{#if !onDevice}
		<Card title={t('settings.account.emailAddress')}>
			{#snippet actions()}
				{#if data.emailChangeAllowed}
					<button onclick={() => (editing = 'email')} class="btn btn-sm">
						<Icon name="edit" />
						{t('settings.account.change')}
					</button>
				{/if}
			{/snippet}
			<p class="font-medium text-gray-900">{data.email}</p>
			<p class="mt-1 text-sm text-gray-500">
				{#if data.emailChangeAllowed}
					{t('settings.account.aNewAddressHasTo')}
				{:else}
					{t('settings.account.changingItIsTurnedOff')}
				{/if}
				{#if !data.emailVerified}
					<span class="block">{t('settings.account.thisOneHasNotBeen')}</span>
				{/if}
			</p>
		</Card>

		<Card title={t('settings.account.weeklyReview')}>
			{#snippet actions()}
				<form method="post" action="?/setWeeklyReviewMail" use:enhance>
					<input type="hidden" name="on" value={data.weeklyReviewMail ? 'false' : 'true'} />
					<button type="submit" class="btn btn-sm">
						{data.weeklyReviewMail
							? t('settings.preferences.turnOff')
							: t('settings.preferences.turnOn')}
					</button>
				</form>
			{/snippet}
			<p class="text-sm text-gray-500">
				{#if data.weeklyReviewMail}
					{t('settings.account.oneMessageOnAMonday', { hour: data.weeklyReviewHour })}
				{:else}
					<!-- Off is the default: mail nobody asked for is spam however useful
					     it is. What it would be is said here, not after it arrives. -->
					{t('settings.account.offTurnItOnAnd', { hour: data.weeklyReviewHour })}
				{/if}
				{#if !data.emailConfigured}
					<span class="block">{t('settings.account.thisInstanceHasNoMail')}</span>
				{/if}
			</p>
		</Card>

		<Modal
			open={editing === 'email' && data.emailChangeAllowed}
			error={form?.message}
			onclose={() => (editing = null)}
			title={t('settings.account.changeYourEmailAddress')}
			description="Nothing changes until the link in the confirmation mail is followed."
			size="sm"
		>
			{#if !data.emailConfigured}
				<p class="mb-4 border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
					{t('settings.account.thisServerHasNoMail')}
				</p>
			{/if}
			<form
				id="email-form"
				method="post"
				action="?/changeEmail"
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

		<Card title={t('settings.account.password')}>
			{#snippet actions()}
				<button onclick={() => (editing = 'password')} class="btn btn-sm">
					<Icon name="edit" />
					{t('settings.account.change')}
				</button>
			{/snippet}
			<p class="text-sm text-gray-500">
				{t('settings.account.changingItSignsOutEvery')}
			</p>
		</Card>

		<Modal
			open={editing === 'password'}
			error={form?.message}
			onclose={() => (editing = null)}
			title={t('settings.account.changeYourPassword')}
			description="Every other signed-in device is signed out."
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

		<Card
			title={t('settings.account.whereYouAreSignedIn')}
			description="One line per sign-in. Anything you do not recognise, sign out."
			flush
		>
			{#snippet actions()}
				{#if data.sessions.length > 1 && !confirmSignOutAll}
					<button onclick={() => (confirmSignOutAll = true)} class="btn btn-sm"
						>{t('settings.account.signOutEverywhere')}</button
					>
				{/if}
			{/snippet}

			{#if confirmSignOutAll}
				<form
					method="post"
					action="?/signOutEverywhere"
					use:enhance
					class="mx-4 mt-4 mb-2 flex items-center gap-2 border border-gray-200 bg-gray-50 px-3 py-2"
				>
					<span class="flex-1 text-sm text-gray-700">
						{t('settings.account.thisSignsOutEveryDevice')}
					</span>
					<button
						class="border border-red-200 bg-white px-3 py-1 text-sm text-red-600 hover:bg-red-50"
						use:armed
					>
						{t('settings.account.confirm')}
					</button>
					<button
						type="button"
						onclick={() => (confirmSignOutAll = false)}
						class="text-sm text-gray-500 hover:text-gray-900">{t('ui.cancel')}</button
					>
				</form>
			{/if}

			<div class="divide-y divide-gray-200 border-t border-gray-200" data-tour="account-sessions">
				{#each data.sessions as s, i (s.id)}
					<div class="flex items-center gap-4 px-4 py-3 {selected === i ? 'kbd-cursor' : ''}">
						<div class="min-w-0 flex-1">
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
							{#if confirmRevoke === s.id}
								<form
									method="post"
									action="?/revokeSession"
									use:enhance={() =>
										async ({ update }) => {
											confirmRevoke = null;
											await update();
										}}
									class="flex items-center gap-2"
								>
									<input type="hidden" name="id" value={s.id} />
									<button class="btn btn-danger btn-sm" use:armed
										>{t('settings.account.confirm')}</button
									>
									<button
										type="button"
										onclick={() => (confirmRevoke = null)}
										class="text-xs text-gray-500 hover:text-gray-900">{t('ui.cancel')}</button
									>
								</form>
							{:else}
								<button onclick={() => (confirmRevoke = s.id)} class="btn btn-sm"
									>{t('settings.account.signOut')}</button
								>
							{/if}
						{/if}
					</div>
				{:else}
					<p class="px-4 py-3 text-sm text-gray-500">{t('settings.account.noOtherSessions')}</p>
				{/each}
			</div>
		</Card>
	{/if}

	<!--
		Which ontoplano this app is looking at.
		
		Reachable from every build, not only the one that is its own instance:
		the app on a phone can be pointed at the official instance, at a laptop
		on the same wifi, or at a server somebody runs themselves, and the
		screen that does it has to be findable from inside whichever one it is
		currently showing.
	-->
	<Card
		title={t('settings.account.whereThisOntoplanoLives')}
		description="This app can open the official instance, one you run yourself, or nothing at all — everything on the phone."
	>
		{#snippet actions()}
			<a href={resolve('/instance')} class="btn btn-sm">{t('settings.account.changeInstance')}</a>
		{/snippet}
		<p class="text-sm text-gray-500">
			{t('settings.account.youAreLookingAt')}
			<span class="font-medium text-gray-900">{page.url.origin}</span>.
		</p>
	</Card>

	<Card title={t('settings.account.exportYourData')}>
		{#snippet actions()}
			<!--
				Fetched rather than linked.

				A plain `<a download>` never re-renders the page, so the allowance kept
				saying two left until you reloaded — and there was nothing to stop a
				double-click spending both. This knows exactly when the file has
				arrived: it refreshes the count then, and holds the button for five
				seconds so the second click of a double lands on nothing.
			-->
			<button
				type="button"
				onclick={download}
				disabled={data.exports.remaining <= 0 || downloading || cooling}
				class="btn btn-sm"
				data-tour="account-export"
			>
				<Icon name="download" />
				{downloading ? 'Preparing…' : 'Download'}
			</button>
		{/snippet}
		<p class="text-sm text-gray-500">
			{t('settings.account.everythingThisAccountOwnsAs')}
		</p>

		<!--
			The pictures are most of the weight. Their bytes ride in the JSON as
			base64, so an account with a gallery in it makes a file bigger than a
			small instance will accept back — which is exactly when somebody is
			exporting to move rather than to keep. Leaving them out is a choice on
			the file, not a different feature.
		-->
		<label class="mt-3 flex cursor-pointer items-start gap-2 text-sm">
			<input type="checkbox" bind:checked={withPictures} class="mt-0.5" />
			<span>
				<span class="text-gray-900">{t('settings.account.includePictures')}</span>
				<span class="block text-gray-500">
					{t('settings.account.theyAreMostOfThe')}
				</span>
			</span>
		</label>

		<!--
			Always says where you stand, rather than only warning near the end.

			A limit you only hear about when you hit it feels like a trap; a count
			you can see is just a fact. It also means the number visibly changes the
			moment an export lands, which is the thing that was broken.
		-->
		{#if exportError}
			<p class="mt-2 text-sm text-red-600">{exportError}</p>
		{:else if onDevice}
			<!-- Nothing to ration: this is the device asking itself for a copy of
			     what is already on it. -->
		{:else if data.exports.remaining <= 0}
			<p class="mt-2 text-sm text-red-600">
				{t('settings.account.noExportsLeftToday', {
					allowed: data.exports.allowed,
					unlocksIn: data.exports.unlocksIn ?? ''
				})}
			</p>
		{:else}
			<p class="mt-2 text-sm {data.exports.remaining === 1 ? 'text-amber-700' : 'text-gray-500'}">
				{t('settings.account.exportsLeft', {
					count: data.exports.allowed,
					remaining: data.exports.remaining
				})}
				{#if data.exports.unlocksIn}
					{t('settings.account.theAllowanceResets')} {data.exports.unlocksIn}.
				{/if}
			</p>
		{/if}
	</Card>

	<!--
		Beside the export, because it is the same question the other way round.

		A person deciding whether to move here is asking "can I get my things in,
		and can I get them out again" — and the answer being next to each other is
		worth more than either is alone. The doing is a page of its own: moving in
		happens once, and it had grown into two long forms sitting between the
		sessions list and the delete button.
	-->
	<Card title={t('settings.account.bringThingsIn')}>
		{#snippet actions()}
			<a href={resolve('/settings/account/import')} class="btn btn-sm"
				>{t('settings.account.import')}</a
			>
		{/snippet}
		<p class="text-sm text-gray-500">
			{t('settings.account.aListFromTodoistGoogle')}
		</p>
	</Card>

	{#if data.nativeApp || inPhoneApp()}
		<!--
			The way out of the instance, not out of the account.

			The app is a window onto whichever ontoplano you pointed it at, and
			until now the only way to point it somewhere else was the launcher
			icon's long-press menu — an affordance nobody has ever gone looking
			for. It lands here, beside sign-out, because leaving a server and
			leaving an account are the two things somebody comes to this page to
			do. Only in the app, where there is another instance to go to.

			It goes to the copy of the app on the phone, never to `/instance` on
			the server being left — see `askAgainOnThisPhone`. This used to be
			`ontoplano://instance`, a native screen from before the chooser was a
			page; there is no such scheme registered and the web view answered
			with "unknown url scheme".

			Either signal, because neither covers the other. The cookie is set from
			`?app=android` at launch and is the only thing that sees a Trusted Web
			Activity, which is Chrome and answers every browser question as Chrome
			does. The user agent is what a page still sees once the app has sent it
			to a server — and it is the only one the copy on the device has, since
			that copy sets no cookie. Leaving *it*, to try a server, is the same act
			from the same place. There used to be a second link saying this under
			Sign out, which is where it lived while this one was broken.
		-->
		<Card title={t('settings.account.thisInstance')}>
			{#snippet actions()}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- another origin, not a route -->
				<a href={askAgainOnThisPhone()} class="btn btn-sm">{t('settings.account.switchInstance')}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/snippet}
			<p class="text-sm text-gray-500">
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
		</Card>
	{/if}

	{#if !onDevice}
		<!--
			The phone's only door out. The desktop has Sign out in the header menu;
			the bottom bar carries no menu, so this page — where the account's other
			session controls already live — is where a finger finds it.
		-->
		<Card title={t('settings.account.signOut')}>
			{#snippet actions()}
				<form method="post" action="/login?/signOut" use:enhance>
					<button type="submit" class="btn btn-sm">{t('settings.account.signOut')}</button>
				</form>
			{/snippet}
			<p class="text-sm text-gray-500">{t('settings.account.thisDeviceOnlyTheSessions')}</p>
		</Card>
	{/if}

	<!--
		The two irreversible things, together, at the bottom, on red.

		Apart they were two ordinary cards in a column of ordinary cards, and the
		one that ends the account looked like the one that changes the theme.
		Together and last, under a heading that says what the section is, they
		read as the part of the page you have to mean.
	-->
	<section class="danger-zone">
		<h2 class="danger-zone-title">{t('settings.account.dangerZone')}</h2>

		<!--
			Two of these on a server, one on a device.

			Emptying an account and ending it differ by the address you sign in
			with afterwards, and a device has none: what follows the hard one
			here is the screen that chooses where your ontoplano lives, where
			making a new empty one is a press away. So the soft one would reach
			the same state by a longer road, and offering both would be offering
			a choice that is not one.
		-->
		{#if !onDevice}
			<div class="danger-zone-row">
				<div class="min-w-0">
					<h3 class="text-sm font-semibold text-red-700">
						{t('settings.account.deleteEverythingInThisAccount')}
					</h3>
					<p class="mt-1 max-w-2xl text-sm text-gray-600">
						{t('settings.account.everyTaskNoteHabitGoal')}
					</p>
				</div>
				<button onclick={() => (emptying = true)} class="btn btn-danger btn-sm shrink-0">
					<Icon name="trash" />
					{t('settings.account.deleteEverything')}
				</button>
			</div>
		{/if}

		<div class="danger-zone-row">
			<div class="min-w-0">
				<h3 class="text-sm font-semibold text-red-700">
					{onDevice ? t('settings.account.deleteThisInstance') : t('admin.id.deleteThisAccount')}
				</h3>
				<p class="mt-1 max-w-2xl text-sm text-gray-600">
					{onDevice
						? t('settings.account.everythingOnThisDeviceAnd')
						: t('settings.account.theDataAndTheAccount')}
				</p>
			</div>
			<button onclick={() => (confirming = true)} class="btn btn-danger btn-sm shrink-0">
				<Icon name="trash" />
				{onDevice ? t('settings.account.deleteInstance') : t('settings.account.deleteAccount')}
			</button>
		</div>
	</section>

	<Modal
		open={emptying}
		error={form?.success ? undefined : form?.message}
		onclose={() => (emptying = false)}
		title={t('settings.account.deleteEverythingInThisAccount')}
		description="Every row you have made goes. The account itself stays. This cannot be undone."
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
				<Field label={`Type “${EMPTY_CONFIRMATION}” to confirm`} span={12} required>
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
		description="Every row belonging to you goes with it. This cannot be undone."
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
						? `Type “${ERASE_CONFIRMATION}” to confirm`
						: `Type “${data.email}” to confirm`}
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
