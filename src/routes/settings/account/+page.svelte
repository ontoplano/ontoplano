<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let editing = $state<'email' | 'password' | null>(null);
	let confirming = $state(false);
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

		if (e.key === 'j') {
			e.preventDefault();
			selected = Math.min(selected + 1, data.sessions.length - 1);
		}
		if (e.key === 'k') {
			e.preventDefault();
			selected = Math.max(selected - 1, 0);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	{#if form?.message && !form?.success}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{form.message}</div>
	{/if}

	{#if notice}
		<div class="border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{notice}</div>
	{/if}

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 class="text-sm font-semibold text-gray-900">Email address</h2>
				<p class="mt-1 text-sm text-gray-500">
					You sign in with <span class="font-medium text-gray-900">{data.email}</span>. A new
					address has to be confirmed by a link before it takes over.
					{#if !data.emailVerified}
						<span class="block">This one has not been confirmed yet.</span>
					{/if}
				</p>
			</div>
			<button onclick={() => (editing = 'email')} class="btn btn-sm shrink-0">Change</button>
		</div>
	</section>

	<Modal
		open={editing === 'email'}
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

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 class="text-sm font-semibold text-gray-900">Password</h2>
				<p class="mt-1 text-sm text-gray-500">
					Changing it signs out every other device you are logged in on.
				</p>
			</div>
			<button onclick={() => (editing = 'password')} class="btn btn-sm shrink-0">Change</button>
		</div>
	</section>

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

	<section class="border border-gray-200 bg-white shadow-card">
		<div class="flex items-start justify-between gap-4 p-6 pb-4">
			<div>
				<h2 class="text-sm font-semibold text-gray-900">Where you are signed in</h2>
				<p class="mt-1 text-sm text-gray-500">
					One line per sign-in. Anything you do not recognise, sign out.
					<kbd class="border border-gray-300 bg-gray-50 px-1">j</kbd>
					<kbd class="border border-gray-300 bg-gray-50 px-1">k</kbd> to move.
				</p>
			</div>
			{#if data.sessions.length > 1 && !confirmSignOutAll}
				<button
					onclick={() => (confirmSignOutAll = true)}
					class="shrink-0 border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
				>
					Sign out everywhere
				</button>
			{/if}
		</div>

		{#if confirmSignOutAll}
			<form
				method="post"
				action="?/signOutEverywhere"
				use:enhance
				class="mx-6 mb-4 flex items-center gap-2 border border-gray-200 bg-gray-50 px-3 py-2"
			>
				<span class="flex-1 text-sm text-gray-700">
					This signs out every device, including this one.
				</span>
				<button
					class="border border-red-200 bg-white px-3 py-1 text-sm text-red-600 hover:bg-red-50"
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

		<div class="divide-y divide-gray-200 border-t border-gray-200">
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
								<button
									class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
									>Confirm?</button
								>
								<button
									type="button"
									onclick={() => (confirmRevoke = null)}
									class="text-xs text-gray-400 hover:text-gray-900">Cancel</button
								>
							</form>
						{:else}
							<button
								onclick={() => (confirmRevoke = s.id)}
								class="border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
								>Sign out</button
							>
						{/if}
					{/if}
				</div>
			{:else}
				<p class="px-4 py-3 text-sm text-gray-400">No other sessions.</p>
			{/each}
		</div>
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<h2 class="text-sm font-semibold text-gray-900">Export your data</h2>
		<p class="mt-1 text-sm text-gray-500">
			Everything this account owns, as JSON: plans, tasks, diary, habits, goals, shopping, ideas and
			settings. The raw rows, so it is complete rather than pretty.
		</p>
		<a
			href={resolve('/settings/account/export')}
			download
			class="mt-4 inline-block border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
		>
			Download export
		</a>
	</section>

	<section class="border border-red-200 bg-white p-6 shadow-card">
		<h2 class="text-sm font-semibold text-gray-900">Delete your account</h2>
		<p class="mt-1 text-sm text-gray-500">
			This removes every row belonging to you and cannot be undone. Download an export first if you
			might want the data back.
		</p>
		<button onclick={() => (confirming = true)} class="btn btn-danger mt-4">Delete account</button>
	</section>

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
