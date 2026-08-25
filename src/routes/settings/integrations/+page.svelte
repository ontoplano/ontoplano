<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showTokenForm = $state(false);
	let confirmRevoke = $state<number | null>(null);
	let confirmDeleteStream = $state<number | null>(null);
	let selectedIndex = $state(-1);
	let copied = $state(false);

	const newToken = $derived(form?.success && form.action === 'createToken' ? form.token : null);

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
	<p class="text-sm text-gray-500">
		Connect external apps. They push data in as <em>streams</em> and can read your upcoming schedule —
		without shipping any code into ontoplano.
	</p>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

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
				<button
					type="button"
					onclick={() => copyToken(newToken.plaintext)}
					class="border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<p class="mt-2 text-xs text-blue-800">
				Scopes: {newToken.scopes.join(', ')}
			</p>
		</div>
	{/if}

	<!-- API tokens -->
	<section class="border border-gray-200 bg-white shadow-card">
		<header class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
			<h2 class="text-sm font-semibold text-gray-900">API tokens</h2>
			<button type="button" onclick={() => (showTokenForm = true)} class="btn btn-sm">
				New token <kbd class="ml-1 border border-gray-300 bg-gray-50 px-1">n</kbd>
			</button>
		</header>

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
							name="expiresInDays"
							type="number"
							min="1"
							max="3650"
							placeholder="never"
							class="input tabular"
						/>
					</Field>

					<fieldset class="col-span-12">
						<legend class="eyebrow text-gray-500">Scopes</legend>
						<p class="mt-1 mb-2 text-xs text-gray-500">
							Grant only what the app needs. A token with no read scope cannot see your data.
						</p>
						<div class="space-y-1">
							{#each data.scopes as scope (scope.key)}
								<label class="flex items-start gap-2 text-sm text-gray-700">
									<input type="checkbox" name="scopes" value={scope.key} class="mt-1" />
									<span>
										<code class="font-mono text-xs">{scope.key}</code>
										<span class="text-gray-500"> — {scope.description}</span>
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
			<p class="px-4 py-6 text-sm text-gray-500">
				No tokens yet. Create one to let an external app talk to ontoplano.
			</p>
		{:else}
			<ul class="divide-y divide-gray-200">
				{#each data.tokens as token, i (token.id)}
					<li
						class="flex items-center gap-4 px-4 py-3 {selectedIndex === i
							? 'ring-2 ring-gray-900 ring-inset'
							: ''}"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-gray-900">{token.name}</p>
							<p class="mt-0.5 font-mono text-xs text-gray-500">{token.prefix}…</p>
							<p class="mt-1 text-xs text-gray-500">
								{token.scopes.join(', ') || 'no scopes'}
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
						{#if confirmRevoke === token.id}
							<form method="post" action="?/revokeToken" use:enhance>
								<input type="hidden" name="id" value={token.id} />
								<button
									type="submit"
									class="border border-red-200 px-3 py-1.5 text-sm text-red-600 shadow-sm hover:bg-red-50"
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
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Data streams -->
	<section class="border border-gray-200 bg-white shadow-card">
		<header class="border-b border-gray-200 px-4 py-3">
			<h2 class="text-sm font-semibold text-gray-900">Data streams</h2>
			<p class="mt-1 text-xs text-gray-500">
				Created automatically when an external app declares one. You choose how each is displayed.
			</p>
		</header>

		{#if data.streams.length === 0}
			<div class="space-y-2 px-4 py-6 text-sm text-gray-500">
				<p>No streams yet.</p>
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
							class="flex flex-wrap items-center gap-4"
						>
							<input type="hidden" name="id" value={stream.id} />
							<div class="min-w-0 flex-1">
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
							<button
								type="submit"
								class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
							>
								Save
							</button>
						</form>
						<div class="mt-2">
							{#if confirmDeleteStream === stream.id}
								<form method="post" action="?/deleteStream" use:enhance>
									<input type="hidden" name="id" value={stream.id} />
									<button
										type="submit"
										class="border border-red-200 px-3 py-1 text-xs text-red-600 shadow-sm hover:bg-red-50"
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
	</section>

	<p class="text-xs text-gray-500">
		Writing a plugin? See <code class="font-mono">docs/PLUGINS.md</code> in the repository.
	</p>
</div>
