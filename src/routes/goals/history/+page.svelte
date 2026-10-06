<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import GoalCard from '$lib/components/GoalCard.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import { GOAL_ROOM_ACTIONS } from '$lib/goal-action-names';
	import { useT } from '$lib/i18n';
	import { useWhen } from '$lib/when-context.svelte';
	import { civilOf } from '$lib/when';
	import type { ActionData, PageServerData } from './$types';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
</script>

<div class="space-y-4">
	<FormError message={form?.message} />

	<RoomSurface dataTour="goal-history">
		{#if data.goals.length === 0}
			<EmptyState
				icon="trophy"
				title={t('goals.historyEmpty')}
				description={t('goals.historyEmptyBody')}
			/>
		{:else}
			<!--
				Every closed goal, newest first, with its history open: here the
				history is the point. Reopening one (its cup) sends it back to the
				Goals tab; a note can be added to any of them.
			-->
			<div class="divide-y divide-gray-200">
				{#each data.goals as goal (goal.id)}
					<section aria-label={goal.title}>
						<p class="eyebrow border-b border-gray-200 bg-gray-50 px-4 py-1.5 text-gray-600">
							{t('goals.closedOn', { date: civilOf(goal.closedAt, now()) })}
						</p>
						<GoalCard
							{goal}
							goals={data.goals}
							allTodos={data.allTodos}
							slots={data.slots}
							activities={data.activities}
							actions={GOAL_ROOM_ACTIONS}
							historyOpen
						/>
					</section>
				{/each}
			</div>
		{/if}
	</RoomSurface>
</div>
