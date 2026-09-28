<script lang="ts">
	import { momentOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { enhance } from '$lib/enhance';
	import OneLine from '$lib/components/OneLine.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import CopyBlock from '$lib/components/CopyBlock.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import SettingGroup from '$lib/components/SettingGroup.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/*
	 * Deleting is two steps, and the second is typing the address.
	 *
	 * Not a second click: a confirmation that appears where the first one was is
	 * a confirmation an accidental double-click walks straight through, and this
	 * is the one action in the app with nothing behind it to restore from. The
	 * address is also the thing that catches the real mistake — having the wrong
	 * account open, which no amount of "are you sure" ever catches.
	 */
	let deleting = $state(false);
	let typed = $state('');
	const matches = $derived(typed.trim().toLowerCase() === data.account.email.toLowerCase());

	/*
	 * And so is a role change, for the same reason in the other direction:
	 * granting admin hands somebody the power to delete every account here.
	 */
	let changingRole = $state(false);
	const nextRole = $derived(data.account.role === 'admin' ? 'member' : 'admin');

	function when(iso: string): string {
		return momentOf(iso, now());
	}

	function describe(detail: Record<string, unknown>): string {
		const parts = Object.entries(detail)
			.filter(([key]) => key !== 'actorId')
			.map(([key, value]) => `${key}: ${value}`);
		return parts.join(' · ');
	}
</script>

<!-- Only one of these, ever: `FormError` renders any message it is given, so
     handing it a successful one printed the same sentence twice. -->
<div class="space-y-4">
	<FormError message={form?.success ? null : form?.message} />

	{#if form?.success && form.message}
		<Banner kind="success">
			<p>{form.message}</p>
			{#if form.link}
				<div class="mt-2"><CopyBlock text={form.link} label={t('ui.copy')} /></div>
			{/if}
		</Banner>
	{/if}

	<!--
		One surface, the shape every settings screen has: the account's facts as
		rows, each with the verb that changes it at its right end, and its history
		under them. The verbs sat in one row of mixed buttons under the facts, so
		"Make admin" was a slipped click away from "Resend confirmation".
	-->
	<RoomSurface>
		<SettingGroup
			title={t('admin.id.theAccount')}
			description={data.account.name
				? `${data.account.email} · ${data.account.name}`
				: data.account.email}
		>
			<SettingRow label={t('admin.id.joined')}>
				{#snippet control()}
					<span class="tabular text-sm text-gray-900">{when(data.account.createdAt)}</span>
				{/snippet}
			</SettingRow>
			<SettingRow
				label={t('admin.id.addressConfirmed')}
				hint={!data.account.emailVerified && !data.emailConfigured
					? t('admin.id.thisInstanceHasNoMail')
					: ''}
			>
				{#snippet control()}
					{#if !data.account.emailVerified}
						<form method="post" action="?/resendVerification" use:enhance>
							<button class="btn btn-sm">
								<Icon name="link" />
								{data.emailConfigured
									? t('admin.id.resendConfirmation')
									: t('admin.id.getConfirmationLink')}
							</button>
						</form>
					{/if}
					<span class="text-sm text-gray-900"
						>{data.account.emailVerified ? t('admin.id.yes') : t('admin.id.no')}</span
					>
				{/snippet}
			</SettingRow>
			<SettingRow label={t('admin.id.role')}>
				{#snippet control()}
					{#if !data.self}
						<!-- Two steps: granting admin hands somebody the power to delete
						     every account here, so it is asked in a dialog of its own. -->
						<button class="btn btn-sm" onclick={() => (changingRole = true)}>
							<Icon name="shield" />
							{data.account.role === 'admin' ? t('admin.id.removeAdmin') : t('admin.id.makeAdmin')}
						</button>
					{/if}
					<span class="text-sm text-gray-900">{data.account.role}</span>
				{/snippet}
			</SettingRow>
			<SettingRow label={t('admin.id.signedInDevices')}>
				{#snippet control()}
					<span class="tabular text-sm text-gray-900">{data.account.sessions}</span>
				{/snippet}
			</SettingRow>
			<SettingRow label={t('admin.id.plan')}>
				{#snippet control()}
					{#if data.account.canGrantTrial}
						<!-- Only for an account with no plan history at all — one that
						     predates billing. A second trial is a discount, and discounts
						     belong to the payment provider. -->
						<form method="post" action="?/grantTrial" use:enhance>
							<button class="btn btn-sm">
								<Icon name="calendar" />
								{t('admin.id.startATrial')}
							</button>
						</form>
					{/if}
					{#if data.account.canEndPlan}
						<!-- The operator's clock: yesterday shows the lapsed view, a date
						     ahead stretches a test trial. Provider billing untouched. -->
						<form method="post" action="?/setPlanEnd" use:enhance class="flex items-center gap-2">
							<input
								type="date"
								name="endsAt"
								required
								aria-label={t('admin.id.endPlanThen')}
								value={data.account.planEndsAt ? data.account.planEndsAt.slice(0, 10) : ''}
								class="input input-sm w-auto"
							/>
							<button class="btn btn-sm shrink-0 whitespace-nowrap">
								<Icon name="clock" />
								{t('admin.id.endPlanThen')}
							</button>
						</form>
					{/if}
					<span class="text-sm text-gray-900">{data.account.plan ?? t('admin.id.noPlan')}</span>
				{/snippet}
			</SettingRow>
		</SettingGroup>

		<SettingGroup title={t('admin.id.history')} description={t('admin.id.whatThisAccountDidAnd')}>
			{#each data.events as event (event.id)}
				<div class="list-row">
					<div class="list-row-main">
						<p class="text-sm text-gray-900">
							{event.event.replaceAll('_', ' ')}
							{#if event.actorId}
								<span class="text-xs font-medium text-gray-600">
									{t('admin.id.byAnAdministrator')}</span
								>
							{/if}
						</p>
						{#if describe(event.detail)}
							<p class="text-xs break-all text-gray-500">{describe(event.detail)}</p>
						{/if}
					</div>
					<span class="tabular shrink-0 text-xs text-gray-500">{when(event.createdAt)}</span>
				</div>
			{:else}
				<EmptyState icon="clock" title={t('admin.id.nothingRecordedYet')} />
			{/each}
		</SettingGroup>
	</RoomSurface>

	<!-- The same closed red section the account page ends with. -->
	{#if !data.self && !data.account.isOwner}
		<details class="danger-zone">
			<summary class="danger-zone-title">
				<Icon name="chevron-right" size={12} class="danger-zone-mark" />
				{t('settings.account.dangerZone')}
			</summary>
			<div class="danger-zone-row">
				<div class="min-w-0">
					<h3 class="text-sm font-semibold text-gray-900">{t('admin.id.deleteThisAccount')}</h3>
					<p class="mt-1 max-w-2xl text-sm text-gray-600">{t('admin.id.everythingInItGoesIn')}</p>
				</div>
				<button
					class="btn btn-danger btn-sm shrink-0"
					onclick={() => ((deleting = true), (typed = ''))}
				>
					<Icon name="trash" />
					{t('admin.id.deleteThisAccount')}
				</button>
			</div>
		</details>

		<!--
			Deleting is typing the address, not a second click: a confirmation where
			the first press was is one a double-click walks straight through, and
			the address catches the real mistake — having the wrong account open.
		-->
		<Modal
			open={deleting}
			onclose={() => (deleting = false)}
			title={t('admin.id.deleteThisAccount')}
			description={t('admin.id.everyBlockEntryNoteGoal')}
			size="sm"
		>
			<form id="delete-account-form" method="post" action="?/deleteAccount" use:enhance>
				<FormGrid>
					<!-- One sentence with the address in it: assembled from "Type" and
					     "to confirm" around it, the verb came out as the noun. -->
					<Field
						label={t('admin.id.typeEmailToConfirm', { email: data.account.email })}
						span={12}
						required
					>
						<!-- The browser offering to fill in an address here would be
						     filling in the confirmation for you. -->
						<OneLine
							name="confirmEmail"
							placeholder={data.account.email}
							bind:value={typed}
							class="input"
							autocapitalize="none"
							autofocus
						/>
					</Field>
				</FormGrid>
			</form>
			{#snippet footer()}
				<button type="button" class="btn" onclick={() => (deleting = false)}
					>{t('ui.cancel')}</button
				>
				<button type="submit" form="delete-account-form" class="btn btn-danger" disabled={!matches}
					>{t('admin.id.deleteForGood')}</button
				>
			{/snippet}
		</Modal>
	{/if}

	{#if !data.self}
		<Modal
			open={changingRole}
			onclose={() => (changingRole = false)}
			title={nextRole === 'admin' ? t('admin.id.makeAdmin') : t('admin.id.removeAdmin')}
			size="sm"
		>
			<p class="text-sm text-gray-700">
				<strong class="font-semibold text-gray-900">{data.account.email}</strong>
				{nextRole === 'admin'
					? t('admin.id.willBeAbleToRead')
					: t('admin.id.keepsTheAccountAndLoses')}
			</p>
			<form
				id="role-form"
				method="post"
				action="?/setRole"
				use:enhance={() => {
					changingRole = false;
					return ({ update }) => update();
				}}
			>
				<input type="hidden" name="role" value={nextRole} />
			</form>
			{#snippet footer()}
				<button type="button" class="btn" onclick={() => (changingRole = false)}
					>{t('ui.cancel')}</button
				>
				<button type="submit" form="role-form" class="btn btn-danger" use:armed>
					{nextRole === 'admin' ? t('admin.id.makeAdmin') : t('admin.id.removeAdmin')}
				</button>
			{/snippet}
		</Modal>
	{/if}
</div>
