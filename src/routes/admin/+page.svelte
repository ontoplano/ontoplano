<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { ROLES } from '$lib/roles';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function ago(iso: string): string {
		const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return when(iso);
	}
</script>

<FormError message={form?.message} />

<div class="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
	<Card title="Accounts" description="Search by name or address. Newest first when empty." flush>
		<form method="get" class="flex gap-2 border-b border-gray-200 p-3">
			<input
				name="q"
				value={data.query}
				placeholder="somebody@example.com"
				autocomplete="off"
				class="input"
			/>
			<button class="btn btn-sm"><Icon name="search" /> Search</button>
		</form>

		{#if data.accounts.length === 0}
			<EmptyState icon="user" title="Nobody matches that" />
		{:else}
			<div class="divide-y divide-gray-200">
				{#each data.accounts as account (account.id)}
					<div class="flex items-center gap-3 px-4 py-3">
						<a
							href="{resolve('/admin')}/{account.id}"
							class="min-w-0 flex-1 text-sm text-gray-900 hover:underline"
						>
							{account.email}
							<span class="block text-xs text-gray-500">
								{account.name} · joined {when(account.createdAt)} ·
								{account.sessions}
								{account.sessions === 1 ? 'session' : 'sessions'}
								{#if !account.emailVerified}· unverified{/if}
							</span>
						</a>

						<span class="eyebrow shrink-0 text-gray-500">{account.role}</span>

						{#if account.role === 'member'}
							<form method="post" action="?/setRole" use:enhance class="shrink-0">
								<input type="hidden" name="id" value={account.id} />
								<input type="hidden" name="role" value="admin" />
								<button class="btn btn-sm">Make admin</button>
							</form>
						{:else}
							<form method="post" action="?/setRole" use:enhance class="shrink-0">
								<input type="hidden" name="id" value={account.id} />
								<input type="hidden" name="role" value="member" />
								<button class="btn btn-sm">Remove admin</button>
							</form>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</Card>

	<Card title="Lately" description="Every account's history in one column, newest first." flush>
		{#if data.events.length === 0}
			<EmptyState icon="clock" title="Nothing recorded yet" />
		{:else}
			<div class="divide-y divide-gray-200">
				{#each data.events as event (event.id)}
					<div class="flex items-baseline gap-2 px-4 py-2 text-sm">
						<span class="min-w-0 flex-1 truncate">
							<span class="text-gray-900">{event.event.replaceAll('_', ' ')}</span>
							<span class="block truncate text-xs text-gray-500">{event.email}</span>
						</span>
						<span class="shrink-0 text-xs text-gray-500">{ago(event.createdAt)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</Card>
</div>

<p class="text-xs text-gray-500">
	Roles: {ROLES.join(', ')}. An administrator cannot change their own — the instance would be left
	with nobody who can promote anyone.
</p>
