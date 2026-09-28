<script lang="ts">
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import Banner from '$lib/components/Banner.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import SettingGroup from '$lib/components/SettingGroup.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { ActionData, PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/** Which member's removal is waiting for its second, deliberate press. */
	let confirmRemove = $state<string | null>(null);
</script>

<div class="space-y-4">
	<FormError message={form?.message} />
	{#if form && 'invited' in form && form.invited}
		<Banner kind="success" message={t('settings.family.sentEmailToOpenAccount')} />
	{:else if form && 'added' in form && form.added}
		<Banner kind="success" message={t('settings.family.askedTheSeatIsTheirs')} />
	{:else if form && 'withdrawn' in form && form.withdrawn}
		<Banner kind="success" message={t('settings.family.offerIsWithdrawn')} />
	{/if}

	<!-- The shape every settings screen has: one surface, a band per subject. -->
	<RoomSurface>
		{#if data.seatOwner}
			<!--
				A seat grants access, never the ability to spend, so this side has the
				state of the plan and no buttons. The title is the whole message.
			-->
			<SettingGroup title={t('settings.family.youAreOnTheirPlan', { name: data.seatOwner.name })}>
				<p class="px-4 py-3 text-sm text-gray-600">
					{t('settings.family.everybodyKeepsTheirOwnWeek')}
				</p>
			</SettingGroup>
		{:else}
			<SettingGroup
				title={t('settings.family.whoIsOnYourPlan')}
				description={t('settings.family.planCoversAccounts', {
					seats: data.seats,
					more: data.seats - 1
				})}
			>
				<p class="px-4 py-3 text-sm text-gray-600">
					{t('settings.family.everybodyKeepsTheirOwnWeek')}
				</p>
				{#each data.members as member (member.id)}
					<div class="list-row">
						<div class="list-row-main">
							<p class="truncate text-sm text-gray-900">{member.name}</p>
							<p class="truncate text-xs text-gray-500">{member.email}</p>
						</div>
						<!-- Two presses: taking a seat away locks a person out of writing
						     until somebody pays, which one slipped click must never do. -->
						<form
							method="post"
							action="?/removeSeat"
							use:enhance={() =>
								async ({ update }) => {
									confirmRemove = null;
									await update();
								}}
							class="list-row-actions"
						>
							<input type="hidden" name="member" value={member.id} />
							{#if confirmRemove === member.id}
								<button class="btn btn-danger btn-sm" use:armed
									>{t('settings.family.takeThemOffThePlan')}</button
								>
								<button
									type="button"
									onclick={() => (confirmRemove = null)}
									class="icon-btn"
									title={t('settings.family.keepThem')}
									aria-label={t('settings.family.keepThem')}><Icon name="close" /></button
								>
							{:else}
								<button
									type="button"
									onclick={() => (confirmRemove = member.id)}
									class="icon-btn icon-btn-danger"
									title={t('settings.family.takeThemOffThisPlan')}
									aria-label={t('settings.family.takeThemOffThisPlan')}
								>
									<Icon name="trash" />
								</button>
							{/if}
						</form>
					</div>
				{/each}

				{#if data.members.length + data.invited.length < data.seats - 1}
					<SettingRow
						label={t('settings.family.addToMyPlan')}
						hint={t('settings.family.withAnAccountHereThey')}
					>
						{#snippet control()}
							<form method="post" action="?/addSeat" use:enhance class="flex flex-wrap gap-2">
								<input
									name="who"
									type="email"
									required
									aria-label={t('settings.family.theirEmailAddress')}
									placeholder={t('settings.family.theirEmailAddress')}
									class="input input-sm w-64 max-w-full"
								/>
								<button class="btn btn-sm btn-primary">
									<Icon name="plus" />
									{t('settings.family.addToMyPlan')}
								</button>
							</form>
						{/snippet}
					</SettingRow>
				{:else}
					<p class="px-4 py-3 text-sm text-gray-500">{t('settings.family.everySeatIsTaken')}</p>
				{/if}
			</SettingGroup>

			{#if data.invited.length > 0}
				<!--
					Offers, not members. An account that already existed is asked
					rather than moved, so these sit apart from the seats in use — and
					each one can be taken back.
				-->
				<SettingGroup title={t('settings.family.waitingForAnAnswer')}>
					{#each data.invited as person (person.id)}
						<div class="list-row">
							<div class="list-row-main">
								<p class="truncate text-sm text-gray-900">{person.email}</p>
								<p class="truncate text-xs text-gray-500">{t('settings.family.askedTheSeatIs')}</p>
							</div>
							<form method="post" action="?/withdrawInvite" use:enhance class="list-row-actions">
								<input type="hidden" name="member" value={person.id} />
								<button
									class="icon-btn"
									title={t('settings.family.withdraw')}
									aria-label={t('settings.family.withdraw')}><Icon name="undo" /></button
								>
							</form>
						</div>
					{/each}
				</SettingGroup>
			{/if}
		{/if}
	</RoomSurface>
</div>
