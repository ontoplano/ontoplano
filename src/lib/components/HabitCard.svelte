<script lang="ts">
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
	import OneLine from '$lib/components/OneLine.svelte';
	import Counter from '$lib/components/Counter.svelte';
	import { enhance } from '$lib/enhance';
	import { invalidateAll } from '$app/navigation';
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

	/** What a card needs off a habit — `listHabits` gives exactly this. */
	type Shown = {
		id: number;
		name: string;
		description: string | null;
		type: string;
		scheduledDays: string | null;
		streak: number;
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

	/** How many times each day was logged, for the heatmap's shading. */
	const counts = $derived.by(() => {
		const out: Record<string, number> = {};
		for (const one of occ) out[one.date] = (out[one.date] ?? 0) + 1;
		return out;
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

	/** Clicking a day in the heatmap: log it, or take it back. */
	async function toggleOccurrence(habitId: number, date: string) {
		const body = new FormData();
		body.set('habitId', String(habitId));
		body.set('date', date);
		await fetch(actions.toggleOccurrence, { method: 'POST', body });
		await invalidateAll();
	}
</script>

<div
	style="border-left-width: 4px; border-left-color: {isBad
		? HABIT_BAD_ACCENT
		: isNeutral
			? HABIT_NEUTRAL_ACCENT
			: HABIT_GOOD_ACCENT}"
>
	<!--
		The card a task is drawn on — `RowCard`: the mark that logs today where a
		task has its tick, the name and its streak beside it, the verbs along the
		foot. The year unfolds under the whole card, which is the width it needs.
	-->
	<div class="flex items-stretch gap-x-4 px-4 py-3">
		<RowCard>
			{#snippet rail()}
				{#if todayLogged}
					<!--
						Once today is logged, the mark that logs it is not there.

						Which is the whole of the double-tap answer: a second press lands
						on a filled square rather than on the control, so one day cannot
						be counted twice by accident. Logging it again is a press of its
						own in the actions — deliberate, and nowhere near where the first
						press landed.
					-->
					<span
						class="-m-1 flex shrink-0 items-start justify-center self-start p-1 pointer-coarse:w-11"
					>
						<span
							class="tabular flex size-7 items-center justify-center border border-gray-400 bg-gray-400 text-xs font-medium text-white"
							role="img"
							aria-label={todayCount > 1
								? t('health.habits.loggedTodayTimes', { count: todayCount })
								: isBad
									? t('health.habits.loggedToday')
									: t('health.habits.doneToday')}
						>
							{#if todayCount > 1}×{todayCount}{:else}<Icon name="check" size={14} />{/if}
						</span>
					</span>
				{:else}
					<button
						type="submit"
						form="habit-log-{habit.id}"
						title={logLabel(habit)}
						aria-label={logLabel(habit)}
						class="-m-1 flex shrink-0 items-start justify-center self-start p-1 pointer-coarse:w-11"
					>
						<!-- Grey whatever the kind: the edge down the card already says
						     which kind it is, and a small red glyph is one a red-green
						     colourblind reader cannot tell from the blue one. -->
						<span
							class="flex size-7 items-center justify-center border border-gray-400 bg-white text-gray-600 transition hover:border-gray-600 hover:bg-gray-50"
						>
							<Icon name="target" size={16} />
						</span>
					</button>
				{/if}
			{/snippet}

			{#snippet controls()}
				<!--
					Today's count once there is one, and a word on today before.

					Both drawn in one cell, the absent one invisible, so logging the day
					does not change how wide the actions are and move the buttons after
					it. The count is a `Counter`: a run of presses is one write of where
					it ended up, and minus takes back the one pressed by mistake.
				-->
				<span class="grid items-center">
					<span class="[grid-area:1/1] {todayLogged ? '' : 'invisible'}" inert={!todayLogged}>
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
					</span>
					<!-- The form the mark in the rail sends, with a word on today. -->
					<form
						method="post"
						action={actions.logOccurrence}
						use:enhance
						id="habit-log-{habit.id}"
						class="[grid-area:1/1] {todayLogged ? 'invisible' : ''}"
						inert={todayLogged}
					>
						<input type="hidden" name="habitId" value={habit.id} />
						<input type="hidden" name="date" value={today} />
						<OneLine
							name="notes"
							placeholder={t('health.habits.note')}
							ariaLabel={t('health.habits.note')}
							class="input input-sm w-24"
						/>
					</form>
				</span>
				<button
					type="button"
					title={t('ui.edit')}
					aria-label={t('ui.edit')}
					onclick={() => onedit?.(habit.id)}
					class="icon-btn"
				>
					<Icon name="edit" />
				</button>
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
			{/snippet}

			<p class="text-sm leading-snug font-medium break-words text-gray-900">{habit.name}</p>
			<!-- Where it stands, on the line a task's notebook sits on. -->
			<div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
				{#if todayLogged}
					<span class="font-medium {isNeutral ? 'text-gray-600' : 'text-blue-700'}">
						{todayCount > 1
							? t('health.habits.loggedTodayTimes', { count: todayCount })
							: isBad
								? t('health.habits.loggedToday')
								: t('health.habits.doneToday')}
					</span>
				{/if}
				{#if habit.streak > 0}
					<span class="font-medium {isNeutral ? 'text-gray-600' : 'text-blue-700'}">
						{isBad
							? t('health.habits.daysClean', { count: habit.streak })
							: t('health.habits.dayStreak', { count: habit.streak })}
					</span>
				{/if}
				<span class="tabular">{t('health.habits.total', { length: occ.length })}</span>
				{#if !isBad}
					<span>{formatScheduledDays(habit.scheduledDays)}</span>
				{/if}
			</div>
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
			<div class="overflow-x-auto">
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
											type="button"
											onclick={() => toggleOccurrence(habit.id, day)}
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
			</div>
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
								<span class="text-xs font-medium text-gray-600">{occurrence.date}</span>
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
										ariaLabel={t('health.habits.noteOn', { date: occurrence.date })}
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
