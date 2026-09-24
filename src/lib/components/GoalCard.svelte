<script lang="ts">
	/**
	 * One goal, wherever a goal is shown.
	 *
	 * This was written inside the goals page, which is why a notebook's Goals
	 * tab was a list of titles you could look at and nothing else: no edit, no
	 * delete, no way to say a goal was achieved or missed, and no sight of what
	 * counts towards it. The verbs were not missing from the app — they were
	 * written into one page's markup.
	 *
	 * So it is a component, the way `TodoRows` already is. Where it posts is a
	 * prop (`$lib/goal-action-names`), because a notebook page answers to
	 * `update` and `delete` for the notebook itself; what it posts to is the
	 * same handler either way (`$lib/services/goal-actions`).
	 */
	import Icon from '$lib/components/Icon.svelte';
	import Written from '$lib/components/Written.svelte';
	import NumberBox from '$lib/components/NumberBox.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { pillStyle } from '$lib/pill-ink';
	import { enhance } from '$lib/enhance';
	import { invalidateAll } from '$app/navigation';
	import { armed } from '$lib/actions/armed';
	import { cancelFor, changeNow, isPending } from '$lib/undo.svelte';
	import { COUNT_STEP } from '$lib/number-kinds';
	import { describePeriod, isGoalStatus, STATUS_LABELS } from '$lib/goals';
	import type { GoalActionNames } from '$lib/goal-action-names';
	import { useT } from '$lib/i18n';
	import { useWhen } from '$lib/when-context.svelte';

	/** What a card needs off a goal — `listGoals` gives exactly this. */
	type Shown = {
		id: number;
		title: string;
		notes: string | null;
		status: string;
		horizon: Parameters<typeof describePeriod>[2];
		periodStart: string;
		parentId: number | null;
		areaId: number | null;
		notebookId: number | null;
		areaName: string | null;
		areaColor: string | null;
		linkedSlotIds: number[];
		linkedTodoIds: number[];
		linkedActivityIds: number[];
		progress: { done: number | null; total: number | null; fraction: number | null };
		targets: {
			id: number;
			unit: string;
			whole: boolean;
			targetValue: number;
			currentValue: number;
			fraction: number;
			measureActivity: string | null;
		}[];
	};

	let {
		goal,
		goals,
		allTodos,
		slots,
		activities,
		actions,
		accent,
		onedit,
		onlink,
		selected = false
	}: {
		goal: Shown;
		/** The others, only so a nested goal can name its parent. */
		goals: { id: number; title: string }[];
		allTodos: { id: number; title: string; status: string }[];
		slots: { id: number; name: string; startTime: string }[];
		activities: { id: number; name: string }[];
		actions: GoalActionNames;
		/** The colour a bar takes where the goal's area has none. */
		accent: string;
		/* By id: the page holds the whole goal already, and handing back a
		   narrowed copy of it would make the caller widen it again. */
		onedit: (id: number) => void;
		onlink: (id: number) => void;
		/** Where the keyboard's cursor is, on a page that has one. */
		selected?: boolean;
	} = $props();

	const t = useT();
	const now = useWhen();

	/* Both of these are about this one card, so they live on it: the page had
	   to hold an id for each and compare it on every row. */
	let confirmingDelete = $state(false);
	let openTasks = $state(false);

	function percent(g: Shown): number | null {
		return g.progress.fraction === null ? null : Math.round(g.progress.fraction * 100);
	}

	const linkedCount = $derived(
		goal.linkedSlotIds.length + goal.linkedTodoIds.length + goal.linkedActivityIds.length
	);

	/** The bar's width, or nothing where there is nothing to count. */
	const pct = $derived(percent(goal));

	function progressLabel(g: Shown): string {
		// The tasks, when there are any: the measures under them say the rest.
		if (g.progress.total)
			return t('goals.doneOfTotal', { done: g.progress.done ?? 0, total: g.progress.total });
		if (g.progress.total === 0 && g.targets.length === 0) return t('goals.nothingCountedYet');
		// One measure reads as itself; several are listed under the bar, so the
		// line above them says how many rather than repeating the first.
		if (g.targets.length === 1) {
			const one = g.targets[0];
			return `${one.currentValue} / ${one.targetValue} ${one.unit}`.trim();
		}
		if (g.targets.length > 1) return t('goals.measuresCount', { count: g.targets.length });
		return t('goals.noMeasureSet');
	}

	/**
	 * Close a goal, in a few seconds, unless it was a slip.
	 *
	 * The same shape the board uses for ticking a task off: the screen shows the
	 * outcome at once and so does the server: holding the request made the card
	 * and everything counted from it disagree for the length of a toast. Undo
	 * reopens the goal, which is an ordinary write. A second press inside the
	 * window is the same gesture as pressing Undo.
	 */
	function closeLater(status: 'achieved' | 'missed') {
		const key = `goal:${goal.id}`;
		if (isPending(key)) {
			cancelFor(key);
			return;
		}

		const write = (to: string) => {
			const body = new FormData();
			body.set('id', String(goal.id));
			body.set('status', to);
			return fetch(`${location.pathname}${actions.close}`, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			}).then(() => invalidateAll());
		};

		const said = status === 'achieved' ? t('goals.achieved') : t('goals.missed');
		// `close` reopens too — it clears the closing date for `open` — so Undo
		// is the same action in the other direction.
		changeNow(
			key,
			`${said} — ${goal.title}`,
			() => write(status),
			() => write('open')
		);
	}
