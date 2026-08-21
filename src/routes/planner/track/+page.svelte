<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageServerData } from './$types';
	import { CATEGORY_FALLBACK_COLOR, CATEGORY_FALLBACK_LIGHT } from '$lib/colors.js';
	import { getAction } from '$lib/shortcuts';

	let { data }: { data: PageServerData } = $props();

	let selectedIndex = $state(0);
	let editingTimeId: number | null = $state(null);
	let editingDurationId: number | null = $state(null);
	let editingActivityId: number | null = $state(null);
	let confirmingDelete: number | null = $state(null);

	// The server returns one row shape for both kinds of block, so the union
	// that used to be assembled here is gone along with the second query.
	type UnifiedTask = (typeof data.tasks)[number];

	let allTasks = $derived(data.tasks);

	const statusOptions = [
		{ value: 'completed', label: 'Done', key: 'c' },
		{ value: 'delayed', label: 'Delayed', key: 'd' },
		{ value: 'early', label: 'Early', key: 'e' },
		{ value: 'skipped', label: 'Skip', key: 's' },
		{ value: 'pending', label: 'Reset', key: 'r' }
	];

	function catColor(catId: number | null): string {
		if (!catId) return CATEGORY_FALLBACK_COLOR;
		const cat = data.categories?.find((c: { id: number }) => c.id === catId);
		return cat?.color ?? CATEGORY_FALLBACK_COLOR;
	}

	function catColorLight(catId: number | null): string {
		if (!catId) return CATEGORY_FALLBACK_LIGHT;
		const cat = data.categories?.find((c: { id: number }) => c.id === catId);
		return cat?.colorLight ?? CATEGORY_FALLBACK_LIGHT;
	}

	function isFuture(task: UnifiedTask): boolean {
		if (task.scheduledAt) return task.scheduledAt > data.now;
		const nowTime = data.now.slice(11, 16);
		return task.startTime > nowTime;
	}

	function statusBadgeClass(status: string): string {
		const map: Record<string, string> = {
			pending: 'bg-gray-100 text-gray-600',
			completed: 'bg-green-100 text-green-700',
			delayed: 'bg-yellow-100 text-yellow-700',
			early: 'bg-blue-100 text-blue-700',
			skipped: 'bg-red-100 text-red-700'
		};
		return map[status] ?? 'bg-gray-100 text-gray-600';
	}

	function computeEndTime(startTime: string, durationMinutes: number): string {
		const [h, m] = startTime.split(':').map(Number);
		const total = h * 60 + m + durationMinutes;
		const eh = Math.floor(total / 60) % 24;
		const em = total % 60;
		return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
	}

	function formatDuration(minutes: number): string {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m}min`;
		if (m === 0) return `${h}h`;
		return `${h}h ${m}min`;
	}

	function formatWeekDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function navigateToDay(dayIndex: number) {
		const params = new URLSearchParams();
		if (data.weekMeta.monday !== currentMondayStr()) {
			params.set('week', data.weekMeta.monday);
		}
		params.set('day', String(dayIndex));
		goto(`/planner/track?${params.toString()}`);
	}

	function navigateWeek(direction: 'prev' | 'next') {
		const target = direction === 'prev' ? data.weekMeta.prevWeek : data.weekMeta.nextWeek;
		goto(`/planner/track?week=${target}`);
	}

	function currentMondayStr(): string {
		const now = new Date();
		const dow = now.getDay();
		const diff = dow === 0 ? -6 : 1 - dow;
		const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
		return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			editingTimeId = null;
			editingDurationId = null;
			editingActivityId = null;
			confirmingDelete = null;
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const action = getAction('/planner/track', e.key);
		if (!action) return;
		e.preventDefault();

		const tasks = allTasks;
		if (
			!tasks.length &&
			action !== 'prev-week' &&
			action !== 'next-week' &&
			action !== 'prev-day' &&
			action !== 'next-day'
		)
			return;

		switch (action) {
			case 'prev-week':
				navigateWeek('prev');
				break;
			case 'next-week':
				navigateWeek('next');
				break;
			case 'prev-day':
				if (data.selectedDayIndex > 0) navigateToDay(data.selectedDayIndex - 1);
				break;
			case 'next-day':
				if (data.selectedDayIndex < 6) navigateToDay(data.selectedDayIndex + 1);
				break;
			case 'navigate-down':
				confirmingDelete = null;
				selectedIndex = Math.min(selectedIndex + 1, tasks.length - 1);
				break;
			case 'navigate-up':
				confirmingDelete = null;
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'edit-time':
				editingTimeId = tasks[selectedIndex].id;
				break;
			case 'edit-duration':
				editingDurationId = tasks[selectedIndex].id;
				break;
			case 'edit-activity':
				editingActivityId = tasks[selectedIndex].id;
				break;
			case 'delete': {
				const task = tasks[selectedIndex];
				if (confirmingDelete === task.id) {
					const deleteForm = document.getElementById(`delete-form-${task.id}`);
					if (deleteForm instanceof HTMLFormElement) deleteForm.requestSubmit();
				} else {
					confirmingDelete = task.id;
				}
				break;
			}
			case 'mark-done':
			case 'mark-delayed':
			case 'mark-early':
			case 'mark-skipped':
			case 'reset-status': {
				const statusMap: Record<string, string> = {
					'mark-done': 'completed',
					'mark-delayed': 'delayed',
					'mark-early': 'early',
					'mark-skipped': 'skipped',
					'reset-status': 'pending'
				};
				const statusValue = statusMap[action];
				const form = document.getElementById(`status-form-${tasks[selectedIndex].id}`);
				if (form instanceof HTMLFormElement) {
					const statusInput = form.querySelector<HTMLInputElement>('input[name="status"]');
					if (statusInput) {
						statusInput.value = statusValue;
						form.requestSubmit();
					}
				}
				break;
			}
		}
	}

	function taskLabel(task: UnifiedTask): string {
		if (task.activityId && task.activityName) return task.activityName;
		if (task.blockActivityName) return task.blockActivityName;
		if (task.label) return task.label;
		if (task.categoryName) return task.categoryName;
		return 'Task';
	}

	function originalSlotLabel(task: UnifiedTask): string {
		if (task.blockActivityName) return task.blockActivityName;
		if (task.label) return task.label;
		if (task.categoryName) return task.categoryName;
		return 'Task';
	}

	function wasSwapped(task: UnifiedTask): boolean {
		if (!task.activityId) return false;
		if (task.mode === 'activity' && task.activityId === task.blockActivityId) return false;
		return true;
	}

	function activitiesForCategory(categoryId: number | null) {
		if (!categoryId) return [];
		return data.activities.filter((a: { categoryId: number }) => a.categoryId === categoryId);
	}

	function needsResolution(task: UnifiedTask): boolean {
		return (
			task.mode === 'category' &&
			['completed', 'delayed', 'early'].includes(task.status) &&
			!task.activityId
		);
	}

	function effectiveDuration(task: UnifiedTask): number {
		return task.durationOverride ?? task.durationMinutes ?? 60;
	}

	function categoryTotals(): { name: string; categoryId: number | null; minutes: number }[] {
		const totals: Record<string, { categoryId: number | null; minutes: number }> = {};
		for (const task of allTasks) {
			const cat = task.categoryName;
			if (!cat) continue;
			if (!totals[cat]) totals[cat] = { categoryId: task.categoryId, minutes: 0 };
			totals[cat].minutes += effectiveDuration(task);
		}
		return Object.entries(totals).map(([name, v]) => ({
			name,
			categoryId: v.categoryId,
			minutes: v.minutes
		}));
	}

	function isToday(dayIndex: number): boolean {
		return data.weekMeta.isCurrent && dayIndex === data.todayDayIndex;
	}

	$effect(() => {
		if (selectedIndex >= allTasks.length && allTasks.length > 0) {
			selectedIndex = allTasks.length - 1;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<button
				onclick={() => navigateWeek('prev')}
				class="border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
				title="Previous week ([)">&larr;</button
			>
			<span
				class="border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-sm"
				class:border-gray-900={data.weekMeta.isCurrent}
				class:text-gray-900={data.weekMeta.isCurrent}
			>
				W{data.weekMeta.weekNumber}, {data.weekMeta.weekYear}
			</span>
			<button
				onclick={() => navigateWeek('next')}
				class="border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
				title="Next week (])">&rarr;</button
			>
		</div>
		<div class="text-sm text-gray-500">
			{formatWeekDate(data.weekMeta.monday)} &mdash; {formatWeekDate(data.weekMeta.sunday)}
		</div>
	</div>

	<div class="flex gap-1">
		{#each data.weekdays as day, i (i)}
			{@const count = data.taskCountByDay[i] ?? 0}
			{@const today = isToday(i)}
			<button
				onclick={() => navigateToDay(i)}
				class="flex-1 border border-b-2 px-2 py-2 text-center text-xs transition {data.selectedDayIndex ===
				i
					? 'border-gray-300 bg-white font-semibold text-gray-900 shadow-card'
					: today
						? 'border-slate-300 bg-slate-100 font-medium text-gray-900'
						: 'border-gray-200 bg-white font-medium text-gray-500 hover:text-gray-900'}"
				style={data.selectedDayIndex === i ? 'border-bottom-color: var(--section-accent)' : ''}
			>
				{day.slice(0, 3)}
				{#if count > 0}
					<span class="ml-1 opacity-60">({count})</span>
				{/if}
			</button>
		{/each}
	</div>

	{#if allTasks.length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			No tasks for {data.weekdays[data.selectedDayIndex]}.
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-sm">
			{#each allTasks as task, i (task.id)}
				{@const future = isFuture(task)}
				<div
					class="flex items-center gap-4 border-l-4 px-4 py-3 transition-colors {i === selectedIndex
						? 'ring-2 ring-gray-900 ring-inset'
						: ''} {future ? 'opacity-50' : ''}"
					style="border-left-color: {catColor(task.categoryId)}; background-color: {catColorLight(
						task.categoryId
					)}30"
				>
					{#if task.kind === 'once'}
						<span class="shrink-0 text-xs text-blue-500" title="One-off block">★</span>
					{/if}

					{#if editingTimeId === task.id}
						<form
							method="post"
							action="?/updateScheduledAt"
							use:enhance={() => {
								return async ({ update }) => {
									await update();
									editingTimeId = null;
								};
							}}
							class="w-24 shrink-0"
						>
							<input type="hidden" name="id" value={task.id} />
							<input
								name="time"
								type="time"
								value={task.startTime}
								class="w-full border border-gray-300 px-1 py-0.5 font-mono text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								onblur={(e) => {
									const form = (e.currentTarget as HTMLInputElement).closest('form');
									if (form instanceof HTMLFormElement) form.requestSubmit();
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										const form = (e.currentTarget as HTMLInputElement).closest('form');
										if (form instanceof HTMLFormElement) form.requestSubmit();
									}
									if (e.key === 'Escape') {
										e.preventDefault();
										editingTimeId = null;
									}
								}}
							/>
						</form>
					{:else}
						<button
							type="button"
							onclick={() => (editingTimeId = task.id)}
							class="w-24 shrink-0 text-left font-mono text-sm text-gray-500 hover:text-gray-900"
							title="click to edit time"
						>
							{task.startTime} - {computeEndTime(task.startTime, effectiveDuration(task))}
						</button>
					{/if}

					{#if editingDurationId === task.id}
						<form
							method="post"
							action="?/updateDuration"
							use:enhance={() => {
								return async ({ update }) => {
									await update();
									editingDurationId = null;
								};
							}}
							class="w-16 shrink-0"
						>
							<input type="hidden" name="id" value={task.id} />
							<input
								name="minutes"
								type="number"
								min="0"
								step="5"
								value={effectiveDuration(task)}
								class="w-full border border-gray-300 px-1 py-0.5 font-mono text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								onblur={(e) => {
									const form = (e.currentTarget as HTMLInputElement).closest('form');
									if (form instanceof HTMLFormElement) form.requestSubmit();
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										const form = (e.currentTarget as HTMLInputElement).closest('form');
										if (form instanceof HTMLFormElement) form.requestSubmit();
									}
									if (e.key === 'Escape') {
										e.preventDefault();
										editingDurationId = null;
									}
								}}
							/>
						</form>
					{:else}
						<button
							type="button"
							onclick={() => (editingDurationId = task.id)}
							class="shrink-0 font-mono text-xs text-gray-400 hover:text-gray-700"
							title="click to edit duration"
						>
							{formatDuration(effectiveDuration(task))}{#if task.durationOverride !== null}*{/if}
						</button>
					{/if}

					{#if editingActivityId === task.id}
						<form
							method="post"
							action="?/resolveActivity"
							use:enhance={() => {
								return async ({ update }) => {
									await update();
									editingActivityId = null;
								};
							}}
							class="min-w-0 flex-1"
						>
							<input type="hidden" name="id" value={task.id} />
							<select
								name="activityId"
								class="w-full border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								onchange={(e) => {
									const form = (e.currentTarget as HTMLSelectElement).closest('form');
									if (form instanceof HTMLFormElement) form.requestSubmit();
								}}
								onkeydown={(e) => {
									if (e.key === 'Escape') {
										e.preventDefault();
										e.stopPropagation();
										editingActivityId = null;
									}
								}}
							>
								<option value="">— clear override —</option>
								{#each data.categories as cat}
									{@const catActivities = data.activities.filter(
										(a: { categoryName: string }) => a.categoryName === cat.name
									)}
									{#if catActivities.length > 0}
										<optgroup label={cat.name}>
											{#each catActivities as act}
												<option value={act.id} selected={act.id === task.activityId}
													>{act.name}</option
												>
											{/each}
										</optgroup>
									{/if}
								{/each}
							</select>
						</form>
					{:else}
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => (editingActivityId = task.id)}
									class="truncate text-sm font-medium text-gray-900 hover:text-gray-600"
									title="click to change activity (a)"
								>
									{taskLabel(task)}
								</button>
								{#if task.categoryName}
									<span class="text-xs text-gray-400">{task.categoryName}</span>
								{/if}
								{#if wasSwapped(task)}
									<span class="text-xs text-gray-400" title="originally: {originalSlotLabel(task)}"
										>↻</span
									>
								{/if}
							</div>
							{#if task.label && taskLabel(task) !== task.label}
								<p class="truncate text-xs text-gray-500">{task.label}</p>
							{/if}
						</div>
					{/if}

					<span class="shrink-0 px-2 py-0.5 text-xs font-medium {statusBadgeClass(task.status)}">
						{task.status}
					</span>

					{#if needsResolution(task)}
						{@const catActivities = activitiesForCategory(task.categoryId)}
						{#if catActivities.length > 0}
							<form method="post" action="?/resolveActivity" use:enhance class="shrink-0">
								<input type="hidden" name="id" value={task.id} />
								<select
									name="activityId"
									onchange={(e) => {
										const form = (e.currentTarget as HTMLSelectElement).closest('form');
										if (form instanceof HTMLFormElement) form.requestSubmit();
									}}
									class="border border-amber-300 bg-amber-50 px-1 py-0.5 text-xs text-gray-700 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								>
									<option value="">which?</option>
									{#each catActivities as act}
										<option value={act.id}>{act.name}</option>
									{/each}
								</select>
							</form>
						{/if}
					{/if}

					<form
						id="status-form-{task.id}"
						method="post"
						action="?/updateStatus"
						use:enhance
						class="flex shrink-0 gap-1"
					>
						<input type="hidden" name="id" value={task.id} />
						<input type="hidden" name="status" value="pending" />
						{#each statusOptions as opt}
							<button
								type="submit"
								onclick={(e) => {
									const form = (e.currentTarget as HTMLButtonElement).closest('form');
									const input = form?.querySelector<HTMLInputElement>('input[name="status"]');
									if (input) input.value = opt.value;
								}}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
								title="{opt.label} ({opt.key})"
							>
								{opt.label}
							</button>
						{/each}
					</form>

					{#if confirmingDelete === task.id}
						<div class="flex shrink-0 items-center gap-2">
							<form
								id="delete-form-{task.id}"
								method="post"
								action="?/deleteTask"
								use:enhance={() => {
									return async ({ update }) => {
										await update();
										confirmingDelete = null;
									};
								}}
							>
								<input type="hidden" name="id" value={task.id} />
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
									confirmingDelete = null;
								}}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
							>
								Cancel
							</button>
						</div>
					{:else}
						<button
							type="button"
							onclick={() => {
								confirmingDelete = task.id;
							}}
							class="text-xs text-gray-400 hover:text-red-500"
							title="Delete task (x)"
						>
							&times;
						</button>
					{/if}
				</div>
			{/each}
		</div>

		{@const totals = categoryTotals()}
		{#if totals.length > 0}
			<div class="flex gap-4 border border-gray-200 bg-white px-4 py-3 shadow-sm">
				{#each totals as { name, categoryId, minutes }}
					<div class="flex items-center gap-2">
						<span class="h-3 w-3 border-l-4" style="border-left-color: {catColor(categoryId)}"
						></span>
						<span class="text-sm font-medium text-gray-700">{name}</span>
						<span class="text-sm text-gray-500">{formatDuration(minutes)}</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
