<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/**
	 * Which row is asking to be sure.
	 *
	 * Promoting somebody hands them every account on the instance, and the
	 * button sits in a list you scroll — so it arms first, and the confirming
	 * button is `armed` so a double-click cannot land on it.
	 */
	let changing = $state<string | null>(null);

	const confirmed = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			changing = null;
			await update();
		};
	};

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
					<div
						class="account-row flex items-center gap-3 px-4 py-3"
						class:is-admin={account.role === 'admin' || account.isOwner}
					>
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

						{#if account.isOwner}
							<span class="badge-role badge-owner shrink-0">owner</span>
						{:else if account.role === 'admin'}
							<span class="badge-role badge-admin shrink-0">admin</span>
						{:else}
							<span class="eyebrow shrink-0 text-gray-500">{account.role}</span>
						{/if}

						{#if account.id === data.me}
							<!-- Your own keys are not yours to take: an instance whose last
							     administrator demoted themselves has nobody who can undo it. -->
							<span class="shrink-0 text-xs text-gray-500">you</span>
						{:else if account.isOwner}
							<span class="shrink-0 text-xs text-gray-500">always an admin</span>
						{:else if changing === account.id}
							<form
								method="post"
								action="?/setRole"
								use:enhance={confirmed}
								class="flex shrink-0 gap-2"
							>
								<input type="hidden" name="id" value={account.id} />
								<input
									type="hidden"
									name="role"
									value={account.role === 'member' ? 'admin' : 'member'}
								/>
								<button class="btn btn-sm btn-danger" use:armed>
									{account.role === 'member' ? 'Yes, make admin' : 'Yes, remove admin'}
								</button>
								<button type="button" class="btn btn-sm" onclick={() => (changing = null)}>
									Cancel
								</button>
							</form>
						{:else}
							<!-- Two steps, because an administrator can read and change every
							     account on the instance, and the button sits in a list you
							     scroll. -->
							<button class="btn btn-sm shrink-0" onclick={() => (changing = account.id)}>
								{account.role === 'member' ? 'Make admin' : 'Remove admin'}
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</Card>

	<!-- The narrow column: what happened, and what was stopped before it could. -->
	<div class="space-y-4">
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

		<!--
			The layer in front of the app, in the one place somebody looks after
			"is anything happening". Everything else on this page is something the
			app did; this is what never reached it.
		-->
		<Card title="Blocked" description="What fail2ban has turned away." flush>
			{#if !data.protection.readable}
				<div class="px-4 py-3 text-sm text-gray-500">
					<p class="text-gray-900">Nothing to read here yet.</p>
					<p class="mt-1">
						This instance cannot see <code class="text-xs">{data.protection.path}</code>. On Debian
						and Ubuntu that file belongs to the <code class="text-xs">adm</code> group:
					</p>
					<pre class="mt-2 overflow-x-auto text-xs">sudo usermod -aG adm $(whoami)</pre>
					<p class="mt-1">Then restart the app.</p>
				</div>
			{:else if data.protection.recent.length === 0}
				<EmptyState icon="shield" title="Nobody has been turned away" />
			{:else}
				<p class="border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
					{data.protection.today}
					{data.protection.today === 1 ? 'address' : 'addresses'} blocked today
				</p>
				<div class="divide-y divide-gray-200">
					{#each data.protection.recent as ban (ban.at + ban.address)}
						<div class="flex items-baseline gap-2 px-4 py-2 text-sm">
							<span class="min-w-0 flex-1 truncate">
								<span class="tabular text-gray-900">{ban.address}</span>
								<span class="block truncate text-xs text-gray-500">{ban.jail}</span>
							</span>
							<span class="shrink-0 text-xs text-gray-500">{ago(ban.at)}</span>
						</div>
					{/each}
				</div>
			{/if}
		</Card>
	</div>
</div>

<style>
	/*
	 * Administrators are the handful of accounts that can act on the others, so
	 * "who has the keys" should be answerable by looking rather than by reading.
	 *
	 * A rule down the side rather than a wash: a 6% tint is invisible on the
	 * dark theme and a heavier one is muddy on the light. A border is the same
	 * weight in both, and it is the idiom the cards already use.
	 */
	.account-row.is-admin {
		box-shadow: inset 3px 0 0 var(--section-accent);
		background-color: color-mix(in srgb, var(--section-accent) 10%, transparent);
	}

	.badge-role {
		border-radius: var(--radius-sm, 0);
		padding: 0.1rem 0.45rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.badge-admin {
		border: 1px solid color-mix(in srgb, var(--section-accent) 45%, transparent);
		color: var(--section-accent);
	}

	.badge-owner {
		background-color: var(--section-accent);
		color: var(--color-white);
	}
</style>
