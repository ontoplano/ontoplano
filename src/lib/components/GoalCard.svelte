<script lang="ts">
	import { routeGlyph } from '$lib/glyphs';
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
	import NotebookSeq from '$lib/components/NotebookSeq.svelte';
	import RowCard from '$lib/components/RowCard.svelte';
	import Written from '$lib/components/Written.svelte';
	import Counter from '$lib/components/Counter.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import { listCursor } from '$lib/actions/list-cursor';
	import { civilOf } from '$lib/when';
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
		notebookSeq?: number | null;
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
		/** What happened to it, newest first — `goalEvents`. */
		events?: {
			id: number;
			kind: 'progress' | 'status' | 'note';
			at: string;
			targetId: number | null;
			value: number | null;
			status: string | null;
			note: string;
		}[];
	};

	let {
		goal,
		goals,
		allTodos,
		slots,
		activities,
		actions,
		onedit,
		onlink,
		selected = false,
		/** Its history unfolded from the start — the History tab, which is about it. */
		historyOpen = false
	}: {
		goal: Shown;
		/** The others, only so a nested goal can name its parent. */
		goals: { id: number; title: string }[];
		allTodos: { id: number; title: string; status: string }[];
		slots: { id: number; name: string; startTime: string }[];
		activities: { id: number; name: string }[];
		actions: GoalActionNames;
		/* By id: the page holds the whole goal already, and handing back a
		   narrowed copy of it would make the caller widen it again. */
		onedit?: (id: number) => void;
		onlink?: (id: number) => void;
		/** Where the keyboard's cursor is, on a page that has one. */
		selected?: boolean;
		historyOpen?: boolean;
	} = $props();

	const t = useT();
	const now = useWhen();

	/** The ring's radius in its 36-unit box, and the length of its line. */
	const RING_R = 15;
	const RING_LENGTH = 2 * Math.PI * RING_R;
	/** How many sparks fly off the cup when a goal is reached. */
	const BURST = 12;

	/* Both of these are about this one card, so they live on it: the page had
	   to hold an id for each and compare it on every row. */
	let confirmingDelete = $state(false);
	let openTasks = $state(false);
	// svelte-ignore state_referenced_locally
	let openHistory = $state(historyOpen);
	/** The dialog that says so when it is reached, and asks how it went. */
	let celebrating = $state(false);

	const events = $derived(goal.events ?? []);

	/** One line of the history, in words. */
	function eventLine(e: NonNullable<Shown['events']>[number]): string {
		if (e.kind === 'progress') {
			const unit = goal.targets.find((one) => one.id === e.targetId)?.unit ?? '';
			return t('goals.eventProgress', { value: e.value ?? 0, unit }).trim();
		}
		if (e.kind === 'status') {
			if (e.status === 'open') return t('goals.reopened');
			if (e.status && isGoalStatus(e.status) && e.status in STATUS_LABELS)
				return t(STATUS_LABELS[e.status as keyof typeof STATUS_LABELS]);
		}
		return '';
	}

	function percent(g: Shown): number | null {
		return g.progress.fraction === null ? null : Math.round(g.progress.fraction * 100);
	}

	const linkedCount = $derived(
		goal.linkedSlotIds.length + goal.linkedTodoIds.length + goal.linkedActivityIds.length
	);

	const open = $derived(goal.status === 'open');
	/** The goal this one is part of, named on the card's second line. */
	const parent = $derived(
		goal.parentId === null ? undefined : goals.find((g) => g.id === goal.parentId)
	);

	/** The bar's width, or nothing where there is nothing to count. */
	const pct = $derived(percent(goal));

	/*
	 * One bar per goal. When its whole progress is one measure, the bar sits
	 * on that measure's line rather than on a line of its own above it that
	 * says the same numbers again.
	 */
	const barOnMeasure = $derived(!goal.progress.total && goal.targets.length === 1);

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

	The same card a task is drawn on — `RowCard`, the rail on the left and the
	words beside it, labels and actions on lines of their own — so a goal and
	the tasks that count towards it read as one kind of thing. The padding is
	the row's own, so the hover wash and the cursor reach the card's edges.
