<script lang="ts">
	import { enhance } from '$app/forms';
	import FilterChips from '$lib/components/FilterChips.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import { MediaQuery } from 'svelte/reactivity';
	import {
		HEATMAP_FULL_YEAR_FROM,
		HEATMAP_MAX_DAY_REM,
		HEATMAP_SEASON,
		HEATMAP_YEAR
	} from '$lib/colors';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { tick } from 'svelte';
	import type { PageData, ActionData } from './$types';
	import {
		HEATMAP_BAD,
		HEATMAP_GOOD,
		HEATMAP_NEUTRAL,
		HABIT_BAD_ACCENT,
		HABIT_GOOD_ACCENT,
		HABIT_NEUTRAL_ACCENT
	} from '$lib/colors.js';
	import { getAction } from '$lib/shortcuts';
	import { keepInView } from '$lib/actions/keep-in-view';
	import { useT } from '$lib/i18n';

	const t = useT();

	interface Habit {
		id: number;
		name: string;
		description: string | null;
		type: 'bad' | 'good' | 'neutral';
		scheduledDays: string | null;
		createdAt: string;
		streak: number;
	}

	interface Occurrence {
		id: number;
		habitId: number;
		date: string;
		notes: string | null;
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let selectedHabitIndex = $state(0);
	let expandedHabitId: number | null = $state(null);
	let confirmingDeleteId: number | null = $state(null);
	let confirmingOccurrenceDelete: number | null = $state(null);
	let typeFilter: 'all' | 'bad' | 'good' | 'neutral' = $state('all');
	let backdateInput: string = $state('');

	let newHabitType: 'bad' | 'good' | 'neutral' = $state('bad');
	let scheduledDaysState: boolean[] = $state([false, false, false, false, false, false, false]);

	const FULL_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	function getFirstDay(): number {
		return data.config.week.firstDay;
	}

	function orderedDayLabels(): string[] {
		const fd = getFirstDay();
		return [...FULL_DAY_LABELS.slice(fd), ...FULL_DAY_LABELS.slice(0, fd)];
	}

	function filteredHabits() {
		if (typeFilter === 'all') return data.habits as Habit[];
		return (data.habits as Habit[]).filter((h: Habit) => h.type === typeFilter);
	}

	function occurrencesForHabit(habitId: number) {
		return (data.occurrences as Occurrence[]).filter((o: Occurrence) => o.habitId === habitId);
	}

	function occurrenceCountByDate(habitId: number): Record<string, number> {
		const counts: Record<string, number> = {};
		for (const o of data.occurrences) {
			if (o.habitId !== habitId) continue;
			counts[o.date] = (counts[o.date] || 0) + 1;
		}
		return counts;
	}

	async function toggleOccurrence(habitId: number, date: string) {
		const body = new FormData();
		body.set('habitId', String(habitId));
		body.set('date', date);
		await fetch('?/toggleOccurrence', { method: 'POST', body });
		const { invalidateAll } = await import('$app/navigation');
		await invalidateAll();
	}

	/*
	 * A year of days, laid out in weeks.
	 *
	 * eslint-disable svelte/prefer-svelte-reactivity -- every Date below is a
	 * cursor walked once through the year and then thrown away. Nothing reads
	 * them reactively, and SvelteDate here would only be slower.
	 */
	/* eslint-disable svelte/prefer-svelte-reactivity */
	function buildHeatmapWeeks(days: number): string[][] {
		const weeks: string[][] = [];
		const today = new Date();
		const fd = getFirstDay();

		const endDay = new Date(today);
		const startDay = new Date(today);
		startDay.setDate(startDay.getDate() - (days - 1));

		const startDow = startDay.getDay();
		const adjustedStart = new Date(startDay);
		const jsDayOfFirstDay = fd === 6 ? 0 : fd + 1;
		const diff = (startDow - jsDayOfFirstDay + 7) % 7;
		if (diff !== 0) {
			adjustedStart.setDate(adjustedStart.getDate() - diff);
		}

		let current = new Date(adjustedStart);
		let week: string[] = [];

		while (current <= endDay || week.length > 0) {
			const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
			week.push(dateStr);

			if (week.length === 7) {
				weeks.push(week);
				week = [];
			}

			current.setDate(current.getDate() + 1);
			if (current > endDay && week.length === 0) break;
		}

		if (week.length > 0) {
			while (week.length < 7) week.push('');
			weeks.push(week);
		}

		return weeks;
	}
	/* eslint-enable svelte/prefer-svelte-reactivity */

	function badHeatmapColor(count: number): string {
		return HEATMAP_BAD[Math.min(count, HEATMAP_BAD.length - 1)];
	}

	function goodHeatmapColor(count: number): string {
		return HEATMAP_GOOD[Math.min(count, HEATMAP_GOOD.length - 1)];
	}

	function neutralHeatmapColor(count: number): string {
		return HEATMAP_NEUTRAL[Math.min(count, HEATMAP_NEUTRAL.length - 1)];
	}

	/*
	 * A year on a screen with room for one, and a season on a phone.
	 *
	 * Fifty-two columns of two-and-a-half-pixel squares is a wall on a phone:
	 * it overflows sideways, and a year of somebody's habit compressed into
	 * a strip narrower than a thumb says nothing you could read. Ninety days is
	 * thirteen columns, which fits, and is the span a habit is actually judged
	 * over.
	 *
	 * Rebuilt when the window crosses the breakpoint rather than measured once:
	 * a phone turned sideways is a different answer.
	 */
	const wide = new MediaQuery(`(min-width: ${HEATMAP_FULL_YEAR_FROM})`);
	const heatmapWeeks = $derived(buildHeatmapWeeks(wide.current ? HEATMAP_YEAR : HEATMAP_SEASON));
	const heatmapSpan = $derived(wide.current ? 'Last 365 days' : 'Last 90 days');

	function formatScheduledDays(raw: string | null): string {
		if (!raw || raw.trim() === '') return 'Every day';
		const days = raw
			.split(',')
			.map((s) => parseInt(s.trim(), 10))
			.filter((n) => !isNaN(n) && n >= 0 && n <= 6);
		if (days.length === 0) return 'Every day';
		if (days.length === 7) return 'Every day';
		return days.map((d) => FULL_DAY_LABELS[d]).join(', ');
	}

	/**
	 * What the log button does, for the tooltip and the screen reader.
	 *
	 * The button itself is the target glyph alone, like every other row action
	 * on the card — the word only ever said what the colour and the icon
	 * already say.
	 */
	function logLabel(habit: { type: string }): string {
		return habit.type === 'bad' ? 'I slipped' : habit.type === 'neutral' ? 'Log' : 'Done';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			confirmingOccurrenceDelete = null;
			if (showForm) {
				showForm = false;
				resetForm();
			} else {
				expandedHabitId = null;
				confirmingDeleteId = null;
			}
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const habits = filteredHabits();
		const action = getAction('/health/habits', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'navigate-down':
				confirmingOccurrenceDelete = null;
				selectedHabitIndex = Math.min(selectedHabitIndex + 1, habits.length - 1);
				break;
			case 'navigate-up':
				confirmingOccurrenceDelete = null;
				selectedHabitIndex = Math.max(selectedHabitIndex - 1, 0);
				break;
			case 'new':
				editingId = null;
				showForm = true;
				confirmingDeleteId = null;
				resetForm();
				tick().then(() => {
					const nameInput = document.querySelector<HTMLInputElement>('input[name="label"]');
					nameInput?.focus();
				});
				break;
			case 'toggle-expand':
				if (habits.length > 0) {
					const habit = habits[selectedHabitIndex];
					expandedHabitId = expandedHabitId === habit.id ? null : habit.id;
				}
				break;
		}
	}

	function openNewHabit() {
		editingId = null;
		confirmingDeleteId = null;
		resetForm();
		showForm = true;
	}

	function resetForm() {
		editingId = null;
		newHabitType = 'bad';
		scheduledDaysState = [false, false, false, false, false, false, false];
	}

	function startEdit(habit: Habit) {
		editingId = habit.id;
		newHabitType = habit.type;
		const scheduled = habit.scheduledDays
			? habit.scheduledDays
					.split(',')
					.map((s) => parseInt(s.trim(), 10))
					.filter((n) => !isNaN(n) && n >= 0 && n <= 6)
			: [];
		scheduledDaysState = [0, 1, 2, 3, 4, 5, 6].map((d) => scheduled.includes(d));
		showForm = true;
		tick().then(() => {
			const nameInput = document.querySelector<HTMLInputElement>('input[name="label"]');
			nameInput?.focus();
		});
	}

	function getScheduledDaysString(): string {
		const days = scheduledDaysState.map((checked, i) => (checked ? i : -1)).filter((i) => i !== -1);
		return days.join(',');
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('health.habits.newHabit'),
		open: showForm,
		tour: 'habit-new',
		run: () => {
			if (showForm && !editingId) {
				showForm = false;
				resetForm();
				return;
			}
			editingId = null;
			showForm = !showForm;
			confirmingDeleteId = null;
			if (!showForm) {
				resetForm();
				return;
			}
			tick().then(() => {
				const nameInput = document.querySelector<HTMLInputElement>('input[name="label"]');
				nameInput?.focus();
			});
		}
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<RoomToolbar>
		{#snippet filters()}
			<FilterChips
				label={t('health.habits.kind')}
				bind:value={typeFilter}
				onchange={() => (selectedHabitIndex = 0)}
				options={[
					{ value: 'all', label: 'app.all' },
					{ value: 'good', label: 'app.good' },
					{ value: 'bad', label: 'app.bad' },
					{ value: 'neutral', label: 'app.neutral' }
				]}
			/>
		{/snippet}
	</RoomToolbar>

	<FormError message={form?.message} />

	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? t('health.habits.editHabit') : t('health.habits.newHabit')}
		onclose={resetForm}
		size="sm"
	>
		{@const editHabit = editingId ? (data.habits as Habit[]).find((h) => h.id === editingId) : null}
		<form
			id="habit-form"
			method="post"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				return async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						showForm = false;
						resetForm();
					}
				};
			}}
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}
			<input type="hidden" name="scheduledDays" value={getScheduledDaysString()} />

			<FormGrid>
				<Field label={t('ui.name')} span={12} required>
					<OneLine
						name="label"
						placeholder={newHabitType === 'bad'
							? t('health.habits.eGSmokingBitingNails')
							: newHabitType === 'neutral'
								? t('health.habits.eGCoffeeNaps')
								: t('health.habits.eGGymReading')}
						value={editHabit?.name ?? ''}
						class="input"
						required
					/>
				</Field>

				<Field
					label={t('health.habits.kind')}
					span={12}
					hint={t('health.habits.aBadHabitCountsDays')}
				>
					<div class="flex gap-2">
						{#each [['bad', 'Bad'], ['good', 'Good'], ['neutral', 'Neutral']] as [value, label] (value)}
							<label
								class="flex-1 cursor-pointer border px-3 py-2 text-center text-sm {newHabitType ===
								value
									? 'border-gray-900 bg-gray-900 font-medium text-white'
									: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
							>
								<input
									type="radio"
									name="type"
									{value}
									checked={newHabitType === value}
									onchange={() => (newHabitType = value as 'bad' | 'good' | 'neutral')}
									class="sr-only"
								/>
								{label}
							</label>
						{/each}
					</div>
				</Field>

				<Field label={t('ui.description')} span={12}>
					<OneLine name="description" value={editHabit?.description ?? ''} class="input" />
				</Field>

				{#if newHabitType === 'good' || newHabitType === 'neutral'}
					<Field
						label={t('health.habits.onWhichDays')}
						span={12}
						hint={t('health.habits.noneSelectedMeansEveryDay')}
					>
						<div class="flex flex-wrap gap-1">
							{#each FULL_DAY_LABELS as label, i (label)}
								<label
									class="cursor-pointer border px-2 py-1 text-xs {scheduledDaysState[i]
										? 'border-gray-900 bg-gray-900 font-medium text-white'
										: 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}"
								>
									<input
										type="checkbox"
										checked={scheduledDaysState[i]}
										onchange={(e) => {
											scheduledDaysState[i] = (e.target as HTMLInputElement).checked;
										}}
										class="sr-only"
									/>
									{label}
								</label>
							{/each}
						</div>
					</Field>
				{/if}
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
			<button type="submit" form="habit-form" class="btn btn-primary">
				{editingId ? 'Save' : t('health.habits.createHabit')}
			</button>
		{/snippet}
	</Modal>

	{#if filteredHabits().length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{#if typeFilter === 'all'}
				<EmptyState
					icon="health"
					title={t('health.habits.nothingTrackedYet')}
					description={t('health.habits.aHabitIsSomethingYou')}
				>
					{#snippet action()}
						<button onclick={openNewHabit} class="btn btn-primary">
							<Icon name="plus" />
							{t('health.habits.newHabit')}
						</button>
					{/snippet}
				</EmptyState>
			{:else}
				<EmptyState icon="health" title={t('health.habits.nothingTrackedInThisFilter')}>
					{#snippet action()}
						<button onclick={() => (typeFilter = 'all')} class="btn"
							>{t('health.habits.showAllHabits')}</button
						>
					{/snippet}
				</EmptyState>
			{/if}
		</div>
	{:else}
		<!--
			One surface, and a habit is a row on it.

			The coloured edge down the left is what tells one habit from another —
			it does not need a card each and a strip of page between them to do
			that, and a screen of separate boxes read as a scatter rather than as
			the list it is.
		-->
		<div
			class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card"
			data-tour="habit-list"
		>
			{#each filteredHabits() as habit, i (habit.id)}
				{@const occ = occurrencesForHabit(habit.id)}
				{@const todayLogged = occ.some((o) => o.date === data.today)}
				{@const isBad = habit.type === 'bad'}
				{@const isNeutral = habit.type === 'neutral'}
				<div
					use:keepInView={i === selectedHabitIndex}
					class={i === selectedHabitIndex ? 'kbd-cursor' : ''}
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
								<span class="text-xs text-gray-500"
									>{t('health.habits.total', { length: occ.length })}</span
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
								<form method="post" action="?/logOccurrence" use:enhance>
									<input type="hidden" name="habitId" value={habit.id} />
									<input type="hidden" name="date" value={data.today} />
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
								onclick={() => startEdit(habit)}
								class="icon-btn"
							>
								<Icon name="edit" />
							</button>
							<button
								onclick={() => {
									expandedHabitId = expandedHabitId === habit.id ? null : habit.id;
									confirmingDeleteId = null;
								}}
								class="icon-btn"
								title={expandedHabitId === habit.id ? 'Collapse' : 'Expand'}
								aria-label={expandedHabitId === habit.id ? 'Collapse' : 'Expand'}
							>
								<Icon name={expandedHabitId === habit.id ? 'chevron-up' : 'chevron-down'} />
							</button>
							{#if confirmingDeleteId === habit.id}
								<form method="post" action="?/delete" use:enhance>
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
										confirmingDeleteId = habit.id;
									}}
									class="icon-btn icon-btn-danger"
								>
									<Icon name="trash" />
								</button>
							{/if}
						</div>
					</div>

					{#if expandedHabitId === habit.id}
						{@const counts = occurrenceCountByDate(habit.id)}
						<div class="border-t border-gray-200 px-4 py-3">
							<div class="mb-2 text-xs font-medium text-gray-500">{heatmapSpan}</div>
							<!--
								The weeks share the width rather than each taking ten pixels.
								
								Ninety days is thirteen columns, and at a fixed cell size that
								is a third of a phone screen with two thirds of nothing beside
								it. Each column is a fraction of what there is instead, the
								days are square, and the whole thing is capped so the same
								grid on a desktop card is not a wall of tiles.
							-->
							<div class="overflow-x-auto">
								<div
									class="flex items-start gap-1"
									style="max-width: calc({heatmapWeeks.length} * {HEATMAP_MAX_DAY_REM}rem)"
								>
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
											<span class="flex items-center text-[9px] leading-none text-gray-500"
												>{label}</span
											>
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
								<span class="text-xs font-medium text-gray-500"
									>{t('health.habits.logPastEntry')}</span
								>
								<input
									autocomplete="off"
									type="date"
									bind:value={backdateInput}
									max={data.today}
									class="border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								/>
								<form
									method="post"
									action="?/logOccurrence"
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
													action="?/updateOccurrence"
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
											{#if confirmingOccurrenceDelete === occurrence.id}
												<form
													method="post"
													action="?/deleteOccurrence"
													use:enhance={() => {
														return async ({ update }) => {
															await update({ reset: false });
															confirmingOccurrenceDelete = null;
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
														confirmingOccurrenceDelete = null;
													}}
													class="btn btn-sm"
												>
													{t('ui.cancel')}
												</button>
											{:else}
												<button
													type="button"
													onclick={() => {
														confirmingOccurrenceDelete = occurrence.id;
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
			{/each}
		</div>
	{/if}
</div>
