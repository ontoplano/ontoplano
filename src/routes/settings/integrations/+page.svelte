<script lang="ts">
	import { getAction, keyFor } from '$lib/shortcuts';
	import { enhance } from '$app/forms';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { armed } from '$lib/actions/armed';
	import Card from '$lib/components/Card.svelte';
	import { resolve } from '$app/paths';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { keepInView } from '$lib/actions/keep-in-view';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showTokenForm = $state(false);
	let showWebhookForm = $state(false);
	let confirmRevoke = $state<number | null>(null);
	let confirmDeleteStream = $state<number | null>(null);
	let confirmDeleteWebhook = $state<number | null>(null);
	let revealedSecret = $state<number | null>(null);
	let selectedIndex = $state(-1);
	let copied = $state(false);

	const newToken = $derived(form?.success && form.action === 'createToken' ? form.token : null);
	const newFeedUrl = $derived(
		form?.success && form.action === 'calendarLink' ? form.feedUrl : null
	);

	// The sentence a scope was granted as, everywhere a scope is shown — the
	// key is for the developer, the sentence is for the owner of the data.
	const scopeSentence = (key: string) => data.scopes.find((s) => s.key === key)?.description ?? key;

	/**
	 * Tick exactly these and untick the rest.
	 *
	 * Set rather than add, so pressing a preset twice is the same as pressing it
	 * once and the button always leaves the form in the state its label claims.
	 */
	let scopeBox = $state<HTMLElement>();
	function tick(keys: string[]) {
		for (const box of scopeBox?.querySelectorAll<HTMLInputElement>('input[name="scopes"]') ?? [])
			box.checked = keys.includes(box.value);
	}

	function closeForms() {
		showTokenForm = false;
		showWebhookForm = false;
		confirmRevoke = null;
		confirmDeleteStream = null;
		confirmDeleteWebhook = null;
	}

	const eventLabel = (key: string) => data.webhookEvents.find((e) => e.key === key)?.label ?? key;

	async function copyToken(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			closeForms();
			return;
		}
		const action = getAction('/settings/integrations', e.key);
		if (action === 'new' && !showTokenForm) {
			e.preventDefault();
			showTokenForm = true;
			return;
		}
		if (action === 'navigate-down') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, data.tokens.length - 1);
		}
		if (action === 'navigate-up') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-6">
	<p class="page-intro">
		Connect external apps. They push data in as <em>streams</em> and can read your upcoming schedule —
		without shipping any code into ontoplano.
	</p>

	<FormError message={form?.message} />

	{#if newToken}
		<div class="border border-blue-200 bg-blue-50 p-4">
			<p class="text-sm font-semibold text-blue-900">
				Token created — copy it now, it won't be shown again.
			</p>
			<div class="mt-2 flex items-center gap-2">
				<code
					class="flex-1 overflow-x-auto border border-blue-200 bg-white px-3 py-2 font-mono text-xs text-gray-900"
					>{newToken.plaintext}</code
				>
				<button type="button" onclick={() => copyToken(newToken.plaintext)} class="btn">
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<p class="mt-2 text-xs text-blue-800">
				It may: {newToken.scopes.map(scopeSentence).join(' · ')}
			</p>
		</div>
	{/if}

	<!--
		The calendar link.

		Above the tokens because it is the one on this page an ordinary person
		wants: paste a URL into the calendar they already use and their plan turns
		up there, with no app to install and nothing of ours in the way.
	-->
	<Card
		title="Calendar link"
		description="Paste the address into Google Calendar, Apple Calendar or Thunderbird and your plan appears there, keeping itself current. Those apps only read it — nothing they do can change your plan."
	>
		{#if newFeedUrl}
			<div class="border border-blue-200 bg-blue-50 p-4">
				<p class="text-sm font-semibold text-blue-900">Your new calendar address</p>
				<div class="mt-2 flex items-center gap-2">
					<code
						class="flex-1 overflow-x-auto border border-blue-200 bg-white px-3 py-2 font-mono text-xs break-all text-gray-900"
						>{newFeedUrl}</code
					>
					<button type="button" onclick={() => copyToken(newFeedUrl)} class="btn">
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
			</div>
		{/if}

		<!--
			Anyone holding the address can read the plan — that is how every calendar
			subscription works, Google's included, because the calendar fetches it
			with no way to be asked anything. Said plainly rather than buried: it is
			the one thing somebody needs to know before pasting it into a shared
			machine.
		-->
		<p class="mt-3 text-sm text-gray-500">
			Anyone with the address can read your plan, so treat it like a password. Each one is listed
			below and can be revoked on its own.
		</p>

		<form method="post" action="?/calendarLink" use:enhance class="mt-3 flex items-end gap-2">
			<!-- Named, because five identical rows called "Calendar link" are five
			     rows nobody can revoke with any confidence. -->
			<label class="text-xs text-gray-500">
				<span class="eyebrow block text-gray-600">Where it is going</span>
				<input
					autocomplete="off"
					name="label"
					type="text"
					maxlength="60"
					placeholder="my phone"
					class="input mt-1 w-48"
				/>
			</label>
			<button
				class="btn btn-sm btn-primary"
				disabled={data.calendarLinks.length >= data.calendarLinkLimit}
			>
				Create a calendar link
			</button>
			{#if data.calendarLinks.length >= data.calendarLinkLimit}
				<span class="text-xs text-gray-500">
					{data.calendarLinkLimit} is the most. Revoke one to make another.
				</span>
			{/if}
		</form>
	</Card>

	<!-- API tokens -->
	<Card title="API tokens" flush>
		{#snippet actions()}
			<button
				type="button"
				onclick={() => (showTokenForm = true)}
				class="btn btn-sm"
				data-tour="integrations-tokens"
			>
				New token <kbd class="ml-1 border border-gray-300 bg-gray-50 px-1 text-gray-700"
					>{keyFor('/settings/integrations', 'new')}</kbd
				>
			</button>
		{/snippet}

		<Modal
			bind:open={showTokenForm}
			error={form?.message}
			title="New API token"
			description="Shown once, at creation. It cannot be recovered afterwards."
		>
			<form
				id="token-form"
				method="post"
				action="?/createToken"
				use:enhance={() =>
					async ({ update, result }) => {
						await update();
						if (result.type === 'success') showTokenForm = false;
					}}
			>
				<FormGrid>
					<Field label="Name" span={8} required>
						<input
							autocomplete="off"
							name="label"
							type="text"
							required
							maxlength="60"
							placeholder="the app on my phone"
							class="input"
						/>
					</Field>

					<Field label="Expires in" span={4} hint="Days. Empty means never.">
						<input
							autocomplete="off"
							name="expiresInDays"
							type="number"
							min="1"
							max="3650"
							placeholder="never"
							class="input tabular"
						/>
					</Field>

					<fieldset class="col-span-12">
						<legend class="eyebrow text-gray-600">What this token may do</legend>
						<p class="mt-1 mb-2 text-xs text-gray-500">
							Grant only what the app needs. Anything unticked stays out of reach.
						</p>
						<!--
							Eighteen checkboxes is a form somebody ticks wrong, and both wrong
							answers are bad: a token that cannot do its job, or one that can do
							more than it was made for. The one set anybody grants wholesale is
							an assistant's, so that set is a button — read from the tools
							themselves, so a tool added later is in it without anybody
							remembering.
						-->
						<p class="mb-2 flex flex-wrap items-center gap-2">
							<button type="button" class="btn btn-sm" onclick={() => tick(data.assistantScopes)}>
								An assistant (MCP)
							</button>
							<button type="button" class="btn btn-sm btn-quiet" onclick={() => tick([])}>
								Clear
							</button>
						</p>
						<div class="space-y-1" bind:this={scopeBox}>
							{#each data.scopes as scope (scope.key)}
								<label class="flex items-start gap-2 text-sm text-gray-700">
									<input type="checkbox" name="scopes" value={scope.key} class="mt-1" />
									<span>
										<code class="font-mono text-xs text-gray-900">{scope.key}</code>
										<span class="text-gray-500">— {scope.description}</span>
									</span>
								</label>
							{/each}
						</div>
					</fieldset>
				</FormGrid>
			</form>

			{#snippet footer()}
				<button type="button" class="btn" onclick={() => (showTokenForm = false)}>Cancel</button>
				<button type="submit" form="token-form" class="btn btn-primary">Create token</button>
			{/snippet}
		</Modal>

		{#if data.tokens.length === 0}
			<div class="px-3">
				<EmptyState icon="key" title="No tokens yet — create one to let another app in" compact />
			</div>
		{:else}
			<ul class="divide-y divide-gray-200">
				{#each data.tokens as token, i (token.id)}
					<li
						use:keepInView={selectedIndex === i}
						class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 {selectedIndex ===
						i
							? 'ring-2 ring-gray-900 ring-inset'
							: ''}"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-gray-900">{token.name}</p>
							<!--
								A calendar link shows its whole address; every other token
								shows the six characters that identify it and nothing more.
								That difference is the difference between the two kinds of
								credential, and it is the one thing this row has to make
								obvious.
							-->
							{#if token.feedUrl}
								<div class="mt-1 flex items-center gap-2">
									<code
										class="min-w-0 flex-1 overflow-x-auto border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs break-all text-gray-700"
										>{token.feedUrl}</code
									>
									<button
										type="button"
										onclick={() => copyToken(token.feedUrl!)}
										class="btn btn-sm shrink-0"
									>
										{copied ? 'Copied' : 'Copy'}
									</button>
								</div>
							{:else if token.scopes.includes('calendar:read')}
								<!-- Made before addresses were kept, so this one genuinely
								     cannot be shown again. Said, rather than left as a row
								     that looks broken next to the ones above it. -->
								<p class="mt-0.5 font-mono text-xs text-gray-500">{token.prefix}…</p>
								<p class="mt-0.5 text-xs text-gray-500">
									This address was not kept and cannot be shown again. Make a new link to have one
									you can copy.
								</p>
							{:else}
								<p class="mt-0.5 font-mono text-xs text-gray-500">{token.prefix}…</p>
							{/if}
							<p class="mt-1 text-xs text-gray-500">
								{token.scopes.map(scopeSentence).join(' · ') || 'no scopes'}
								{#if token.lastUsedAt}
									· last used {token.lastUsedAt.slice(0, 16).replace('T', ' ')}
								{:else}
									· never used
								{/if}
								{#if token.expiresAt}
									· expires {token.expiresAt.slice(0, 10)}
								{/if}
							</p>
						</div>
						<div class="flex justify-end sm:shrink-0">
							{#if confirmRevoke === token.id}
								<form method="post" action="?/revokeToken" use:enhance>
									<input type="hidden" name="id" value={token.id} />
									<button
										type="submit"
										class="border border-red-200 px-3 py-1.5 text-sm text-red-600 shadow-sm hover:bg-red-50"
										use:armed
									>
										Confirm?
									</button>
								</form>
							{:else}
								<button
									type="button"
									onclick={() => (confirmRevoke = token.id)}
									class="border border-red-200 px-3 py-1.5 text-sm text-red-600 shadow-sm hover:bg-red-50"
								>
									Revoke
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<!-- Data streams -->
	<Card
		title="Data streams"
		description="Created automatically when an external app declares one. You choose how each is displayed."
		flush
	>
		{#if data.streams.length === 0}
			<div class="space-y-2 px-4 py-6 text-sm text-gray-500" data-tour="integrations-streams">
				<EmptyState icon="plug" title="No streams yet" compact />
				<p class="text-xs">
					An app declares a stream by POSTing to
					<code class="border border-gray-200 bg-gray-50 px-1 font-mono text-xs"
						>{data.origin}/api/v1/streams</code
					>
					with a token that has the <code class="font-mono">streams:write</code> scope.
				</p>
			</div>
		{:else}
			<ul class="divide-y divide-gray-200" data-tour="integrations-streams">
				{#each data.streams as stream (stream.id)}
					<li class="px-4 py-3">
						<form
							method="post"
							action="?/updateStream"
							use:enhance
							class="flex flex-wrap items-center gap-x-4 gap-y-2"
						>
							<input type="hidden" name="id" value={stream.id} />
							<!-- `basis-full` below `sm`: three controls that will not shrink
							     had left the name one character per line. -->
							<div class="min-w-0 flex-1 basis-full sm:basis-0">
								<a
									href={resolve('/data/[slug]', { slug: stream.slug })}
									class="text-sm font-medium text-gray-900 underline underline-offset-2"
								>
									{stream.name}
								</a>
								<p class="mt-0.5 font-mono text-xs text-gray-500">{stream.slug}</p>
								<p class="mt-1 text-xs text-gray-500">
									{stream.kind}{stream.unit ? ` · ${stream.unit}` : ''} · {stream.stats.count} points
									{#if stream.stats.latest}
										· latest {stream.stats.latest.at.slice(0, 10)}
									{/if}
								</p>
							</div>
							<input type="hidden" name="label" value={stream.name} />
							<select
								name="display"
								class="border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
							>
								{#each data.displays as display (display)}
									<option value={display} selected={stream.display === display}>{display}</option>
								{/each}
							</select>
							<label class="flex items-center gap-1.5 text-sm text-gray-700">
								<input type="checkbox" name="showOnDashboard" checked={stream.showOnDashboard} />
								Dashboard
							</label>
							<label
								class="flex items-center gap-1.5 text-sm text-gray-700"
								title="Points older than this are deleted, nightly. Leave empty to keep everything."
							>
								Keep
								<input
									type="number"
									name="retentionDays"
									min="1"
									max="3650"
									value={stream.retentionDays ?? ''}
									class="w-16 border border-gray-300 px-2 py-1.5 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								/>
								days
							</label>
							<button type="submit" class="btn btn-sm"> Save </button>
						</form>
						<div class="mt-2">
							{#if confirmDeleteStream === stream.id}
								<form method="post" action="?/deleteStream" use:enhance>
									<input type="hidden" name="id" value={stream.id} />
									<button
										type="submit"
										class="border border-red-200 px-3 py-1 text-xs text-red-600 shadow-sm hover:bg-red-50"
										use:armed
									>
										Confirm? This deletes {stream.stats.count} points.
									</button>
								</form>
							{:else}
								<button
									type="button"
									onclick={() => (confirmDeleteStream = stream.id)}
									class="border border-red-200 px-3 py-1 text-xs text-red-600 shadow-sm hover:bg-red-50"
								>
									Delete stream
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<!-- Webhooks -->
	<Card
		title="Webhooks"
		description="A URL of yours that is told when things happen here — new todos, ticks, ideas.
Streams push data in, webhooks let your programs listen."
		flush
	>
		{#snippet actions()}
			<button type="button" onclick={() => (showWebhookForm = true)} class="btn btn-sm">
				New webhook
			</button>
		{/snippet}

		<Modal
			bind:open={showWebhookForm}
			error={form?.message}
			title="New webhook"
			description="Each delivery is signed with a secret, shown on the row, so your receiver can check it is really this server."
		>
			<form
				id="webhook-form"
				method="post"
				action="?/createWebhook"
				use:enhance={() =>
					async ({ update, result }) => {
						await update();
						if (result.type === 'success') showWebhookForm = false;
					}}
			>
				<FormGrid>
					<Field label="Address" span={12} required>
						<input
							autocomplete="off"
							name="url"
							type="url"
							required
							maxlength="300"
							placeholder="https://example.com/ontoplano-hook"
							class="input"
						/>
					</Field>

					<fieldset class="col-span-12">
						<legend class="eyebrow text-gray-600">Tell it when</legend>
						<div class="mt-1 space-y-1">
							{#each data.webhookEvents as event (event.key)}
								<label class="flex items-start gap-2 text-sm text-gray-700">
									<input type="checkbox" name="events" value={event.key} class="mt-1" />
									<span>
										{event.label}
										<code class="ml-1 font-mono text-xs text-gray-500">{event.key}</code>
									</span>
								</label>
							{/each}
						</div>
					</fieldset>
				</FormGrid>
			</form>

			{#snippet footer()}
				<button type="button" class="btn" onclick={() => (showWebhookForm = false)}>Cancel</button>
				<button type="submit" form="webhook-form" class="btn btn-primary">Create webhook</button>
			{/snippet}
		</Modal>

		{#if data.webhooks.length === 0}
			<div class="px-3">
				<EmptyState
					icon="plug"
					title="No webhooks yet — add an address to be told when things happen"
					compact
				/>
			</div>
		{:else}
			<ul class="divide-y divide-gray-200">
				{#each data.webhooks as hook (hook.id)}
					<li class="px-4 py-3">
						<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
							<div class="min-w-0 flex-1 basis-full sm:basis-0">
								<p class="text-sm font-medium break-all text-gray-900">{hook.url}</p>
								<p class="mt-1 text-xs text-gray-500">
									When {hook.events.map(eventLabel).join(', or ')}
									{#if hook.disabled}
										· <span class="font-medium">gave up after repeated failures</span>
									{:else if hook.lastDeliveryAt}
										· last delivery {hook.lastDeliveryAt.slice(0, 16).replace('T', ' ')}
										{hook.lastStatus ? `(${hook.lastStatus})` : '(unreachable)'}
									{:else}
										· nothing delivered yet
									{/if}
								</p>
								<p class="mt-1 text-xs text-gray-500">
									Secret:
									{#if revealedSecret === hook.id}
										<code class="font-mono break-all">{hook.secret}</code>
									{:else}
										<button
											type="button"
											class="underline underline-offset-2"
											onclick={() => (revealedSecret = hook.id)}
										>
											show
										</button>
									{/if}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								{#if hook.disabled}
									<form method="post" action="?/reviveWebhook" use:enhance>
										<input type="hidden" name="id" value={hook.id} />
										<button type="submit" class="btn btn-sm">Try again</button>
									</form>
								{/if}
								{#if confirmDeleteWebhook === hook.id}
									<form method="post" action="?/deleteWebhook" use:enhance>
										<input type="hidden" name="id" value={hook.id} />
										<button
											type="submit"
											class="border border-red-200 px-3 py-1.5 text-sm text-red-600 shadow-sm hover:bg-red-50"
											use:armed
										>
											Confirm?
										</button>
									</form>
								{:else}
									<button
										type="button"
										onclick={() => (confirmDeleteWebhook = hook.id)}
										class="border border-red-200 px-3 py-1.5 text-sm text-red-600 shadow-sm hover:bg-red-50"
									>
										Delete
									</button>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>

	<div class="space-y-1 text-xs text-gray-500">
		<p>
			The limits: a token may make 240 reads and 60 writes a minute, and all your tokens together
			share 600 and 150 — more tokens is not more budget. Stored data points count against your
			plan, and a stream with retention set keeps only those days.
		</p>
		<p>
			Writing a plugin? See
			<a
				href="https://github.com/ontoplano/ontoplano/blob/master/docs/PLUGINS.md"
				rel="external"
				class="underline underline-offset-2 hover:text-gray-900"
			>
				docs/PLUGINS.md
			</a>
			on GitHub.
		</p>
	</div>
</div>
