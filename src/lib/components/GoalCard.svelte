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
	import NumberBox from '$lib/components/NumberBox.svelte';
	import { enhance } from '$lib/enhance';
	import { invalidateAll } from '$app/navigation';
	import { armed } from '$lib/actions/armed';
	import { cancelFor, changeNow, isPending } from '$lib/undo.svelte';
	import { COUNT_STEP } from '$lib/number-kinds';
	import { describePeriod } from '$lib/goals';
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
		onlink
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

<!-- Named so anything that belongs to this goal can link straight at it. -->
<div id="goal-{goal.id}" class="py-3 target:bg-yellow-50">
	<!-- The buttons do not shrink, so on a phone they used to squeeze
		     the title into a one-word-per-line ribbon. Below `sm` they go
		     underneath instead. -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start">
		<div class="flex min-w-0 flex-1 items-start gap-3">
			<span
				class="mt-1 h-4 w-1 shrink-0"
				style="background-color: {goal.areaColor ?? '#d1d5db'}"
				title={goal.areaName ?? t('goals.noArea')}
			></span>

			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-baseline gap-2">
					<span
						class="text-sm font-medium {goal.status !== 'open' ? 'text-gray-400' : 'text-gray-900'}"
						>{goal.title}</span
					>
					<span class="tabular text-xs text-gray-500"
						>{describePeriod(t, now(), goal.horizon, goal.periodStart)}</span
					>
					{#if goal.parentId}
						{@const parent = goals.find((g) => g.id === goal.parentId)}
						{#if parent}
							<span class="text-xs text-gray-500"
								>{t('goals.partOf2', { title: parent.title })}</span
							>
						{/if}
					{/if}
					{#if goal.status !== 'open'}
						<span class="eyebrow text-gray-600">{goal.status}</span>
					{/if}
				</div>

				{#if goal.notes}
					<p class="mt-0.5 text-xs text-gray-500">{goal.notes}</p>
				{/if}

				<!-- No bar without a measure. An empty track under a goal with
					     nothing to count reads as "0%", which is a claim about
					     progress rather than the absence of one. -->
				<div class="mt-2 flex items-center gap-3">
					{#if pct !== null}
						<!-- Grows into the width instead of leaving it empty: on a
							     phone a fixed 6rem bar left two thirds of the row blank. -->
						<div class="h-1.5 min-w-24 flex-1 bg-gray-200 sm:max-w-40 sm:flex-none">
							<div
								class="h-full"
								style="width: {pct}%; background-color: {goal.areaColor ?? accent}"
							></div>
						</div>
					{/if}
					<span class="tabular text-xs text-gray-500">
						{progressLabel(goal)}{pct !== null ? ` · ${pct}%` : ''}
					</span>
				</div>

				<!--
						Every measure the goal was given, each with the number it
						stands at. A goal counted from linked tasks keeps them
						visible and editable: they are what somebody typed in, and
						hiding them because a todo got attached loses the record.
					-->
				{#if goal.targets.length > 0}
					<div class="mt-2 space-y-1">
						{#each goal.targets as target (target.id)}
							<form
								method="post"
								action={actions.setProgress}
								use:enhance
								class="flex flex-wrap items-center gap-2"
							>
								<input type="hidden" name="targetId" value={target.id} />
								<!--
										A measure counted from the workouts is read, not typed.

										The number is the sum of what the register holds for
										that activity inside the goal's period, so there is
										nothing to press: a box here would let somebody write
										a total their own sessions contradict, with nothing on
										screen to say which one is true. The word it counts is
										shown instead, so the figure is not a mystery.
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
											A thing you count moves one at a time.

											Twelve books is finished a book at a time, and
											reaching for a keyboard to turn 3 into 4 is absurd —
											so a counted measure gets a minus and a plus, each of
											which is the whole gesture: the button carries the new
											number, so a press is a submit and there is nothing to
											save afterwards. A measured one keeps its field,
											because 14.6 is not two presses away from anything.
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
									<span class="tabular text-xs text-gray-700">
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
						What counts towards this goal, under the goal rather than
						among the buttons that close it. It reveals a part of this
						card, so it belongs to the card's own column.
					-->
				<button
					onclick={() => (openTasks = !openTasks)}
					class="btn btn-sm btn-quiet mt-2"
					title={t('goals.whatCountsTowardsThisGoal')}
					>{t('goals.tasks', {
						length:
							goal.linkedSlotIds.length + goal.linkedTodoIds.length + goal.linkedActivityIds.length
					})}<Icon name={openTasks ? 'chevron-up' : 'chevron-down'} size={12} />
				</button>
			</div>
		</div>

		<!--
				The controls, in three treatments, starting wherever the goal's
				text happened to end. The rail puts them at the same place on
				every row, and the two that matter — how it ended — keep their
				words, because "achieved" and "missed" are a judgement you make
				once and not a routine action you would recognise from a glyph.

				Four of them, not five: "Tasks (n)" went back to the goal's own
				column below. It is a disclosure for what is already on the card
				and not something done to the goal, and as the rail's fifth
				member it was what pushed the row past the width of a phone —
				which put delete on a line of its own, alone, in the corner.
			-->
		<!--
				The words on the left, under the goal's own text; the two
				glyphs against the right edge. On a phone the whole rail sat
				left and the right half of the card was air.
			-->
		<!--
				Full width only where the card is a column.

				`.row-actions` is `flex: none`, so `w-full` on a row makes
				it take the whole width and the text beside it collapses to
				one character per line. That is what a goal card did on a
				desktop: the title read downwards, a letter at a time.
			-->
		<div class="row-actions w-full gap-1 sm:w-auto">
			{#if goal.status === 'open'}
				<!--
						Closing a goal is a verdict on months of work, and it was
						one click with nothing between the click and the verdict.
						Both answers wait a few seconds now, the way ticking a
						task off does.
					-->
				<button
					type="button"
					class="btn btn-sm"
					title={t('goals.closeItAsDone')}
					onclick={() => closeLater('achieved')}
				>
					{t('goals.achieved')}
				</button>
				<button
					type="button"
					class="btn btn-sm btn-quiet"
					title={t('goals.closeItAsNotDone')}
					onclick={() => closeLater('missed')}
				>
					{t('goals.missed')}
				</button>
			{:else}
				<form method="post" action={actions.close} use:enhance>
					<input type="hidden" name="id" value={goal.id} />
					<input type="hidden" name="status" value="open" />
					<button class="btn btn-sm">{t('goals.reopen')}</button>
				</form>
			{/if}
			<button
				title={t('ui.edit')}
				aria-label={t('ui.edit')}
				onclick={() => onedit(goal.id)}
				class="icon-btn ml-auto"><Icon name="edit" /></button
			>
			{#if confirmingDelete}
				<form method="post" action={actions.remove} use:enhance>
					<input type="hidden" name="id" value={goal.id} />
					<button class="btn btn-sm btn-danger" use:armed>{t('goals.confirm')}</button>
				</form>
			{:else}
				<button
					title={t('ui.delete')}
					aria-label={t('ui.delete')}
					onclick={() => (confirmingDelete = true)}
					class="icon-btn icon-btn-danger"><Icon name="trash" /></button
				>
			{/if}
		</div>
	</div>

	{#if openTasks}
		<!--
				What already counts, on the card. The modal is for choosing;
				this is for looking and ticking — a list you could see but not
				tick sent you to the todo page for the one action the list
				exists for.
			-->
		<div class="mt-3 border border-gray-200 bg-gray-50 p-3">
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
						<span class={todo.status === 'done' ? 'text-gray-400' : 'text-gray-800'}
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

			{#if goal.linkedTodoIds.length + goal.linkedSlotIds.length + goal.linkedActivityIds.length === 0}
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
