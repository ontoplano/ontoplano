<script lang="ts">
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
	let confirmRevoke = $state<number | null>(null);
	let confirmDeleteStream = $state<number | null>(null);
	let selectedIndex = $state(-1);
	let copied = $state(false);

	const newToken = $derived(form?.success && form.action === 'createToken' ? form.token : null);

	// The sentence a scope was granted as, everywhere a scope is shown — the
	// key is for the developer, the sentence is for the owner of the data.
	const scopeSentence = (key: string) =>
		data.scopes.find((s) => s.key === key)?.description ?? key;

	function closeForms() {
		showTokenForm = false;
		confirmRevoke = null;
		confirmDeleteStream = null;
	}

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
		if (e.key === 'n' && !showTokenForm) {
			e.preventDefault();
			showTokenForm = true;
			return;
		}
		if (e.key === 'j') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, data.tokens.length - 1);
		}
		if (e.key === 'k') {
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

	<!-- API tokens -->
	<Card title="API tokens" flush>
		{#snippet actions()}
			<button type="button" onclick={() => (showTokenForm = true)} class="btn btn-sm">
				New token <kbd class="ml-1 border border-gray-300 bg-gray-50 px-1 text-gray-700">n</kbd>
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
							name="name"
							type="text"
							required
							maxlength="60"
							placeholder="a-private-plugin on my phone"
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
						<div class="space-y-1">
							{#each data.scopes as scope (scope.key)}
								<label class="flex items-start gap-2 text-sm text-gray-700">
									<input type="checkbox" name="scopes" value={scope.key} class="mt-1" />
									<span>
										{scope.description}
										<code class="ml-1 font-mono text-xs text-gray-500">{scope.key}</code>
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
							<p class="mt-0.5 font-mono text-xs text-gray-500">{token.prefix}…</p>
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
			<div class="space-y-2 px-4 py-6 text-sm text-gray-500">
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
			<ul class="divide-y divide-gray-200">
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
							<input type="hidden" name="name" value={stream.name} />
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

	<p class="text-xs text-gray-500">
		Writing a plugin? See <code class="font-mono">docs/PLUGINS.md</code> in the repository.
	</p>
</div>
