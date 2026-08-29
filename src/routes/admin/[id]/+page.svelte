<script lang="ts">
	import { enhance } from '$app/forms';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	function when(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function describe(detail: Record<string, unknown>): string {
		const parts = Object.entries(detail)
			.filter(([key]) => key !== 'actorId')
			.map(([key, value]) => `${key}: ${value}`);
		return parts.join(' · ');
	}
</script>

<!-- Only one of these, ever: `FormError` renders any message it is given, so
     handing it a successful one printed the same sentence twice, once in red. -->
<FormError message={form?.success ? null : form?.message} />

{#if form?.success && form.message}
	<Banner kind="success">
		<p>{form.message}</p>
		{#if form.link}
			<p class="tabular mt-2 border border-gray-200 bg-white px-2 py-1 text-xs break-all">
				{form.link}
			</p>
		{/if}
	</Banner>
{/if}

<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
	<Card title={data.account.email} description={data.account.name}>
		<dl class="space-y-2 text-sm">
			<div class="flex justify-between gap-4">
				<dt class="text-gray-500">Joined</dt>
				<dd class="tabular text-gray-900">{when(data.account.createdAt)}</dd>
			</div>
			<div class="flex justify-between gap-4">
				<dt class="text-gray-500">Address confirmed</dt>
				<dd class="text-gray-900">{data.account.emailVerified ? 'yes' : 'no'}</dd>
			</div>
			<div class="flex justify-between gap-4">
				<dt class="text-gray-500">Role</dt>
				<dd class="text-gray-900">{data.account.role}</dd>
			</div>
			<div class="flex justify-between gap-4">
				<dt class="text-gray-500">Signed-in devices</dt>
				<dd class="tabular text-gray-900">{data.account.sessions}</dd>
			</div>
			<div class="flex justify-between gap-4">
				<dt class="text-gray-500">Plan</dt>
				<dd class="text-gray-900">{data.account.plan ?? 'free'}</dd>
			</div>
		</dl>

		<div class="mt-4 flex flex-wrap gap-2 border-t border-gray-200 pt-4">
			{#if !data.account.emailVerified}
				<form method="post" action="?/resendVerification" use:enhance>
					<button class="btn btn-sm">
						<Icon name="link" />
						{data.emailConfigured ? 'Resend confirmation' : 'Get confirmation link'}
					</button>
				</form>
			{/if}

			{#if !data.self}
				<form method="post" action="?/setRole" use:enhance>
					<input
						type="hidden"
						name="role"
						value={data.account.role === 'admin' ? 'member' : 'admin'}
					/>
					<button class="btn btn-sm">
						{data.account.role === 'admin' ? 'Remove admin' : 'Make admin'}
					</button>
				</form>

				<!--
					Deliberately the same weight as a delete: signing in as somebody is
					reading their diary, and it is written down in their own history
					where they can see it.
				-->
				<form method="post" action="?/impersonate" use:enhance>
					<button class="btn btn-danger btn-sm" use:armed>
						<Icon name="user" /> Sign in as this account
					</button>
				</form>
			{/if}
		</div>

		{#if !data.emailConfigured}
			<p class="mt-3 text-xs text-gray-500">
				This instance has no mail server, so nothing can be emailed. Asking for a confirmation shows
				you the link to pass on yourself.
			</p>
		{/if}
	</Card>

	<Card title="History" description="What this account did, and what was done to it." flush>
		{#if data.events.length === 0}
			<EmptyState icon="clock" title="Nothing recorded yet" />
		{:else}
			<div class="divide-y divide-gray-200">
				{#each data.events as event (event.id)}
					<div class="flex items-baseline gap-3 px-4 py-2 text-sm">
						<span class="min-w-0 flex-1">
							<span class="text-gray-900">{event.event.replaceAll('_', ' ')}</span>
							{#if event.actorId}
								<span class="text-xs text-amber-700"> · by an administrator</span>
							{/if}
							{#if describe(event.detail)}
								<span class="block text-xs text-gray-500">{describe(event.detail)}</span>
							{/if}
						</span>
						<span class="tabular shrink-0 text-xs text-gray-500">{when(event.createdAt)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</Card>
</div>
