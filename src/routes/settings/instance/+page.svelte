<script lang="ts">
	import { enhance } from '$app/forms';
	import { armed } from '$lib/actions/armed';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { REGISTRATION_MODES } from '$lib/registration';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let confirmRevoke = $state<number | null>(null);
	let copied = $state<string | null>(null);

	/** Shown once, right after it is made: the code is no use on this page. */
	const fresh = $derived(
		form?.success && form.action === 'createInvite' ? (form.code ?? null) : null
	);

	const open = $derived(data.invites.filter((i) => !i.usedAt));
	const used = $derived(data.invites.filter((i) => i.usedAt));

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

	{#if form?.success && form.action !== 'createInvite'}
		<div class="border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">Saved.</div>
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		<Card title="Deployment" description="Where the server listens. Takes effect on restart.">
			<form method="post" action="?/save" use:enhance>
				<FormGrid>
					<Field label="Host" span={8}>
						<input name="host" type="text" value={data.config.server.host} class="input" />
					</Field>

					<Field label="Port" span={4}>
						<input
							name="port"
							type="number"
							min="1"
							max="65535"
							value={data.config.server.port}
							class="input tabular"
						/>
					</Field>
				</FormGrid>

				<div class="mt-4">
					<button class="btn btn-primary">Save deployment</button>
				</div>
			</form>
		</Card>

		<Card title="Database" description="Where your data is stored. Change it in config.toml.">
			<p
				class="tabular border border-gray-200 bg-gray-50 px-3 py-2 text-sm break-all text-gray-700"
			>
				{data.config.database.path}
			</p>
		</Card>
	</div>

	<Card
		title="Who can register"
		description="An instance on the open internet with sign-up left open is one that somebody else will use."
	>
		<form method="post" action="?/setRegistration" use:enhance class="space-y-3">
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

	<Card
		title="Invitations"
		description="A code somebody types when they create their account. It works once."
	>
		{#snippet actions()}
			<span class="eyebrow text-gray-400">{open.length} open</span>
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
			</div>
		{/if}

		<form method="post" action="?/createInvite" use:enhance>
			<FormGrid>
				<Field label="Who is it for" span={8} hint="For your own memory; they never see it.">
					<input name="note" autocomplete="off" placeholder="my brother" class="input" />
				</Field>

				<Field label="Expires in" span={4} hint="Days. Leave empty for no expiry.">
					<input name="expiresInDays" type="number" min="1" max="365" class="input tabular" />
				</Field>
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
							<span class="block text-xs text-gray-400">
								made {when(invite.createdAt)}
								{#if invite.usedAt}
									· used {when(invite.usedAt)}
								{:else if invite.expiresAt}
									· expires {when(invite.expiresAt)}
								{/if}
							</span>
						</span>

						{#if invite.usedAt}
							<span class="eyebrow shrink-0 text-gray-400">used</span>
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
