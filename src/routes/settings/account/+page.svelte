<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { autofocus } from '$lib/actions/autofocus';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let editing = $state<'email' | 'password' | null>(null);
	let confirming = $state(false);

	const notice = $derived(form?.success ? form.message : null);

	const INPUT =
		'mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none';

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
		<h2 class="text-sm font-semibold text-gray-900">Signed in as</h2>
		<p class="mt-1 text-sm text-gray-500">{data.name} &middot; {data.email}</p>
		{#if !data.emailVerified}
			<p class="mt-1 text-xs text-gray-500">This address has not been confirmed yet.</p>
		{/if}
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 class="text-sm font-semibold text-gray-900">Email address</h2>
				<p class="mt-1 text-sm text-gray-500">
					You sign in with <span class="font-medium text-gray-900">{data.email}</span>. A new
					address has to be confirmed by a link before it takes over.
				</p>
			</div>
			{#if editing !== 'email'}
				<button
					onclick={() => (editing = 'email')}
					class="shrink-0 border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
				>
					Change
				</button>
			{/if}
		</div>

		{#if editing === 'email'}
			{#if !data.emailConfigured}
				<p class="mt-4 border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
					This server has no mail configured, so the confirmation link is written to its log.
				</p>
			{/if}
			<form
				method="post"
				action="?/changeEmail"
				use:enhance={() =>
					async ({ update, result }) => {
						if (result.type === 'success') editing = null;
						await update({ reset: result.type === 'success' });
					}}
				class="mt-4 max-w-sm space-y-3"
			>
				<label class="block">
					<span class="eyebrow text-gray-500">New address</span>
					<input
						name="newEmail"
						type="email"
						required
						autocomplete="email"
						use:autofocus
						class={INPUT}
					/>
				</label>
				<label class="block">
					<span class="eyebrow text-gray-500">Your password</span>
					<input
						name="password"
						type="password"
						required
						autocomplete="current-password"
						class={INPUT}
					/>
				</label>
				<div class="flex gap-2">
					<button class="bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
						Send confirmation
					</button>
					<button
						type="button"
						onclick={() => (editing = null)}
						class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>
						Cancel
					</button>
				</div>
			</form>
		{/if}
	</section>

	<section class="border border-gray-200 bg-white p-6 shadow-card">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 class="text-sm font-semibold text-gray-900">Password</h2>
				<p class="mt-1 text-sm text-gray-500">
					Changing it signs out every other device you are logged in on.
				</p>
			</div>
			{#if editing !== 'password'}
				<button
					onclick={() => (editing = 'password')}
					class="shrink-0 border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
				>
					Change
				</button>
			{/if}
		</div>

		{#if editing === 'password'}
			<form
				method="post"
				action="?/changePassword"
				use:enhance={() =>
					async ({ update, result }) => {
						if (result.type === 'success') editing = null;
						await update({ reset: result.type === 'success' });
					}}
				class="mt-4 max-w-sm space-y-3"
			>
				<label class="block">
					<span class="eyebrow text-gray-500">Current password</span>
					<input
						name="currentPassword"
						type="password"
						required
						autocomplete="current-password"
						use:autofocus
						class={INPUT}
					/>
				</label>
				<label class="block">
					<span class="eyebrow text-gray-500">New password</span>
					<input
						name="newPassword"
						type="password"
						required
						minlength="8"
						autocomplete="new-password"
						class={INPUT}
					/>
				</label>
				<label class="block">
					<span class="eyebrow text-gray-500">New password again</span>
					<input
						name="confirmPassword"
						type="password"
						required
						minlength="8"
						autocomplete="new-password"
						class={INPUT}
					/>
				</label>
				<div class="flex gap-2">
					<button class="bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
						Change password
					</button>
					<button
						type="button"
						onclick={() => (editing = null)}
						class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>
						Cancel
					</button>
				</div>
			</form>
		{/if}
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

		{#if !confirming}
			<button
				onclick={() => (confirming = true)}
				class="mt-4 border border-red-200 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50"
			>
				Delete account
			</button>
		{:else}
			<form method="post" action="?/delete" use:enhance class="mt-4 space-y-3">
				<label class="block max-w-sm">
					<span class="eyebrow text-gray-500">Type {data.email} to confirm</span>
					<input name="email" autocomplete="off" required use:autofocus class={INPUT} />
				</label>
				<div class="flex gap-2">
					<button
						class="border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100"
					>
						Delete permanently
					</button>
					<button
						type="button"
						onclick={() => (confirming = false)}
						class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
					>
						Cancel
					</button>
				</div>
			</form>
		{/if}
	</section>
</div>
