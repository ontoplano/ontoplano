<script lang="ts">
	import { askAgainOnThisPhone, inPhoneApp } from '$lib/instance-choice';
	import { getAction } from '$lib/shortcuts';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import Banner from '$lib/components/Banner.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import { resolve } from '$app/paths';
	import { notify } from '$lib/notify.svelte';
	import { page } from '$app/state';
	import Card from '$lib/components/Card.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

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

	<Card title="Email address">
		{#snippet actions()}
			{#if data.emailChangeAllowed}
				<button onclick={() => (editing = 'email')} class="btn btn-sm">
					<Icon name="edit" /> Change
				</button>
			{/if}
		{/snippet}
		<p class="text-sm text-gray-500">
			You sign in with <span class="font-medium text-gray-900">{data.email}</span>.
			{#if data.emailChangeAllowed}
				A new address has to be confirmed by a link before it takes over.
			{:else}
				<!-- Says who to ask, rather than pretending the option is missing
				     because nobody thought of it. -->
				Changing it is turned off on this instance; whoever runs it can allow it.
			{/if}
			{#if !data.emailVerified}
				<span class="block">This one has not been confirmed yet.</span>
			{/if}
		</p>
	</Card>

	<Card title="Weekly review">
		{#snippet actions()}
			<form method="post" action="?/setWeeklyReviewMail" use:enhance>
				<input type="hidden" name="on" value={data.weeklyReviewMail ? 'false' : 'true'} />
				<button type="submit" class="btn btn-sm">
					{data.weeklyReviewMail ? 'Turn off' : 'Turn on'}
				</button>
			</form>
		{/snippet}
		<p class="text-sm text-gray-500">
			{#if data.weeklyReviewMail}
				One message on a Monday at {data.weeklyReviewHour} with what last week was — planned against done,
				and what is still loose. Nothing is sent about a week you did not plan, and every message has
				a link that stops them.
			{:else}
				<!-- Off is the default: mail nobody asked for is spam however useful
				     it is. What it would be is said here, not after it arrives. -->
				Off. Turn it on and you get one message on a Monday at {data.weeklyReviewHour} with what last
				week was — planned against done, and what is still loose.
			{/if}
			{#if !data.emailConfigured}
				<span class="block"
					>This instance has no mail transport, so nothing is sent either way.</span
				>
			{/if}
		</p>
	</Card>

	<Modal
		open={editing === 'email' && data.emailChangeAllowed}
		error={form?.message}
		onclose={() => (editing = null)}
		title="Change your email address"
		description="Nothing changes until the link in the confirmation mail is followed."
		size="sm"
	>
		{#if !data.emailConfigured}
			<p class="mb-4 border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
				This server has no mail configured, so the confirmation link is written to its log.
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
				<Field label="New address" span={12} required>
					<input name="newEmail" type="email" required autocomplete="email" class="input" />
				</Field>
				<Field label="Your password" span={12} required>
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
			<button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
			<button type="submit" form="email-form" class="btn btn-primary">Send confirmation</button>
		{/snippet}
	</Modal>

	<Card title="Password">
		{#snippet actions()}
			<button onclick={() => (editing = 'password')} class="btn btn-sm">
				<Icon name="edit" /> Change
			</button>
		{/snippet}
		<p class="text-sm text-gray-500">
			Changing it signs out every other device you are logged in on.
		</p>
	</Card>

	<Modal
		open={editing === 'password'}
		error={form?.message}
		onclose={() => (editing = null)}
		title="Change your password"
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
				<Field label="Current password" span={12} required>
					<input
						name="currentPassword"
						type="password"
						required
						autocomplete="current-password"
						class="input"
					/>
				</Field>
				<Field label="New password" span={12} required>
					<input
						name="newPassword"
						type="password"
						required
						minlength="8"
						autocomplete="new-password"
						class="input"
					/>
				</Field>
				<Field label="New password again" span={12} required>
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
			<button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
			<button type="submit" form="password-form" class="btn btn-primary">Change password</button>
		{/snippet}
	</Modal>

	<Card
		title="Where you are signed in"
		description="One line per sign-in. Anything you do not recognise, sign out."
		flush
	>
		{#snippet actions()}
			{#if data.sessions.length > 1 && !confirmSignOutAll}
				<button onclick={() => (confirmSignOutAll = true)} class="btn btn-sm"
					>Sign out everywhere</button
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
					This signs out every device, including this one.
				</span>
				<button
					class="border border-red-200 bg-white px-3 py-1 text-sm text-red-600 hover:bg-red-50"
					use:armed
				>
					Confirm?
				</button>
				<button
					type="button"
					onclick={() => (confirmSignOutAll = false)}
					class="text-sm text-gray-500 hover:text-gray-900">Cancel</button
				>
			</form>
		{/if}

		<div class="divide-y divide-gray-200 border-t border-gray-200" data-tour="account-sessions">
			{#each data.sessions as s, i (s.id)}
				<div
					class="flex items-center gap-4 px-4 py-3 {selected === i
						? 'bg-gray-100 ring-2 ring-gray-900 ring-inset'
						: ''}"
				>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-gray-900">
							{s.device}
							{#if s.current}
								<span class="eyebrow ml-2 text-gray-500">this device</span>
							{/if}
						</p>
						<p class="tabular text-xs text-gray-500">
							Last seen {when(s.lastSeen)} &middot; signed in {when(s.createdAt)}
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
								<button class="btn btn-danger btn-sm" use:armed>Confirm?</button>
								<button
									type="button"
									onclick={() => (confirmRevoke = null)}
									class="text-xs text-gray-500 hover:text-gray-900">Cancel</button
								>
							</form>
						{:else}
							<button onclick={() => (confirmRevoke = s.id)} class="btn btn-sm">Sign out</button>
						{/if}
					{/if}
				</div>
			{:else}
				<p class="px-4 py-3 text-sm text-gray-500">No other sessions.</p>
			{/each}
		</div>
	</Card>

	<!--
		Which ontoplano this app is looking at.
		
		Reachable from every build, not only the one that is its own instance:
		the app on a phone can be pointed at the official instance, at a laptop
		on the same wifi, or at a server somebody runs themselves, and the
		screen that does it has to be findable from inside whichever one it is
		currently showing.
	-->
	<Card
		title="Where this ontoplano lives"
		description="This app can open the official instance, one you run yourself, or nothing at all — everything on the phone."
	>
		{#snippet actions()}
			<a href={resolve('/instance')} class="btn btn-sm">Change instance</a>
		{/snippet}
		<p class="text-sm text-gray-500">
			You are looking at <span class="font-medium text-gray-900">{page.url.origin}</span>.
		</p>
	</Card>

	<Card title="Export your data">
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
			Everything this account owns, as JSON: plans, tasks, diary, habits, goals, shopping, ideas and
			settings. The raw rows, so it is complete rather than pretty.
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
				<span class="text-gray-900">Include pictures</span>
				<span class="block text-gray-500">
					They are most of the file's size. Leave them out for a file that moves to another
					instance; keep them for a backup.
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
		{:else if data.exports.remaining <= 0}
			<p class="mt-2 text-sm text-red-600">
				No exports left today — this plan allows {data.exports.allowed} a day. The next one unlocks
				{data.exports.unlocksIn}.
			</p>
		{:else}
			<p class="mt-2 text-sm {data.exports.remaining === 1 ? 'text-amber-700' : 'text-gray-500'}">
				{data.exports.remaining} of {data.exports.allowed}
				{data.exports.allowed === 1 ? 'export' : 'exports'} left today.
				{#if data.exports.unlocksIn}
					The allowance resets {data.exports.unlocksIn}.
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
	<Card title="Bring things in">
		{#snippet actions()}
			<a href={resolve('/settings/account/import')} class="btn btn-sm">Import</a>
		{/snippet}
		<p class="text-sm text-gray-500">
			A list from Todoist, Google Tasks or Google Keep, or an export from another instance.
		</p>
	</Card>

	{#if data.nativeApp}
		<!--
			The way out of the instance, not out of the account.

			The app is a window onto whichever ontoplano you pointed it at, and
			until now the only way to point it somewhere else was the launcher
			icon's long-press menu — an affordance nobody has ever gone looking
			for. It lands here, beside sign-out, because leaving a server and
			leaving an account are the two things somebody comes to this page to
			do. Only in the app: `ontoplano://instance` is a native screen, and in
			a browser the link opens nothing at all.
		-->
		<Card title="This instance">
			{#snippet actions()}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- an app scheme, not a route -->
				<a href="ontoplano://instance" class="btn btn-sm">Switch instance</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/snippet}
			<p class="text-sm text-gray-500">
				This app is open on <strong class="text-gray-700">{data.host}</strong>. Switching points it
				at another one.
			</p>
		</Card>
	{/if}

	<!--
		The phone's only door out. The desktop has Sign out in the header menu;
		the bottom bar carries no menu, so this page — where the account's other
		session controls already live — is where a finger finds it.
	-->
	<Card title="Sign out">
		{#snippet actions()}
			<form method="post" action="/login?/signOut" use:enhance>
				<button type="submit" class="btn btn-sm">Sign out</button>
			</form>
		{/snippet}
		<p class="text-sm text-gray-500">This device only. The sessions above list the others.</p>
		<!--
			And the other reason somebody opens this card in the app: not to leave
			the account, but to leave the instance. Signing out lands on that
			instance's sign-in screen, which is the wrong place to discover you
			wanted a different ontoplano.
		-->
		{#if inPhoneApp()}
			<p class="mt-2 text-sm">
				<!-- Another origin entirely — the copy of the app on the phone —
				     which is not a route this app can resolve. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={askAgainOnThisPhone()} class="font-medium text-gray-900 underline">
					Use a different ontoplano
				</a>
			</p>
		{/if}
	</Card>

	<Card title="Delete your account" accent="#b91c1c">
		{#snippet actions()}
			<button onclick={() => (confirming = true)} class="btn btn-danger btn-sm">
				<Icon name="trash" /> Delete account
			</button>
		{/snippet}
		<p class="text-sm text-gray-500">
			This removes every row belonging to you and cannot be undone. Download an export first if you
			might want the data back.
		</p>
	</Card>

	<Modal
		open={confirming}
		error={form?.message}
		onclose={() => (confirming = false)}
		title="Delete your account"
		description="Every row belonging to you goes with it. This cannot be undone."
		size="sm"
	>
		<form id="delete-form" method="post" action="?/delete" use:enhance>
			<FormGrid>
				<Field label="Type {data.email} to confirm" span={12} required>
					<input name="email" autocomplete="off" required class="input" />
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (confirming = false)}>Cancel</button>
			<button type="submit" form="delete-form" class="btn btn-danger">Delete permanently</button>
		{/snippet}
	</Modal>
</div>
