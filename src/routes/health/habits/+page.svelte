<script lang="ts">
	import { enhance } from '$app/forms';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import {
		HEATMAP_BAD,
		HEATMAP_GOOD,
		HEATMAP_NEUTRAL,
		HABIT_BAD_ACCENT,
		HABIT_GOOD_ACCENT,
		HABIT_NEUTRAL_ACCENT
	} from '$lib/colors.js';
	import { getAction } from '$lib/shortcuts';

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

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

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
		return data.config?.week?.firstDay ?? 0;
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

	function buildHeatmapWeeks(): string[][] {
		const weeks: string[][] = [];
		const today = new Date();
		const fd = getFirstDay();

		const endDay = new Date(today);
		const startDay = new Date(today);
		startDay.setDate(startDay.getDate() - 364);

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

	function badHeatmapColor(count: number): string {
		return HEATMAP_BAD[Math.min(count, HEATMAP_BAD.length - 1)];
	}

	function goodHeatmapColor(count: number): string {
		return HEATMAP_GOOD[Math.min(count, HEATMAP_GOOD.length - 1)];
	}

	function neutralHeatmapColor(count: number): string {
		return HEATMAP_NEUTRAL[Math.min(count, HEATMAP_NEUTRAL.length - 1)];
	}

	const heatmapWeeks = buildHeatmapWeeks();

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
					const nameInput = document.querySelector<HTMLInputElement>('input[name="name"]');
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
			const nameInput = document.querySelector<HTMLInputElement>('input[name="name"]');
			nameInput?.focus();
		});
	}

	function getScheduledDaysString(): string {
		const days = scheduledDaysState.map((checked, i) => (checked ? i : -1)).filter((i) => i !== -1);
		return days.join(',');
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div></div>
		<button
			onclick={() => {
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
					const nameInput = document.querySelector<HTMLInputElement>('input[name="name"]');
					nameInput?.focus();
				});
			}}
			class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
		>
			{showForm ? 'Cancel' : 'New Habit'}
		</button>
	</div>

	<div class="flex gap-2">
		<button
			onclick={() => {
				typeFilter = 'all';
				selectedHabitIndex = 0;
			}}
			class="border px-3 py-1 text-sm transition {typeFilter === 'all'
				? 'border-gray-900 bg-gray-900 text-white'
				: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
		>
			All
		</button>
		<button
			onclick={() => {
				typeFilter = 'bad';
				selectedHabitIndex = 0;
			}}
			class="border px-3 py-1 text-sm transition {typeFilter === 'bad'
				? 'border-red-600 bg-red-600 text-white'
				: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
		>
			Bad
		</button>
		<button
			onclick={() => {
				typeFilter = 'good';
				selectedHabitIndex = 0;
			}}
			class="border px-3 py-1 text-sm transition {typeFilter === 'good'
				? 'border-blue-600 bg-blue-600 text-white'
				: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
		>
			Good
		</button>
		<button
			onclick={() => {
				typeFilter = 'neutral';
				selectedHabitIndex = 0;
			}}
			class="border px-3 py-1 text-sm transition {typeFilter === 'neutral'
				? 'border-gray-600 bg-gray-600 text-white'
				: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
		>
			Neutral
		</button>
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	<Modal
		bind:open={showForm}
		title={editingId ? 'Edit habit' : 'New habit'}
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
					await update();
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
				<Field label="Name" span={12} required>
					<input
						name="name"
						type="text"
						autocomplete="off"
						required
						value={editHabit?.name ?? ''}
						placeholder={newHabitType === 'bad'
							? 'e.g. smoking, biting nails'
							: newHabitType === 'neutral'
								? 'e.g. coffee, naps'
								: 'e.g. gym, reading'}
						class="input"
					/>
				</Field>

				<Field label="Kind" span={12} hint="A bad habit counts days since the last slip.">
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

				<Field label="Description" span={12}>
					<input
						name="description"
						type="text"
						autocomplete="off"
						value={editHabit?.description ?? ''}
						class="input"
					/>
				</Field>

				{#if newHabitType === 'good' || newHabitType === 'neutral'}
					<Field label="On which days" span={12} hint="None selected means every day.">
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
			<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
			<button type="submit" form="habit-form" class="btn btn-primary">
				{editingId ? 'Save' : 'Create habit'}
			</button>
		{/snippet}
	</Modal>

	{#if filteredHabits().length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{typeFilter === 'all'
				? 'No habits tracked. Add one to start monitoring.'
				: typeFilter === 'bad'
					? 'No bad habits tracked.'
					: typeFilter === 'neutral'
						? 'No neutral habits tracked.'
						: 'No good habits tracked.'}
		</div>
	{:else}
		<div class="space-y-3">
			{#each filteredHabits() as habit, i (habit.id)}
				{@const occ = occurrencesForHabit(habit.id)}
				{@const todayLogged = occ.some((o) => o.date === data.today)}
				{@const isBad = habit.type === 'bad'}
				{@const isNeutral = habit.type === 'neutral'}
				<div
					class="border border-gray-200 bg-white shadow-card {i === selectedHabitIndex
						? 'ring-2 ring-gray-900 ring-inset'
						: ''}"
					style="border-left-width: 4px; border-left-color: {isBad
						? HABIT_BAD_ACCENT
						: isNeutral
							? HABIT_NEUTRAL_ACCENT
							: HABIT_GOOD_ACCENT}"
				>
					<div class="flex items-center gap-4 px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium text-gray-900">{habit.name}</span>
								{#if habit.streak > 0}
									<span class="text-xs font-medium {isNeutral ? 'text-gray-600' : 'text-blue-600'}">
										{isBad
											? `${habit.streak} day${habit.streak === 1 ? '' : 's'} clean`
											: `${habit.streak} day streak`}
									</span>
								{/if}
								<span class="text-xs text-gray-400">{occ.length} total</span>
							</div>
							{#if habit.description}
								<p class="truncate text-xs text-gray-500">{habit.description}</p>
							{/if}
							{#if !isBad}
								<p class="text-xs text-gray-400">{formatScheduledDays(habit.scheduledDays)}</p>
							{/if}
						</div>

						<div class="flex shrink-0 items-center gap-2">
							{#if todayLogged}
								<span
									class="border {isBad
										? 'border-red-200 bg-red-50 text-red-600'
										: isNeutral
											? 'border-gray-300 bg-gray-50 text-gray-600'
											: 'border-blue-200 bg-blue-50 text-blue-600'} px-2 py-1 text-xs font-medium"
								>
									{isBad ? 'logged today' : 'done today'}
								</span>
							{:else}
								<form method="post" action="?/logOccurrence" use:enhance>
									<input type="hidden" name="habitId" value={habit.id} />
									<input type="hidden" name="date" value={data.today} />
									<div class="flex items-center gap-1">
										<input
											name="notes"
											type="text"
											autocomplete="off"
											placeholder="note"
											class="w-20 border border-gray-200 px-1.5 py-1 text-xs focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										/>
										<button
											type="submit"
											class="border {isBad
												? 'border-red-200 bg-white text-red-600 hover:bg-red-50'
												: isNeutral
													? 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
													: 'border-blue-200 bg-white text-blue-600 hover:bg-blue-50'} px-2 py-1 text-xs transition"
										>
											{isBad ? 'I slipped' : isNeutral ? 'Log ✓' : 'Done ✓'}
										</button>
									</div>
								</form>
							{/if}
							<button
								onclick={() => startEdit(habit)}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
							>
								Edit
							</button>
							<button
								onclick={() => {
									expandedHabitId = expandedHabitId === habit.id ? null : habit.id;
									confirmingDeleteId = null;
								}}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
							>
								{expandedHabitId === habit.id ? 'Collapse' : 'Expand'}
							</button>
							{#if confirmingDeleteId === habit.id}
								<form method="post" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={habit.id} />
									<button
										type="submit"
										class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
									>
										Confirm?
									</button>
								</form>
							{:else}
								<button
									onclick={() => {
										confirmingDeleteId = habit.id;
									}}
									class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
								>
									Delete
								</button>
							{/if}
						</div>
					</div>

					{#if expandedHabitId === habit.id}
						{@const counts = occurrenceCountByDate(habit.id)}
						<div class="border-t border-gray-200 px-4 py-3">
							<div class="mb-2 text-xs font-medium text-gray-500">Last 365 days</div>
							<div class="overflow-x-auto">
								<div class="inline-flex items-start gap-px">
									{#each heatmapWeeks as week, wi (wi)}
										<div class="flex flex-col gap-px">
											{#each week as day, di (di)}
												{#if day}
													<button
														type="button"
														onclick={() => toggleOccurrence(habit.id, day)}
														class="h-2.5 w-2.5 cursor-pointer {isBad
															? badHeatmapColor(counts[day] || 0)
															: isNeutral
																? neutralHeatmapColor(counts[day] || 0)
																: goodHeatmapColor(counts[day] || 0)}"
														title={day}
													></button>
												{:else}
													<div class="h-2.5 w-2.5"></div>
												{/if}
											{/each}
										</div>
									{/each}
									<div class="ml-1 flex flex-col gap-px">
										{#each orderedDayLabels() as label}
											<span class="flex h-2.5 items-center text-[9px] leading-none text-gray-400"
												>{label}</span
											>
										{/each}
									</div>
								</div>
							</div>
							<div class="mt-2 flex items-center gap-2 text-xs text-gray-400">
								<span>Less</span>
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
								<span>More</span>
							</div>

							<div class="mt-3 flex items-center gap-2">
								<span class="text-xs font-medium text-gray-500">Log past entry:</span>
								<input
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
										<input
											name="notes"
											type="text"
											autocomplete="off"
											placeholder="note"
											class="w-20 border border-gray-200 px-1.5 py-1 text-xs focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										/>
										<button
											type="submit"
											disabled={!backdateInput}
											class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
										>
											Log
										</button>
									</div>
								</form>
							</div>

							{#if occ.length > 0}
								<div class="mt-3 divide-y divide-gray-100">
									{#each occ.slice(0, 10) as occurrence (occurrence.id)}
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
													<input
														name="notes"
														type="text"
														autocomplete="off"
														value={occurrence.notes ?? ''}
														placeholder="add note…"
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
															await update();
															confirmingOccurrenceDelete = null;
														};
													}}
												>
													<input type="hidden" name="id" value={occurrence.id} />
													<button
														type="submit"
														class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
													>
														Confirm?
													</button>
												</form>
												<button
													type="button"
													onclick={() => {
														confirmingOccurrenceDelete = null;
													}}
													class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
												>
													Cancel
												</button>
											{:else}
												<button
													type="button"
													onclick={() => {
														confirmingOccurrenceDelete = occurrence.id;
													}}
													class="text-xs text-gray-400 transition hover:text-red-500"
												>
													&times;
												</button>
											{/if}
										</div>
									{/each}
									{#if occ.length > 10}
										<div class="py-1.5 text-xs text-gray-400">
											and {occ.length - 10} more...
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
