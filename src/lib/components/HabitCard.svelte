<script lang="ts">
	import { useWhen } from '$lib/when-context.svelte';
	import { civilOf } from '$lib/when';
	/**
	 * One habit, wherever a habit is shown.
	 *
	 * This was written inside the Health room, so a habit filed under a subject
	 * was a name and a tick: no streak, no year of it at a glance, no way to
	 * write down the day you slipped, no backdating and no note on a day. A
	 * habit without its heatmap is a checkbox. The same move as `GoalCard`,
	 * `IdeaCard` and `BillRow`.
	 *
	 * Where it posts is a prop (`$lib/habit-action-names`); what it posts to is
	 * the same handler either way (`$lib/services/habit-actions`).
	 */
	import Icon from '$lib/components/Icon.svelte';
	import RowCard from '$lib/components/RowCard.svelte';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import Counter from '$lib/components/Counter.svelte';
	import TickBox from '$lib/components/TickBox.svelte';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { MediaQuery } from 'svelte/reactivity';
	import {
		HEATMAP_BAD,
		HEATMAP_GOOD,
		HEATMAP_NEUTRAL,
		HEATMAP_FULL_YEAR_FROM,
		HEATMAP_SEASON,
		HEATMAP_YEAR,
		HABIT_BAD_ACCENT,
		HABIT_GOOD_ACCENT,
		HABIT_NEUTRAL_ACCENT
	} from '$lib/colors';
	import {
		buildHeatmapWeeks,
		dayLabelsFrom,
		formatScheduledDays,
		logLabel,
		MAX_DAY_COUNT
	} from '$lib/habit-heatmap';
	import type { HabitActionNames } from '$lib/habit-action-names';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	/** What a card needs off a habit — `listHabits` gives exactly this. */
	type Shown = {
		id: number;
		name: string;
		description: string | null;
		type: string;
		scheduledDays: string | null;
		streak: number;
		/** Put away: history kept, no logging, and the only place it can be deleted. */
		archivedAt?: string | null;
	};

	type Occurrence = { id: number; habitId: number; date: string; notes: string | null };

	let {
		habit,
		/** Every logged day of this habit, newest first. */
		occurrences,
		/** The account's today, as the server reckons it. */
		today,
		/** 0 for Monday — which weekday the labels start on. */
		firstDay = 0,
		actions,
		onedit,
		/**
		 * Whether the year is unfolded, where the screen decides.
		 *
		 * Null means the card decides for itself, which is what a notebook's
		 * tab wants. The Health room passes it, because its keyboard opens and
		 * closes the card under the cursor and only one may be open at a time.
		 */
		expanded = null,
		onexpand
	}: {
		habit: Shown;
		occurrences: Occurrence[];
		today: string;
		firstDay?: number;
		actions: HabitActionNames;
		onedit?: (id: number) => void;
		expanded?: boolean | null;
		onexpand?: (id: number) => void;
	} = $props();

	let ownExpanded = $state(false);
	const open = $derived(expanded ?? ownExpanded);

	let confirmingDelete = $state(false);
	let confirmingOccurrence = $state<number | null>(null);
	let backdateInput = $state('');

	function toggleExpanded() {
		if (onexpand) onexpand(habit.id);
		else ownExpanded = !ownExpanded;
	}

	/*
	 * Folding the card away puts its questions away with it.
	 *
	 * Escape collapses the card in the Health room, and a "really delete?"
	 * left standing behind a fold is a question waiting where nobody can see
	 * it was asked.
	 */
	$effect(() => {
		if (!open) {
			confirmingDelete = false;
			confirmingOccurrence = null;
		}
	});

	const occ = $derived(occurrences.filter((one) => one.habitId === habit.id));
	const todayCount = $derived(occ.filter((one) => one.date === today).length);
	const todayLogged = $derived(todayCount > 0);
	const isBad = $derived(habit.type === 'bad');
	const isNeutral = $derived(habit.type === 'neutral');
	const archived = $derived(Boolean(habit.archivedAt));

	/*
	 * A day pressed in the heatmap, shown as the press left it before the
	 * server has answered — the square changes on the press, not a round trip
	 * later. Cleared once the page's own data has caught up.
	 */
	let pressedDays = $state<Record<string, number>>({});

	/** How many times each day was logged, for the heatmap's shading. */
	const counts = $derived.by(() => {
		const out: Record<string, number> = {};
		for (const one of occ) out[one.date] = (out[one.date] ?? 0) + 1;
		return { ...out, ...pressedDays };
	});

	/*
	 * A year on a screen with room for one, and a season on a phone.
	 *
	 * Rebuilt when the window crosses the breakpoint rather than measured once:
	 * a phone turned sideways is a different answer.
	 */
	const wide = new MediaQuery(`(min-width: ${HEATMAP_FULL_YEAR_FROM})`);
	const heatmapWeeks = $derived(
		buildHeatmapWeeks(wide.current ? HEATMAP_YEAR : HEATMAP_SEASON, firstDay)
	);
	const heatmapSpan = $derived(
		t('health.habits.lastDays', { count: wide.current ? HEATMAP_YEAR : HEATMAP_SEASON })
	);

	function badHeatmapColor(count: number): string {
		return HEATMAP_BAD[Math.min(count, HEATMAP_BAD.length - 1)];
	}

	function goodHeatmapColor(count: number): string {
		return HEATMAP_GOOD[Math.min(count, HEATMAP_GOOD.length - 1)];
	}

	function neutralHeatmapColor(count: number): string {
		return HEATMAP_NEUTRAL[Math.min(count, HEATMAP_NEUTRAL.length - 1)];
	}

	function orderedDayLabels(): string[] {
		return dayLabelsFrom(firstDay);
	}

	/**
	 * Clicking a day in the heatmap: log it, or take one back.
	 *
	 * A form action like every other press on the card, answered on the
	 * screen first: a day with nothing gets one, a day with some loses one —
	 * the same arithmetic `toggleOccurrence` does on the server.
	 */
	const toggleDay: import('@sveltejs/kit').SubmitFunction = ({ formData }) => {
		const day = String(formData.get('date'));
		const had = counts[day] ?? 0;
		pressedDays = { ...pressedDays, [day]: had > 0 ? had - 1 : 1 };
		return async ({ update }) => {
			await update({ reset: false });
			const rest = { ...pressedDays };
			delete rest[day];
			pressedDays = rest;
		};
	};
