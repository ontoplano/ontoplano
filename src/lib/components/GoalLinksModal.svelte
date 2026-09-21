<script lang="ts">
	/**
	 * Choosing what counts towards a goal.
	 *
	 * The same modal in the goals room and inside a notebook, so the two
	 * cannot drift — which they already had in the smaller case this came out
	 * of, where a notebook's goals could not be linked to anything at all.
	 * Where it posts is a prop, for the reason given in
	 * `$lib/goal-action-names`.
	 */
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { enhance } from '$lib/enhance';
	import { useT } from '$lib/i18n';

	type Linkable = {
		id: number;
		linkedSlotIds: number[];
		linkedTodoIds: number[];
		linkedActivityIds: number[];
	};

	let {
		goal = null,
		activities = [],
		slots = [],
		todos = [],
		allTodos = [],
		action,
		error = undefined,
		onclose
	}: {
		/** The goal being linked, or null when the modal is shut. */
		goal?: Linkable | null;
		activities?: { id: number; name: string }[];
		slots?: { id: number; name: string; startTime: string }[];
		/** The open ones, which is what a picker should offer. */
		todos?: { id: number; title: string }[];
		/** Every one, for the done ones this goal already counts. */
		allTodos?: { id: number; title: string; status: string }[];
		action: string;
		error?: string | undefined;
		onclose: () => void;
	} = $props();

	const t = useT();

	/*
	 * The rest of the finished list, on request. A goal made of work already
	 * done is the exception, and forty struck-through lines are not a picker.
	 */
	let showDoneTodos = $state(false);

	/* A fresh goal opens with the finished ones folded away again. */
	let lastGoal: number | null = null;
	$effect(() => {
		const id = goal?.id ?? null;
		if (id === lastGoal) return;
		lastGoal = id;
		showDoneTodos = false;
	});
</script>

<Modal
	open={goal !== null}
	{error}
	{onclose}
	title={t('goals.linkedTasks')}
	description={t('goals.linkedTasksMakeProgress')}
	size="lg"
>
	{#if goal}
		<form
			id="links-form"
			method="post"
			{action}
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					onclose();
				}}
		>
			<input type="hidden" name="id" value={goal.id} />

			<div class="grid gap-4 sm:grid-cols-3">
				<div>
					<span class="eyebrow text-gray-600">{t('goals.activities')}</span>
					<div class="mt-2 max-h-64 space-y-1 overflow-y-auto">
						{#each activities as a (a.id)}
							<label class="flex items-center gap-2 text-sm text-gray-700">
								<input
									type="checkbox"
									name="activityId"
									value={a.id}
									checked={goal.linkedActivityIds.includes(a.id)}
									class="h-3 w-3"
								/>
								{a.name}
							</label>
						{:else}
							<EmptyState icon="planner" title={t('goals.noActivitiesYet')} compact />
						{/each}
					</div>
				</div>
				<div>
					<span class="eyebrow text-gray-600">{t('goals.weeklyBlocks')}</span>
					<div class="mt-2 max-h-64 space-y-1 overflow-y-auto">
						{#each slots as sl (sl.id)}
							<label class="flex items-center gap-2 text-sm text-gray-700">
								<input
									type="checkbox"
									name="slotId"
									value={sl.id}
									checked={goal.linkedSlotIds.includes(sl.id)}
									class="h-3 w-3"
								/>
								<span class="tabular">{sl.startTime}</span>
								{sl.name}
							</label>
						{:else}
							<EmptyState icon="calendar" title={t('goals.noWeeklyBlocksYet')} compact />
						{/each}
					</div>
				</div>
				<div>
					<span class="eyebrow text-gray-600">{t('goals.toDos')}</span>
					<div class="mt-2 max-h-64 space-y-1 overflow-y-auto">
						<!--
							Open to-dos, plus any DONE one this goal already counts.

							setGoalLinks replaces the whole set, which is only safe while
							this form shows a checkbox for everything linked — and it
							stopped: done to-dos left the list, so saving the form silently
							unlinked them and the progress bar dropped. They stay here,
							ticked and struck through, until somebody unticks them; the
							rest of the finished list unfolds on request below, so a goal
							can also count something already done.
						-->
						{#each [...todos, ...allTodos.filter((t) => t.status === 'done' && (showDoneTodos || goal.linkedTodoIds.includes(t.id)))] as t (t.id)}
							<label class="flex items-center gap-2 text-sm text-gray-700">
								<input
									type="checkbox"
									name="todoId"
									value={t.id}
									checked={goal.linkedTodoIds.includes(t.id)}
									class="h-3 w-3"
								/>
								<span class={'status' in t && t.status === 'done' ? 'text-gray-400' : ''}
									>{t.title}</span
								>
							</label>
						{:else}
							<p class="text-xs text-gray-500">{t('goals.noOpenTodos')}</p>
						{/each}
					</div>
					{#if !showDoneTodos}
						<button
							type="button"
							class="btn btn-sm btn-quiet mt-2"
							onclick={() => (showDoneTodos = true)}
						>
							{t('goals.showCompletedToDos')}
						</button>
					{/if}
				</div>
			</div>
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={onclose}>{t('ui.cancel')}</button>
		<button type="submit" form="links-form" class="btn btn-primary">{t('goals.saveLinks')}</button>
	{/snippet}
</Modal>
