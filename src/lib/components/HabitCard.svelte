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
	import OneLine from '$lib/components/OneLine.svelte';
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
		logLabel
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
	const todayLogged = $derived(occ.some((one) => one.date === today));
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
	const heatmapSpan = $derived(wide.current ? 'Last 365 days' : 'Last 90 days');

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
	<div class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium text-gray-900">{habit.name}</span>
				{#if habit.streak > 0}
					<span class="text-xs font-medium {isNeutral ? 'text-gray-600' : 'text-blue-600'}">
						{isBad
							? t('health.habits.daysClean', { count: habit.streak })
							: t('health.habits.dayStreak', { count: habit.streak })}
					</span>
				{/if}
				<span class="text-xs text-gray-500">{t('health.habits.total', { length: occ.length })}</span
				>
			</div>
			{#if habit.description}
				<p class="truncate text-xs text-gray-500">{habit.description}</p>
			{/if}
			{#if !isBad}
				<p class="text-xs text-gray-500">{formatScheduledDays(habit.scheduledDays)}</p>
			{/if}
		</div>

		<div class="ml-auto flex items-center gap-2 sm:shrink-0">
			{#if todayLogged}
				<span
					class="border {isBad
						? 'border-red-200 bg-red-50 text-red-600'
						: isNeutral
							? 'border-gray-300 bg-gray-50 text-gray-600'
							: 'border-blue-200 bg-blue-50 text-blue-600'} px-2 py-1 text-xs font-medium"
				>
					{isBad ? t('health.habits.loggedToday') : t('health.habits.doneToday')}
				</span>
			{:else}
				<form method="post" action={actions.logOccurrence} use:enhance>
					<input type="hidden" name="habitId" value={habit.id} />
					<input type="hidden" name="date" value={today} />
					<div class="flex items-center gap-1">
						<OneLine
							name="notes"
							placeholder={t('health.habits.note')}
							class="w-20 border border-gray-200 px-1.5 py-1 text-xs focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<button
							type="submit"
							title={logLabel(habit)}
							aria-label={logLabel(habit)}
							class="flex h-9 w-9 items-center justify-center border {isBad
								? 'border-red-200 bg-white text-red-600 hover:bg-red-50'
								: isNeutral
									? 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
									: 'border-blue-200 bg-white text-blue-600 hover:bg-blue-50'} transition"
						>
							<Icon name="target" size={16} />
						</button>
					</div>
				</form>
			{/if}
			<button
				title={t('ui.edit')}
				aria-label={t('ui.edit')}
				onclick={() => onedit?.(habit.id)}
				class="icon-btn"
			>
				<Icon name="edit" />
			</button>
			<button
				onclick={toggleExpanded}
				class="icon-btn"
				title={open ? t('health.habits.collapse') : t('health.habits.expand')}
				aria-label={open ? t('health.habits.collapse') : t('health.habits.expand')}
			>
				<Icon name={open ? 'chevron-up' : 'chevron-down'} />
			</button>
			{#if confirmingDelete}
				<form method="post" action={actions.remove} use:enhance>
					<input type="hidden" name="id" value={habit.id} />
					<button
						type="submit"
						class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
						use:armed
					>
						{t('health.habits.confirm')}
					</button>
				</form>
			{:else}
				<button
					title={t('ui.delete')}
					aria-label={t('ui.delete')}
					onclick={() => {
						confirmingDelete = true;
					}}
					class="icon-btn icon-btn-danger"
				>
					<Icon name="trash" />
				</button>
			{/if}
		</div>
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

			<div class="mt-3 flex items-center gap-2">
				<span class="text-xs font-medium text-gray-500">{t('health.habits.logPastEntry')}</span>
				<input
					autocomplete="off"
					type="date"
					bind:value={backdateInput}
					max={today}
					class="border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
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
							class="w-20 border border-gray-200 px-1.5 py-1 text-xs focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<button
							type="submit"
							disabled={!backdateInput}
							class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
						>
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
										value={occurrence.notes ?? ''}
										class="w-32 border border-transparent px-1 py-0.5 text-xs text-gray-500 hover:border-gray-200 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
									/>
									<button
										type="submit"
										class="text-xs text-gray-300 transition hover:text-gray-600"
									>
										✓
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
									<button
										type="submit"
										class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
										use:armed
									>
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
									class="text-xs text-gray-500 transition hover:text-red-500"
								>
									&times;
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