</script>

<div>
	<!--
		The card a task is drawn on — `RowCard`: the box that logs today where a
		task has its tick, the name beside it, where it stands on the foot line
		with the verbs, as a task's notebook and labels are. The year unfolds
		under the whole card, which is the width it needs.
	-->
	<div class="row-card">
		<RowCard>
			{#snippet rail()}
				{#if archived}
					<!-- Put away: nothing to log, and the box says so by not being one. -->
					<span class="flex">
						<span class="-m-1 flex shrink-0 items-start justify-center self-start p-1 opacity-50">
							<TickBox done={todayLogged} />
						</span>
					</span>
				{:else if todayLogged}
					<!--
						Once today is logged, the box that logs it is not a button.

						Which is the whole of the double-tap answer: a second press lands
						on a filled box rather than on the control, so one day cannot be
						counted twice by accident. Logging it again is the counter's plus
						— deliberate, and nowhere near where the first press landed.
					-->
					<span class="flex">
						<span
							class="-m-1 flex shrink-0 items-start justify-center self-start p-1 pointer-coarse:w-11"
							role="img"
							aria-label={todayCount > 1
								? t('health.habits.loggedTodayTimes', { count: todayCount })
								: isBad
									? t('health.habits.loggedToday')
									: t('health.habits.doneToday')}
						>
							{#if todayCount > 1}
								<TickBox done
									><span class="tabular text-xs font-medium">×{todayCount}</span></TickBox
								>
							{:else}
								<TickBox done />
							{/if}
						</span>
					</span>
				{:else}
					<!-- The same box a task is ticked with, whatever the kind: the pill on
					     the foot line says which kind it is. -->
					<form method="post" action={actions.logOccurrence} use:enhance class="flex">
						<input type="hidden" name="habitId" value={habit.id} />
						<input type="hidden" name="date" value={today} />
						<button
							type="submit"
							title={logLabel(habit)}
							aria-label={logLabel(habit)}
							class="-m-1 flex shrink-0 items-start justify-center self-start p-1 pointer-coarse:w-11"
						>
							<TickBox />
						</button>
					</form>
				{/if}
			{/snippet}

			{#snippet labels()}
				<!-- Which kind it is, worn the way a category is — see `CategoryMark`. -->
				<span class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
					<CategoryMark
						name={isBad ? t('app.bad') : isNeutral ? t('app.neutral') : t('app.good')}
						color={isBad ? HABIT_BAD_ACCENT : isNeutral ? HABIT_NEUTRAL_ACCENT : HABIT_GOOD_ACCENT}
					/>
					{#if archived}
						<span class="eyebrow text-gray-600">{t('todoRows.archived')}</span>
					{/if}
					{#if habit.streak > 0}
						<span class="font-medium text-gray-700">
							{isBad
								? t('health.habits.daysClean', { count: habit.streak })
								: t('health.habits.dayStreak', { count: habit.streak })}
						</span>
					{/if}
					<span class="tabular">{t('health.habits.total', { length: occ.length })}</span>
					{#if !isBad}
						<span>{formatScheduledDays(habit.scheduledDays)}</span>
					{/if}
				</span>
			{/snippet}

			{#snippet controls()}
				{#if !archived}
					<!--
						Today's count, on every habit, in the one place: a run of presses
						is one write of where it ended up, and minus takes back the one
						pressed by mistake. See `Counter`.
					-->
					<Counter
						value={todayCount}
						action={actions.setDayCount}
						name="count"
						fields={{ habitId: habit.id, date: today }}
						max={MAX_DAY_COUNT}
						label={t('health.habits.timesToday', { name: habit.name })}
						lessLabel={t('health.habits.oneFewerToday')}
						moreLabel={t('health.habits.logItAgain')}
					/>
				{/if}
				<button
					type="button"
					onclick={toggleExpanded}
					class="icon-btn"
					title={open ? t('health.habits.collapse') : t('health.habits.expand')}
					aria-label={open ? t('health.habits.collapse') : t('health.habits.expand')}
					aria-expanded={open}
				>
					<Icon name={open ? 'chevron-up' : 'chevron-down'} />
				</button>
				<button
					type="button"
					title={t('ui.edit')}
					aria-label={t('ui.edit')}
					onclick={() => onedit?.(habit.id)}
					class="icon-btn"
				>
					<Icon name="edit" />
				</button>
				<!-- Away and back, without asking: every logged day is kept either way. -->
				<form method="post" action={archived ? actions.unarchive : actions.archive} use:enhance>
					<input type="hidden" name="id" value={habit.id} />
					<button
						type="submit"
						class="icon-btn"
						title={archived ? t('todoRows.takeItBackOut') : t('finance.ledgers.putItAway')}
						aria-label={archived ? t('todoRows.takeItBackOut') : t('finance.ledgers.putItAway')}
					>
						<Icon name={archived ? 'undo' : 'archive'} />
					</button>
				</form>
				<!-- A year of logged days is not one press from gone: deleting is for
				     a habit already put away. -->
				{#if archived}
					{#if confirmingDelete}
						<form method="post" action={actions.remove} use:enhance>
							<input type="hidden" name="id" value={habit.id} />
							<button type="submit" class="btn btn-sm btn-danger" use:armed>
								{t('health.habits.confirm')}
							</button>
						</form>
						<button type="button" onclick={() => (confirmingDelete = false)} class="btn btn-sm">
							{t('ui.cancel')}
						</button>
					{:else}
						<button
							type="button"
							title={t('ui.delete')}
							aria-label={t('ui.delete')}
							onclick={() => (confirmingDelete = true)}
							class="icon-btn icon-btn-danger"
						>
							<Icon name="trash" />
						</button>
					{/if}
				{/if}
			{/snippet}

			<p
				class="text-sm leading-snug font-medium break-words {archived
					? 'text-gray-500'
					: 'text-gray-900'}"
			>
				{habit.name}
			</p>
			{#if habit.description}
				<p class="mt-0.5 text-xs break-words text-gray-500">{habit.description}</p>
			{/if}
		</RowCard>
	</div>

	{#if open}
		<div class="border-t border-gray-200 px-4 py-3">
			<div class="mb-2 text-xs font-medium text-gray-500">{heatmapSpan}</div>
			<!--
							The weeks share the width rather than each taking ten pixels.

							Ninety days is thirteen columns, and at a fixed cell size that
							is a third of a phone screen with two thirds of nothing beside
							it. Each column is a fraction of what there is instead, and the
							days are square.

							It used to be capped at a few rem per column so a desktop card
							was not a wall of tiles; the cap is gone, because what it
							actually produced was a small grid adrift in an empty card.

							`items-stretch`, not `items-start`, is what lines the weekday
							labels up with the rows: the label column is seven `1fr` rows
							of whatever height it is given, so given the squares' own
							height it divides into exactly their rows. Left to its content
							it was seven lines of nine-pixel text beside seven squares of
							some other size, drifting further apart the wider the card got.
						-->
			<form
				method="post"
				action={actions.toggleOccurrence}
				use:enhance={toggleDay}
				class="overflow-x-auto"
			>
				<input type="hidden" name="habitId" value={habit.id} />
				<div class="flex items-stretch gap-1">
					<div
						class="grid min-w-0 flex-1 gap-px"
						style="grid-template-columns: repeat({heatmapWeeks.length}, minmax(0, 1fr))"
					>
						{#each heatmapWeeks as week, wi (wi)}
							<div class="grid grid-rows-7 gap-px">
								{#each week as day, di (di)}
									{#if day}
										<button
											type="submit"
											name="date"
											value={day}
											disabled={archived}
											class="heat-day cursor-pointer {isBad
												? badHeatmapColor(counts[day] || 0)
												: isNeutral
													? neutralHeatmapColor(counts[day] || 0)
													: goodHeatmapColor(counts[day] || 0)}"
											title={day}
										></button>
									{:else}
										<div class="heat-day"></div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
					<div class="grid shrink-0 grid-rows-7 gap-px">
						{#each orderedDayLabels() as label, i (i)}
							<span class="flex items-center text-[9px] leading-none text-gray-500">{label}</span>
						{/each}
					</div>
				</div>
			</form>
			<div class="mt-2 flex items-center gap-2 text-xs text-gray-500">
				<span>{t('ui.less')}</span>
				<div class="flex gap-px">
					<div
						class="h-2.5 w-2.5 {isBad
							? HEATMAP_BAD[0]
							: isNeutral
								? HEATMAP_NEUTRAL[0]
								: HEATMAP_GOOD[0]}"
					></div>
					<div
						class="h-2.5 w-2.5 {isBad
							? HEATMAP_BAD[1]
							: isNeutral
								? HEATMAP_NEUTRAL[1]
								: HEATMAP_GOOD[1]}"
					></div>
					<div
						class="h-2.5 w-2.5 {isBad
							? HEATMAP_BAD[2]
							: isNeutral
								? HEATMAP_NEUTRAL[2]
								: HEATMAP_GOOD[2]}"
					></div>
					<div
						class="h-2.5 w-2.5 {isBad
							? HEATMAP_BAD[3]
							: isNeutral
								? HEATMAP_NEUTRAL[3]
								: HEATMAP_GOOD[3]}"
					></div>
				</div>
				<span>{t('ui.more')}</span>
			</div>

			<div class="mt-3 flex flex-wrap items-center gap-2">
				<span class="text-xs font-medium text-gray-500">{t('health.habits.logPastEntry')}</span>
				<input
					autocomplete="off"
					type="date"
					bind:value={backdateInput}
					max={today}
					aria-label={t('ui.date')}
					class="input input-sm w-auto"
				/>
				<form
					method="post"
					action={actions.logOccurrence}
					use:enhance={() => {
						return async ({ update }) => {
							await update();
							backdateInput = '';
						};
					}}
				>
					<input type="hidden" name="habitId" value={habit.id} />
					<input type="hidden" name="date" value={backdateInput} />
					<div class="flex items-center gap-1">
						<OneLine
							name="notes"
							placeholder={t('health.habits.note')}
							ariaLabel={t('health.habits.note')}
							class="input input-sm w-28"
						/>
						<button type="submit" disabled={!backdateInput} class="btn btn-sm">
							{t('health.habits.log')}
						</button>
					</div>
				</form>
			</div>

			{#if occ.length > 0}
				<!--
								Five deep, and the rest scrolls.

								It showed ten and then said "and 45 more" — which was both a
								screenful of dates nobody was reading and a promise it did
								not keep, since the line saying there were more was itself
								below the fold. Five is enough to see what a note looks like,
								and the rest are a scroll away rather than a page away.
							-->
				<div class="mt-3 max-h-56 divide-y divide-gray-100 overflow-y-auto pr-1">
					{#each occ as occurrence (occurrence.id)}
						<div class="flex items-center justify-between py-1.5">
							<div class="flex items-center gap-2">
								<span class="text-xs font-medium text-gray-600"
									>{civilOf(occurrence.date, now())}</span
								>
								<form
									method="post"
									action={actions.updateOccurrence}
									use:enhance
									class="flex items-center gap-1"
								>
									<input type="hidden" name="id" value={occurrence.id} />
									<OneLine
										name="notes"
										placeholder={t('health.habits.addNote')}
										ariaLabel={t('health.habits.noteOn', { date: civilOf(occurrence.date, now()) })}
										value={occurrence.notes ?? ''}
										class="input input-sm w-40"
									/>
									<button
										type="submit"
										class="icon-btn"
										title={t('ui.save')}
										aria-label={t('ui.save')}
									>
										<Icon name="check" size={14} />
									</button>
								</form>
							</div>
							{#if confirmingOccurrence === occurrence.id}
								<form
									method="post"
									action={actions.deleteOccurrence}
									use:enhance={() => {
										return async ({ update }) => {
											await update({ reset: false });
											confirmingOccurrence = null;
										};
									}}
								>
									<input type="hidden" name="id" value={occurrence.id} />
									<button type="submit" class="btn btn-sm btn-danger" use:armed>
										{t('health.habits.confirm')}
									</button>
								</form>
								<button
									type="button"
									onclick={() => {
										confirmingOccurrence = null;
									}}
									class="btn btn-sm"
								>
									{t('ui.cancel')}
								</button>
							{:else}
								<button
									type="button"
									onclick={() => {
										confirmingOccurrence = occurrence.id;
									}}
									class="icon-btn icon-btn-danger"
									title={t('ui.delete')}
									aria-label={t('ui.delete')}
								>
									<Icon name="trash" size={14} />
								</button>
							{/if}
						</div>
					{/each}
				</div>
				{#if occ.length > 5}
					<p class="pt-1 text-xs text-gray-500">
						{t('health.habits.inAllScroll', { length: occ.length })}
					</p>
				{/if}
			{/if}
		</div>
	{/if}
</div>