</script>

<!--
	Named so anything that belongs to this goal can link straight at it.

	The padding is the row's own, not the list's: a list inset inside its card
	left the hover wash as a square floating in the card's padding, and a row
	that reaches the card's edges takes the card's corners instead.
-->
<div
	id="goal-{goal.id}"
	class="goal-row px-4 py-3 target:bg-yellow-50 {selected ? 'kbd-cursor' : ''}"
>
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1">
			<p
				class="text-sm leading-snug font-medium break-words {goal.status !== 'open'
					? 'text-gray-500'
					: 'text-gray-900'}"
			>
				{goal.title}
			</p>
			<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
				{#if goal.areaName}
					<span class="pill" style={pillStyle(goal.areaColor)}>{goal.areaName}</span>
				{/if}
				<span class="tabular">{describePeriod(t, now(), goal.horizon, goal.periodStart)}</span>
				{#if goal.parentId}
					{@const parent = goals.find((g) => g.id === goal.parentId)}
					{#if parent}
						<span>{t('goals.partOf2', { title: parent.title })}</span>
					{/if}
				{/if}
				{#if goal.status !== 'open' && isGoalStatus(goal.status)}
					<span class="eyebrow text-gray-600"
						>{t(STATUS_LABELS[goal.status as keyof typeof STATUS_LABELS])}</span
					>
				{/if}
			</div>
		</div>

		<!--
			How it ended, then edit and delete — icons, at the same place on
			every row. Closing waits a few seconds before it is final, the way
			ticking a task off does, so a slip is one press on Undo.
		-->
		<div class="row-actions">
			{#if goal.status === 'open'}
				<button
					type="button"
					class="icon-btn"
					title={t('goals.achieved')}
					aria-label={t('goals.achieved')}
					onclick={() => closeLater('achieved')}
				>
					<Icon name="check" />
				</button>
				<button
					type="button"
					class="icon-btn"
					title={t('goals.missed')}
					aria-label={t('goals.missed')}
					onclick={() => closeLater('missed')}
				>
					<Icon name="close" />
				</button>
			{:else}
				<form method="post" action={actions.close} use:enhance class="contents">
					<input type="hidden" name="id" value={goal.id} />
					<input type="hidden" name="status" value="open" />
					<button class="icon-btn" title={t('goals.reopen')} aria-label={t('goals.reopen')}>
						<Icon name="undo" />
					</button>
				</form>
			{/if}
			<button
				type="button"
				title={t('ui.edit')}
				aria-label={t('ui.edit')}
				onclick={() => onedit(goal.id)}
				class="icon-btn"><Icon name="edit" /></button
			>
			<button
				type="button"
				title={t('ui.delete')}
				aria-label={t('ui.delete')}
				onclick={() => (confirmingDelete = true)}
				class="icon-btn icon-btn-danger"><Icon name="trash" /></button
			>
		</div>
	</div>

	{#if goal.notes}
		<Written content={goal.notes} compact class="mt-1" />
	{/if}

	<!-- No bar without a measure. An empty track under a goal with nothing to
	     count reads as "0%", which is a claim about progress rather than the
	     absence of one. -->
	<div class="mt-2 flex items-center gap-3">
		{#if pct !== null}
			<div class="h-1.5 min-w-16 flex-1 bg-gray-200 sm:max-w-xs">
				<div
					class="h-full"
					style="width: {pct}%; background-color: {goal.areaColor ?? accent}"
				></div>
			</div>
		{/if}
		<span class="tabular shrink-0 text-xs text-gray-600">
			{progressLabel(goal)}{pct !== null ? ` · ${pct}%` : ''}
		</span>
	</div>

	<!--
		Every measure the goal was given, each with the number it stands at. A
		goal counted from linked tasks keeps them visible and editable: they are
		what somebody typed in, and hiding them because a todo got attached
		loses the record.
	-->
	{#if goal.targets.length > 0}
		<div class="mt-1.5 space-y-1">
			{#each goal.targets as target (target.id)}
				<form
					method="post"
					action={actions.setProgress}
					use:enhance
					class="flex flex-wrap items-center gap-2"
				>
					<input type="hidden" name="targetId" value={target.id} />
					<!--
						A measure counted from the workouts is read, not typed: the
						sum of what the register holds for that activity inside the
						goal's period. A box here would let somebody write a total
						their own sessions contradict.
					-->
					{#if target.measureActivity}
						<span class="chip shrink-0" title={t('goals.countedFromYourWorkouts')}>
							<Icon name="health" size={12} class="mr-1" />
							{target.measureActivity}
						</span>
						<span class="tabular text-xs text-gray-700">
							{target.currentValue}
						</span>
					{:else if target.whole}
						<!--
							A thing you count moves one at a time: each button carries
							the new number, so a press is the whole gesture. A measured
							one keeps its field, because 14.6 is not two presses away
							from anything.
						-->
						<button
							class="icon-btn"
							name="currentValue"
							value={Math.max(0, target.currentValue - COUNT_STEP)}
							disabled={target.currentValue <= 0}
							title={t('goals.oneFewer')}
							aria-label={t('goals.oneFewerUnit', {
								unit: target.unit || t('goals.towardsThis')
							}).trim()}
						>
							<Icon name="minus" />
						</button>
						<span class="tabular min-w-4 text-center text-xs text-gray-700">
							{target.currentValue}
						</span>
						<button
							class="icon-btn"
							name="currentValue"
							value={target.currentValue + COUNT_STEP}
							title={t('goals.oneMore')}
							aria-label={t('goals.oneMoreUnit', {
								unit: target.unit || t('goals.towardsThis')
							}).trim()}
						>
							<Icon name="plus" />
						</button>
					{:else}
						<NumberBox
							autocomplete="off"
							name="currentValue"
							min="0"
							step="any"
							value={target.currentValue}
							aria-label={t('goals.progressTowards', {
								value: target.targetValue,
								unit: target.unit
							}).trim()}
							class="w-20"
						/>
					{/if}
					<span class="tabular text-xs text-gray-500">
						/ {target.targetValue}
						{target.unit}
					</span>
					<div class="h-1 w-16 shrink-0 bg-gray-200">
						<div
							class="h-full"
							style="width: {Math.round(target.fraction * 100)}%;
								background-color: {goal.areaColor ?? accent}"
						></div>
					</div>
					{#if !target.whole && !target.measureActivity}
						<button
							class="icon-btn"
							title={t('goals.saveProgress')}
							aria-label={t('goals.saveProgress')}
						>
							<Icon name="check" />
						</button>
					{/if}
				</form>
			{/each}
		</div>
	{/if}

	<!--
		What counts towards this goal. It reveals a part of this card, so it
		starts where the card's text starts rather than in a button's padding.
	-->
	<button
		type="button"
		onclick={() => (openTasks = !openTasks)}
		class="goal-fold mt-1.5"
		aria-expanded={openTasks}
		title={t('goals.whatCountsTowardsThisGoal')}
		>{t('goals.tasks', { length: linkedCount })}<Icon
			name={openTasks ? 'chevron-up' : 'chevron-down'}
			size={12}
		/>
	</button>

	{#if openTasks}
		<!--
			What already counts, on the card. The modal is for choosing; this is
			for looking and ticking.
		-->
		<div class="goal-tasks mt-1 border-l-2 border-gray-200 pl-3">
			{#each allTodos.filter((t) => goal.linkedTodoIds.includes(t.id)) as todo (todo.id)}
				<form method="post" action={actions.setTodoStatus} use:enhance class="contents">
					<input type="hidden" name="todoId" value={todo.id} />
					<input type="hidden" name="status" value={todo.status === 'done' ? 'todo' : 'done'} />
					<label class="flex cursor-pointer items-center gap-2 py-1 text-sm">
						<input
							type="checkbox"
							checked={todo.status === 'done'}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
							class="h-3.5 w-3.5"
						/>
						<span class={todo.status === 'done' ? 'text-gray-500' : 'text-gray-800'}
							>{todo.title}</span
						>
					</label>
				</form>
			{/each}

			{#each slots.filter((sl) => goal.linkedSlotIds.includes(sl.id)) as sl (sl.id)}
				<p class="py-1 text-xs text-gray-500">
					<span class="tabular">{sl.startTime}</span>{t('goals.everyWeekIts', {
						name: sl.name
					})}
				</p>
			{/each}
			{#each activities.filter((a) => goal.linkedActivityIds.includes(a.id)) as a (a.id)}
				<p class="py-1 text-xs text-gray-500">
					{t('goals.everyBlockOf', { name: a.name })}
				</p>
			{/each}

			{#if linkedCount === 0}
				<p class="py-1 text-xs text-gray-500">
					{t('goals.nothingLinkedYetProgress')}
				</p>
			{/if}

			<button type="button" class="btn btn-sm mt-2" onclick={() => onlink(goal.id)}>
				{t('goals.chooseTasks')}
			</button>
		</div>
	{/if}
</div>

<Modal bind:open={confirmingDelete} title={t('goals.deleteGoal')} size="sm">
	<p class="text-sm text-gray-700">{t('goals.deleteGoalBody', { title: goal.title })}</p>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmingDelete = false)}
			>{t('ui.cancel')}</button
		>
		<form
			method="post"
			action={actions.remove}
			use:enhance={() =>
				async ({ update }) => {
					confirmingDelete = false;
					await update();
				}}
		>
			<input type="hidden" name="id" value={goal.id} />
			<button class="btn btn-danger" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>

<style>
	/*
	 * A disclosure that reads as part of the text column: no box, no inset, the
	 * same small type as the lines around it.
	 */
	.goal-fold {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		line-height: 1rem;
		color: var(--color-gray-600);
	}

	.goal-fold:hover {
		color: var(--color-gray-900);
		text-decoration: underline;
	}

	/* A rule down one side is a line, not a box: it has no corners to round. */
	.goal-tasks {
		border-radius: 0;
	}

	/*
	 * The rail comes up for the whole goal, not only its title line: a pointer
	 * on a measure is a pointer on this goal.
	 */
	@media (hover: hover) {
		.goal-row:hover .row-actions,
		.goal-row:focus-within .row-actions {
			opacity: 1;
		}
	}
</style>
