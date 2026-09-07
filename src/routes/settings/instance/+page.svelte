<script lang="ts">
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

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

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
		if (seconds < 90) return `${seconds}s ago`;
		const minutes = Math.round(seconds / 60);
		if (minutes < 90) return `${minutes} min ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 36) return `${hours}h ago`;
		return `${Math.round(hours / 24)} days ago`;
	}

	function exactly(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
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
		return new Date(iso).toLocaleDateString(undefined, {
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
		title="What is running"
		description="Whether the last deploy is the thing answering right now."
	>
		<dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
			<div>
				<dt class="text-sm text-gray-500">Version</dt>
				<dd class="tabular text-lg font-semibold text-gray-900" data-testid="app-version">
					{data.build.version}
					<span class="text-sm font-normal text-gray-500">({data.build.commit})</span>
				</dd>
			</div>

			<div>
				<dt class="text-sm text-gray-500">Built</dt>
				<dd class="text-sm text-gray-900">
					{ago(data.build.builtAt)}
					<span class="text-gray-500">· {exactly(data.build.builtAt)}</span>
				</dd>
			</div>

			<div>
				<dt class="text-sm text-gray-500">Running since</dt>
				<dd class="text-sm text-gray-900">
					{ago(data.build.startedAt)}
					<span class="text-gray-500">· {exactly(data.build.startedAt)}</span>
				</dd>
			</div>

			<div>
				<dt class="text-sm text-gray-500">Registration, in force</dt>
				<dd class="text-sm text-gray-900">
					{data.effectiveRegistration}
					{#if data.effectiveRegistration !== data.config.registration.mode}
						<span class="text-amber-700"
							>· the environment overrides the setting below ({data.config.registration.mode})</span
						>
					{/if}
				</dd>
			</div>
		</dl>

		{#if !restartedIntoThisBuild}
			<div class="mt-4">
				<Banner kind="warning">
					This process is older than the build it is reporting, which means the last deploy copied
					the files and never restarted the service. Nothing new is running.
					<code class="tabular">make restart-server</code>
				</Banner>
			</div>
		{/if}
	</Card>

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
			title="The services beside the app"
			description="The app answers requests; these are the timers that make the rest happen."
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
						<span class="text-sm font-medium text-gray-900">{row.label}</span>
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
		<Card title="Deployment" description="Where the server listens. Set in config.toml.">
			<p
				class="tabular border border-gray-200 bg-gray-50 px-3 py-2 text-sm break-all text-gray-700"
			>
				{#if data.demo}
					<span class="text-gray-500">Hidden on the demo.</span>
				{:else}
					{data.config.server.host}:{data.config.server.port}
				{/if}
			</p>
		</Card>

		<Card title="Database" description="Where your data is stored. Change it in config.toml.">
			<p
				class="tabular border border-gray-200 bg-gray-50 px-3 py-2 text-sm break-all text-gray-700"
			>
				{#if data.demo}
					<span class="text-gray-500">Hidden on the demo.</span>
				{:else}
					{data.config.database.path}
				{/if}
			</p>
		</Card>
	</div>

	<Card
		title="Who can register"
		description="An instance on the open internet with sign-up left open is one that somebody else will use."
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
					<strong>{data.effectiveRegistration}</strong> right now, set in the server's environment — ONTOPLANO_REGISTRATION
					overrides what is chosen here. These buttons are what will apply once it is unset.
				</Banner>
			</div>
		{/if}

		<form
			method="post"
			action="?/setRegistration"
			use:settingsForm={{ notice: 'Registration saved.' }}
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
						<span class="block text-sm font-medium text-gray-900">{mode.label}</span>
						<span class="block text-sm text-gray-500">{mode.hint}</span>
					</span>
				</label>
			{/each}

			<button class="btn btn-primary">Save</button>
		</form>
	</Card>

	{#if data.newsletter}
		{@const list = data.newsletter}
		<Card
			title="The mailing list"
			description="People who asked to be told when this changes. Turned on in config.toml."
		>
			{#snippet actions()}
				<form method="post" action="?/exportSubscribers" use:enhance={exportList}>
					<button class="btn btn-sm" disabled={list.confirmed === 0}>
						<Icon name="download" /> Export
					</button>
				</form>
			{/snippet}
			<p class="text-sm text-gray-500">
				<span class="font-medium text-gray-900">{list.confirmed}</span>
				confirmed{#if list.pending > 0}, and {list.pending} who have not followed the link yet{/if}.
				<!-- Said here because the export is one click away and the rule is
				     what makes the list worth having. -->
				Only confirmed addresses are exported.
			</p>
		</Card>
	{/if}

	<Card
		title="What an account may change"
		description="An address is what an account is here — it signs in and it receives the reset link."
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
						Let people move their account to another address
					</span>
					<span class="block text-sm text-gray-500">
						Off by default. The change is still confirmed by a link before it takes effect.
					</span>
				</span>
			</label>

			<button class="btn btn-primary">Save</button>
		</form>
	</Card>

	<Card
		title="Error reports"
		description="When a page breaks in somebody's browser, the server normally never hears about it."
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
						Offer to send what broke to this server's log
					</span>
					<span class="block text-sm text-gray-500">
						Off by default. Each person is asked once, in the page, and can say never; nothing is
						sent without their yes. What is sent is what broke — never what they wrote.
					</span>
				</span>
			</label>

			<button class="btn btn-primary">Save</button>
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
		title="Invitations"
		description={data.sellsAnything
			? 'A code somebody types when they create their account. It works once, and it hands them the app until the date you set.'
			: 'A code somebody types when they create their account. It works once.'}
	>
		{#snippet actions()}
			<span class="eyebrow text-gray-600">{open.length} open</span>
		{/snippet}

		{#if fresh}
			<div class="mb-4 border border-blue-200 bg-blue-50 p-3">
				<p class="text-sm text-blue-900">
					Hand this over now — it is not shown again, though it can be revoked.
				</p>
				<div class="mt-2 flex items-center gap-2">
					<code class="tabular flex-1 border border-blue-200 bg-white px-3 py-2 text-sm break-all">
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
						{copied === inviteLink(fresh) ? 'Copied' : 'Copy link'}
					</button>
				</div>
			</div>
		{/if}

		<form method="post" action="?/createInvite" use:enhance>
			<FormGrid>
				<Field label="Who is it for" span={12} hint="For your own memory; they never see it.">
					<OneLine name="note" placeholder="my brother" class="input" />
				</Field>

				<Field label="Code expires in" span={6} hint="Days. Leave empty for no expiry.">
					<input
						autocomplete="off"
						name="expiresInDays"
						type="number"
						min="1"
						max="365"
						class="input tabular"
					/>
				</Field>

				{#if data.sellsAnything}
					<!--
						The two dates on this form are different clocks and the labels say
						so: one is how long the code works for, the other is how long what
						it hands over lasts.
					-->
					<Field
						label="Free until"
						span={6}
						hint="A full account, on the house — no card, no trial days spent. Empty means no end date."
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
				<button class="btn btn-primary"><Icon name="plus" /> New invitation</button>
			</div>
		</form>

		{#if data.invites.length === 0}
			<div class="mt-4 border-t border-gray-200 pt-4">
				<EmptyState
					icon="key"
					title="No invitations yet"
					description="Make one when somebody needs an account here."
				/>
			</div>
		{:else}
			<div class="mt-4 divide-y divide-gray-200 border-t border-gray-200">
				{#each [...open, ...used] as invite (invite.id)}
					<div class="flex items-center gap-3 py-2 text-sm">
						<span class="min-w-0 flex-1">
							<span class="text-gray-900">{invite.note || 'No note'}</span>
							<span class="block text-xs text-gray-500">
								made {when(invite.createdAt)}
								{#if invite.usedAt}
									· used {when(invite.usedAt)}
								{:else if invite.expiresAt}
									· code expires {when(invite.expiresAt)}
								{/if}
								{#if data.sellsAnything}
									· {invite.grantsUntil
										? `free until ${when(invite.grantsUntil)}`
										: 'free with no end date'}
								{/if}
							</span>
						</span>

						{#if invite.usedAt}
							<span class="eyebrow shrink-0 text-gray-500">used</span>
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
									Cancel
								</button>
								<button class="btn btn-danger btn-sm" use:armed>Yes, revoke</button>
							</form>
						{:else}
							<button
								onclick={() => (confirmRevoke = invite.id)}
								class="btn btn-danger btn-sm shrink-0"
							>
								<Icon name="trash" /> Revoke
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</Card>
</div>
