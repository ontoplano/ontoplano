<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let selectedHabitIndex = $state(0);
	let expandedHabitId: number | null = $state(null);

	function occurrencesForHabit(habitId: number) {
		return data.occurrences.filter((o) => o.habitId === habitId);
	}

	function occurrenceCountByDate(habitId: number): Record<string, number> {
		const counts: Record<string, number> = {};
		for (const o of data.occurrences) {
			if (o.habitId !== habitId) continue;
			counts[o.date] = (counts[o.date] || 0) + 1;
		}
		return counts;
	}

	function buildHeatmapWeeks(): string[][] {
		const weeks: string[][] = [];
		const today = new Date();

		const endDay = new Date(today);
		const startDay = new Date(today);
		startDay.setDate(startDay.getDate() - 364);

		const startDow = startDay.getDay();
		const adjustedStart = new Date(startDay);
		if (startDow !== 1) {
			const daysToMonday = startDow === 0 ? 6 : startDow - 1;
			adjustedStart.setDate(adjustedStart.getDate() - daysToMonday);
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

	function heatmapColor(count: number): string {
		if (count === 0) return 'bg-gray-100';
		if (count === 1) return 'bg-red-200';
		if (count === 2) return 'bg-red-400';
		return 'bg-red-600';
	}

	const heatmapWeeks = buildHeatmapWeeks();

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		switch (e.key) {
			case 'j':
				e.preventDefault();
				selectedHabitIndex = Math.min(selectedHabitIndex + 1, data.habits.length - 1);
				break;
			case 'k':
				e.preventDefault();
				selectedHabitIndex = Math.max(selectedHabitIndex - 1, 0);
				break;
			case 'n':
				e.preventDefault();
				showForm = true;
				tick().then(() => {
					const nameInput = document.querySelector<HTMLInputElement>('input[name="name"]');
					nameInput?.focus();
				});
				break;
			case 'Enter':
				e.preventDefault();
				if (data.habits.length > 0) {
					const habit = data.habits[selectedHabitIndex];
					expandedHabitId = expandedHabitId === habit.id ? null : habit.id;
				}
				break;
			case 'Escape':
				e.preventDefault();
				if (showForm) {
					showForm = false;
				} else {
					expandedHabitId = null;
				}
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Bad Habits</h1>
		<button
			onclick={() => {
				showForm = !showForm;
				if (!showForm) return;
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

	<div class="text-xs text-gray-400">
		<kbd class="border border-gray-300 bg-gray-50 px-1">j</kbd>/<kbd
			class="border border-gray-300 bg-gray-50 px-1">k</kbd
		>
		navigate &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">n</kbd> new &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">Enter</kbd> expand &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">Esc</kbd> close
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if showForm}
		<form
			method="post"
			action="?/create"
			use:enhance={() => {
				return async ({ update }) => {
					await update();
					showForm = false;
				};
			}}
			class="space-y-3 border border-gray-200 bg-white p-4 shadow-sm"
		>
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Name</span>
				<input
					name="name"
					type="text"
					required
					placeholder="e.g. smoking, biting nails"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Description</span>
				<input
					name="description"
					type="text"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<button
				type="submit"
				class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
			>
				Create
			</button>
		</form>
	{/if}

	{#if data.habits.length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			No bad habits tracked. Add one to start monitoring.
		</div>
	{:else}
		<div class="space-y-3">
			{#each data.habits as habit, i (habit.id)}
				{@const occ = occurrencesForHabit(habit.id)}
				{@const todayLogged = occ.some((o) => o.date === data.today)}
				<div
					class="border border-gray-200 bg-white shadow-sm {i === selectedHabitIndex
						? 'ring-2 ring-gray-900 ring-inset'
						: ''}"
				>
					<div class="flex items-center gap-4 px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium text-gray-900">{habit.name}</span>
								<span class="text-xs text-gray-400">{occ.length} occurrences</span>
							</div>
							{#if habit.description}
								<p class="truncate text-xs text-gray-500">{habit.description}</p>
							{/if}
						</div>

						<div class="flex shrink-0 items-center gap-2">
							{#if todayLogged}
								<span
									class="border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600"
									>logged today</span
								>
							{:else}
								<form method="post" action="?/logOccurrence" use:enhance>
									<input type="hidden" name="habitId" value={habit.id} />
									<input type="hidden" name="date" value={data.today} />
									<button
										type="submit"
										class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
									>
										I slipped
									</button>
								</form>
							{/if}
							<button
								onclick={() => {
									expandedHabitId = expandedHabitId === habit.id ? null : habit.id;
								}}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
							>
								{expandedHabitId === habit.id ? 'Collapse' : 'Expand'}
							</button>
							<form method="post" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={habit.id} />
								<button
									type="submit"
									class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
								>
									Delete
								</button>
							</form>
						</div>
					</div>

					{#if expandedHabitId === habit.id}
						{@const counts = occurrenceCountByDate(habit.id)}
						<div class="border-t border-gray-200 px-4 py-3">
							<div class="mb-2 text-xs font-medium text-gray-500">Last 365 days</div>
							<div class="overflow-x-auto">
								<div class="inline-flex gap-px">
									{#each heatmapWeeks as week, wi (wi)}
										<div class="flex flex-col gap-px">
											{#each week as day, di (di)}
												{#if day}
													<div
														class="h-2.5 w-2.5 {heatmapColor(counts[day] || 0)}"
														title="{day}: {counts[day] || 0} occurrence{(counts[day] || 0) === 1
															? ''
															: 's'}"
													></div>
												{:else}
													<div class="h-2.5 w-2.5"></div>
												{/if}
											{/each}
										</div>
									{/each}
								</div>
							</div>
							<div class="mt-2 flex items-center gap-2 text-xs text-gray-400">
								<span>Less</span>
								<div class="flex gap-px">
									<div class="h-2.5 w-2.5 bg-gray-100"></div>
									<div class="h-2.5 w-2.5 bg-red-200"></div>
									<div class="h-2.5 w-2.5 bg-red-400"></div>
									<div class="h-2.5 w-2.5 bg-red-600"></div>
								</div>
								<span>More</span>
							</div>

							{#if occ.length > 0}
								<div class="mt-3 divide-y divide-gray-100">
									{#each occ.slice(0, 10) as occurrence (occurrence.id)}
										<div class="flex items-center justify-between py-1.5">
											<div class="flex items-center gap-2">
												<span class="text-xs font-medium text-gray-600">{occurrence.date}</span>
												{#if occurrence.notes}
													<span class="text-xs text-gray-400">{occurrence.notes}</span>
												{/if}
											</div>
											<form method="post" action="?/deleteOccurrence" use:enhance>
												<input type="hidden" name="id" value={occurrence.id} />
												<button
													type="submit"
													class="text-xs text-gray-400 transition hover:text-red-500"
												>
													&times;
												</button>
											</form>
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