-->
<div id="goal-{goal.id}" class="goal-row row-card target:bg-yellow-50" use:listCursor={selected}>
	<RowCard>
		{#snippet rail()}
			<!--
				Not a tick box: a tick is a task done, and a goal is not one more
				task. A ring of how far it has come, with the cup in it — pressing
				it says it was reached, in a dialog worth reaching. A closed goal's
				cup is filled (or its skip mark shown) and pressing it reopens.
			-->
			{#if open}
				<button
					type="button"
					class="goal-ring -m-1 flex shrink-0 items-start justify-center self-start p-1 pointer-coarse:w-11"
					title={t('goals.achieveIt', { title: goal.title })}
					aria-label={t('goals.achieveIt', { title: goal.title })}
					onclick={() => (celebrating = true)}
				>
					{@render ring(pct ?? 0)}
				</button>
			{:else}
				<form method="post" action={actions.close} use:enhance class="flex">
					<input type="hidden" name="id" value={goal.id} />
					<input type="hidden" name="status" value="open" />
					<button
						class="-m-1 flex shrink-0 items-start justify-center self-start p-1 pointer-coarse:w-11"
						title={t('goals.reopen')}
						aria-label={t('goals.reopen')}
					>
						<span
							class="goal-medal flex size-8 items-center justify-center rounded-full"
							class:is-achieved={goal.status === 'achieved'}
						>
							<Icon name={goal.status === 'achieved' ? 'trophy' : 'skip'} />
						</span>
					</button>
				</form>
			{/if}
		{/snippet}

		{#snippet labels()}
			<!-- Its area, when it is for, and what it is part of: on the card's
			     foot, where a task's notebook and labels sit, so the line the
			     actions stand on is not a line of nothing else. -->
			<span class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
				{#if goal.areaName}
					<CategoryMark name={goal.areaName} color={goal.areaColor} />
				{/if}
				{#if !open && isGoalStatus(goal.status)}
					<span class="eyebrow text-gray-600"
						>{t(STATUS_LABELS[goal.status as keyof typeof STATUS_LABELS])}</span
					>
				{/if}
				<span class="tabular inline-flex items-center gap-1">
					<Icon name="calendar" size={12} />
					{describePeriod(t, now(), goal.horizon, goal.periodStart)}
				</span>
				{#if parent}
					<span class="inline-flex min-w-0 items-center gap-1">
						<Icon name="goals" size={12} />
						<span class="break-words">{t('goals.partOf2', { title: parent.title })}</span>
					</span>
				{/if}
				<!-- What counts towards this goal: it opens above this line, inside
				     the card, where the words it belongs to are. -->
				<button
					type="button"
					onclick={() => (openTasks = !openTasks)}
					class="goal-fold"
					aria-expanded={openTasks}
					title={t('goals.whatCountsTowardsThisGoal')}
					>{t('goals.tasks', { length: linkedCount })}<Icon
						name={openTasks ? 'chevron-up' : 'chevron-down'}
						size={12}
					/>
				</button>
				<!-- What happened to it: the numbers typed, the closing, the notes. -->
				<button
					type="button"
					onclick={() => (openHistory = !openHistory)}
					class="goal-fold"
					aria-expanded={openHistory}
					>{t('goals.historyFold', { n: events.length })}<Icon
						name={openHistory ? 'chevron-up' : 'chevron-down'}
						size={12}
					/>
				</button>
			</span>
		{/snippet}

		{#snippet controls()}
			{#if open}
				<button
					type="button"
					class="icon-btn"
					title={t('goals.missed')}
					aria-label={t('goals.missed')}
					onclick={() => closeLater('missed')}
				>
					<Icon name="skip" />
				</button>
			{/if}
			{#if onlink}
				<button
					type="button"
					class="icon-btn"
					title={t('goals.linkedTasks')}
					aria-label={t('goals.linkedTasks')}
					onclick={() => onlink(goal.id)}
				>
					<Icon name="link" />
				</button>
			{/if}
			{#if onedit}
				<button
					type="button"
					title={t('ui.edit')}
					aria-label={t('ui.edit')}
					onclick={() => onedit(goal.id)}
					class="icon-btn"><Icon name="edit" /></button
				>
			{/if}
			<button
				type="button"
				title={t('ui.delete')}
				aria-label={t('ui.delete')}
				onclick={() => (confirmingDelete = true)}
				class="icon-btn icon-btn-danger"><Icon name="trash" /></button
			>
		{/snippet}

		<p
			class="text-sm leading-snug font-medium break-words {open
				? 'text-gray-900'
				: 'text-gray-500'}"
		>
			<NotebookSeq seq={goal.notebookSeq} class="mr-1 font-normal" />{goal.title}
		</p>
		{#if goal.notes}
			<Written content={goal.notes} compact class="mt-1" />
		{/if}

		<!-- No bar without a measure. An empty track under a goal with nothing to
		     count reads as "0%", which is a claim about progress rather than the
		     absence of one. -->
		{#if !barOnMeasure}
			<div class="mt-2 flex items-center gap-3">
				{#if pct !== null}
					{@render bar(pct)}
				{/if}
				<span class="tabular shrink-0 text-xs text-gray-600">
					{progressLabel(goal)}{pct !== null ? ` · ${pct}%` : ''}
				</span>
			</div>
		{/if}
		<!--
			Every measure the goal was given, each with the number it stands at. A
			goal counted from linked tasks keeps them visible and editable: they are
			what somebody typed in, and hiding them because a todo got attached
			loses the record.
		-->
		{#if goal.targets.length > 0}
			<div class="goal-measures mt-1.5 space-y-1">
				{#each goal.targets as target (target.id)}
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<span class="flex items-center gap-2">
							<!--
								A measure counted from the workouts is read, not typed: the
								sum of what the register holds for that activity inside the
								goal's period. A box here would let somebody write a total
								their own sessions contradict.
							-->
							{#if target.measureActivity}
								<span class="chip shrink-0" title={t('goals.countedFromYourWorkouts')}>
									<Icon name={routeGlyph('/health/workouts')!} size={12} class="mr-1" />
									{target.measureActivity}
								</span>
								<span class="tabular text-sm text-gray-700">
									{target.currentValue}
								</span>
							{:else}
								<!--
									Counted or measured, the number answers the press at once and
									is sent when the pressing stops — see `Counter`. A measured
									one is typed as often as it is nudged, so it takes decimals.
								-->
								<Counter
									value={target.currentValue}
									action={actions.setProgress}
									name="currentValue"
									fields={{ targetId: target.id }}
									step={COUNT_STEP}
									whole={target.whole}
									label={t('goals.progressTowards', {
										value: target.targetValue,
										unit: target.unit
									}).trim()}
									lessLabel={t('goals.oneFewerUnit', {
										unit: target.unit || t('goals.towardsThis')
									}).trim()}
									moreLabel={t('goals.oneMoreUnit', {
										unit: target.unit || t('goals.towardsThis')
									}).trim()}
									class="goal-counter text-gray-700"
								/>
							{/if}
							<span class="tabular text-xs text-gray-600">
								/ {target.targetValue}
								{target.unit}
							</span>
						</span>
						{#if barOnMeasure}
							{@render bar(Math.round(target.fraction * 100))}
							<span class="tabular shrink-0 text-xs text-gray-600"
								>{Math.round(target.fraction * 100)}%</span
							>
						{:else}
							<span class="tabular text-xs text-gray-500">{Math.round(target.fraction * 100)}%</span
							>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

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

				{#if onlink}
					<button type="button" class="btn btn-sm mt-2" onclick={() => onlink(goal.id)}>
						{t('goals.chooseTasks')}
					</button>
				{/if}
			</div>
		{/if}

		{#if openHistory}
			<!--
				Its history, the way a habit keeps its days and a workout its
				sessions: newest first, each line a day and what happened on it.
				A note can be added whenever — to a closed goal most of all.
			-->
			<div class="goal-history mt-1 border-l-2 border-gray-200 pl-3">
				{#if events.length === 0}
					<p class="py-1 text-xs text-gray-500">{t('goals.nothingHappenedYet')}</p>
				{:else}
					<ol class="space-y-1 py-1">
						{#each events as e (e.id)}
							<li class="flex gap-3 text-sm">
								<span class="tabular w-24 shrink-0 text-xs text-gray-500"
									>{civilOf(e.at, now())}</span
								>
								<span class="min-w-0 flex-1">
									{#if eventLine(e)}
										<span class="text-gray-800" class:font-medium={e.kind === 'status'}
											>{eventLine(e)}</span
										>
									{/if}
									{#if e.note}
										<Written content={e.note} compact class="text-gray-700" />
									{/if}
								</span>
							</li>
						{/each}
					</ol>
				{/if}
				<form
					method="post"
					action={actions.note}
					use:enhance={() =>
						async ({ update, result }) => {
							await update({ reset: result.type === 'success' });
						}}
					class="mt-2 flex items-start gap-2"
				>
					<input type="hidden" name="id" value={goal.id} />
					<textarea
						name="note"
						rows="1"
						required
						class="textarea min-w-0 flex-1"
						placeholder={t('goals.notePlaceholder')}
						aria-label={t('goals.addNote')}
					></textarea>
					<button class="btn btn-sm shrink-0">{t('goals.addNote')}</button>
				</form>
			</div>
		{/if}
	</RowCard>
</div>

{#snippet ring(percentDone: number)}
	<!-- The goal's whole progress, round, with the cup it is for in the middle. -->
	<span class="relative flex size-8 items-center justify-center">
		<svg viewBox="0 0 36 36" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
			<circle cx="18" cy="18" r={RING_R} class="goal-ring-track" />
			<circle
				cx="18"
				cy="18"
				r={RING_R}
				class="goal-ring-fill"
				stroke-dasharray={RING_LENGTH}
				stroke-dashoffset={RING_LENGTH * (1 - percentDone / 100)}
			/>
		</svg>
		<Icon name="trophy" size={14} class="goal-ring-cup" />
	</span>
{/snippet}

{#snippet bar(width: number)}
	<div class="progress-track h-1.5 min-w-16 flex-1 sm:max-w-xs">
		<div class="progress-fill h-full" style="width: {width}%"></div>
	</div>
{/snippet}

<!--
	Reaching a goal is not ticking a box, so it does not look like one: the cup
	goes up with a burst around it, and the one question worth asking then —
	how did it go — is asked while the answer is fresh. It stays with the goal.
-->
<Modal bind:open={celebrating} title={t('goals.youDidIt')} size="sm">
	<div class="goal-cheer" aria-hidden="true">
		<span class="goal-cheer-cup"><Icon name="trophy" size={40} /></span>
		{#each { length: BURST }, i (i)}
			<span class="goal-cheer-spark" style="--turn: {i / BURST}turn"></span>
		{/each}
	</div>
	<p class="mb-3 text-center text-sm text-gray-700">
		{t('goals.youDidItBody', { title: goal.title })}
	</p>
	<form
		id="goal-achieve-{goal.id}"
		method="post"
		action={actions.close}
		use:enhance={() =>
			async ({ update, result }) => {
				if (result.type === 'success') celebrating = false;
				await update();
			}}
	>
		<input type="hidden" name="id" value={goal.id} />
		<input type="hidden" name="status" value="achieved" />
		<label class="block text-xs font-medium text-gray-600" for="goal-outcome-{goal.id}"
			>{t('goals.howDidItGo')}</label
		>
		<textarea
			id="goal-outcome-{goal.id}"
			name="outcome"
			rows="3"
			class="textarea mt-1 w-full"
			placeholder={t('goals.notePlaceholder')}
		></textarea>
	</form>
	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (celebrating = false)}>{t('ui.cancel')}</button
		>
		<button type="submit" form="goal-achieve-{goal.id}" class="btn btn-primary">
			<Icon name="trophy" />
			{t('goals.markAchieved')}
		</button>
	{/snippet}
</Modal>

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

	/*
	 * The minus glyph stands on the text column rather than the button's
	 * edge, so the counter lines up with the title above it.
	 */
	.goal-measures :global(.goal-counter) {
		margin-inline-start: calc((0.875rem - 2.25rem) / 2);
	}

	/* A rule down one side is a line, not a box: it has no corners to round. */
	.goal-tasks,
	.goal-history {
		border-radius: 0;
	}

	/* The ring: a wash for the whole way, the goals' own colour for how far. */
	.goal-ring-track,
	.goal-ring-fill {
		fill: none;
		stroke-width: 3.5;
	}

	.goal-ring-track {
		stroke: color-mix(in srgb, var(--color-gray-500) 25%, transparent);
	}

	.goal-ring-fill {
		stroke: var(--section-accent, var(--color-gray-700));
		stroke-linecap: butt;
		transition: stroke-dashoffset 300ms ease;
	}

	.goal-ring :global(.goal-ring-cup) {
		color: var(--color-gray-500);
		transition: color 120ms ease;
	}

	.goal-ring:hover :global(.goal-ring-cup) {
		color: var(--section-accent, var(--color-gray-900));
	}

	/* Closed: reached is the cup on the goals' colour; missed is quiet. */
	.goal-medal {
		background-color: color-mix(in srgb, var(--color-gray-500) 18%, transparent);
		color: var(--color-gray-500);
	}

	.goal-medal.is-achieved {
		background-color: var(--section-accent, var(--color-gray-900));
		color: var(--ink-on-fill);
	}

	/* The cheer: the cup rises, and sparks fly out from behind it. */
	.goal-cheer {
		position: relative;
		display: flex;
		height: 6rem;
		align-items: center;
		justify-content: center;
		color: var(--section-accent, var(--color-gray-900));
	}

	.goal-cheer-cup {
		position: relative;
		z-index: 1;
		animation: goal-cup-rise 520ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}

	.goal-cheer-spark {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 999px;
		background-color: currentColor;
		opacity: 0;
		animation: goal-spark 700ms ease-out 120ms both;
	}

	.goal-cheer-spark:nth-child(odd) {
		background-color: var(--color-yellow-500, currentColor);
	}

	@keyframes goal-cup-rise {
		from {
			transform: translateY(1rem) scale(0.6);
			opacity: 0;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}

	@keyframes goal-spark {
		0% {
			transform: rotate(var(--turn)) translateX(0.5rem);
			opacity: 1;
		}
		100% {
			transform: rotate(var(--turn)) translateX(3rem);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.goal-cheer-cup,
		.goal-cheer-spark {
			animation: none;
		}

		.goal-cheer-spark {
			display: none;
		}
	}
</style>
