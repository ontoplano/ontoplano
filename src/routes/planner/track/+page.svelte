<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageServerData } from './$types';
	import { CATEGORY_FALLBACK_COLOR, CATEGORY_FALLBACK_LIGHT } from '$lib/colors.js';

	let { data }: { data: PageServerData } = $props();

	let selectedIndex = $state(0);
	let editingTimeId: string | null = $state(null);
	let editingDurationId: string | null = $state(null);
	let editingActivityId: string | null = $state(null);

	const statusOptions = [
		{ value: 'completed', label: 'Done', key: 'c' },
		{ value: 'delayed', label: 'Delayed', key: 'd' },
		{ value: 'early', label: 'Early', key: 'e' },
		{ value: 'skipped', label: 'Skip', key: 's' },
		{ value: 'pending', label: 'Reset', key: 'r' }
	];

	type UnifiedTask = {
		source: 'regular' | 'exceptional';
		uid: string;
		id: number;
		startTime: string;
		status: string;
		completedAt: string | null;
		notes: string | null;
		categoryId: number | null;
		categoryName: string | null;
		activityId: number | null;
		activityName: string | null;
		slotActivityId: number | null;
		slotActivityName: string | null;
		slotMode: string;
		slotLabel: string | null;
		durationMinutes: number;
		durationOverride: number | null;
		activityColor: string | null;
		scheduledAt?: string;
	};

	function buildUnifiedTasks(): UnifiedTask[] {
		const unified: UnifiedTask[] = [];

		for (const t of data.tasks) {
			unified.push({
				source: 'regular',
				uid: `r-${t.id}`,
				id: t.id,
				startTime: formatTime(t.scheduledAt),
				status: t.status,
				completedAt: t.completedAt,
				notes: t.notes,
				categoryId: t.categoryId,
				categoryName: t.categoryName,
				activityId: t.activityId,
				activityName: t.activityName,
				slotActivityId: t.slotActivityId,
				slotActivityName: t.slotActivityName,
				slotMode: t.slotMode,
				slotLabel: t.slotLabel,
				durationMinutes: t.slotDuration ?? 60,
				durationOverride: t.durationOverride,
				activityColor: t.activityColor,
				scheduledAt: t.scheduledAt
			});
		}

		for (const e of data.exceptionalTasks) {
			unified.push({
				source: 'exceptional',
				uid: `e-${e.id}`,
				id: e.id,
				startTime: e.startTime,
				status: e.status,
				completedAt: e.completedAt,
				notes: e.notes,
				categoryId: e.categoryId,
				categoryName: e.categoryName,
				activityId: e.activityId,
				activityName: e.activityName,
				slotActivityId: e.slotActivityId,
				slotActivityName: e.slotActivityName,
				slotMode: e.mode,
				slotLabel: e.label,
				durationMinutes: e.durationMinutes,
				durationOverride: e.durationOverride,
				activityColor: e.activityColor,
				scheduledAt: undefined
			});
		}

		unified.sort((a, b) => a.startTime.localeCompare(b.startTime));
		return unified;
	}

	let allTasks = $derived(buildUnifiedTasks());

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

	function formatTime(scheduledAt: string): string {
		return scheduledAt.slice(11, 16);
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
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === '[') {
			e.preventDefault();
			navigateWeek('prev');
			return;
		}
		if (e.key === ']') {
			e.preventDefault();
			navigateWeek('next');
			return;
		}
		if (e.key === 'h') {
			e.preventDefault();
			if (data.selectedDayIndex > 0) navigateToDay(data.selectedDayIndex - 1);
			return;
		}
		if (e.key === 'l') {
			e.preventDefault();
			if (data.selectedDayIndex < 6) navigateToDay(data.selectedDayIndex + 1);
			return;
		}

		const tasks = allTasks;
		if (!tasks.length) return;

		switch (e.key) {
			case 'j':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, tasks.length - 1);
				break;
			case 'k':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 't':
				e.preventDefault();
				editingTimeId = tasks[selectedIndex].uid;
				break;
			case 'D':
				e.preventDefault();
				editingDurationId = tasks[selectedIndex].uid;
				break;
			case 'a':
				e.preventDefault();
				editingActivityId = tasks[selectedIndex].uid;
				break;
			case 'x': {
				e.preventDefault();
				const deleteForm = document.getElementById(`delete-form-${tasks[selectedIndex].uid}`);
				if (deleteForm instanceof HTMLFormElement) deleteForm.requestSubmit();
				break;
			}
			case 'Escape':
				e.preventDefault();
				editingTimeId = null;
				editingDurationId = null;
				editingActivityId = null;
				break;
			case 'c':
			case 'd':
			case 'e':
			case 's':
			case 'r': {
				e.preventDefault();
				const opt = statusOptions.find((o) => o.key === e.key);
				if (opt) {
					const form = document.getElementById(`status-form-${tasks[selectedIndex].uid}`);
					if (form instanceof HTMLFormElement) {
						const statusInput = form.querySelector<HTMLInputElement>('input[name="status"]');
						if (statusInput) {
							statusInput.value = opt.value;
							form.requestSubmit();
						}
					}
				}
				break;
			}
		}
	}

	function taskLabel(task: UnifiedTask): string {
		if (task.activityId && task.activityName) return task.activityName;
		if (task.slotActivityName) return task.slotActivityName;
		if (task.slotLabel) return task.slotLabel;
		if (task.categoryName) return task.categoryName;
		return 'Task';
	}

	function originalSlotLabel(task: UnifiedTask): string {
		if (task.slotActivityName) return task.slotActivityName;
		if (task.slotLabel) return task.slotLabel;
		if (task.categoryName) return task.categoryName;
		return 'Task';
	}

	function wasSwapped(task: UnifiedTask): boolean {
		if (!task.activityId) return false;
		if (task.slotMode === 'activity' && task.activityId === task.slotActivityId) return false;
		return true;
	}

	function activitiesForCategory(categoryId: number | null) {
		if (!categoryId) return [];
		return data.activities.filter((a: { categoryId: number }) => a.categoryId === categoryId);
	}

	function needsResolution(task: UnifiedTask): boolean {
		return (
			task.slotMode === 'category' &&
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

	function statusAction(task: UnifiedTask): string {
		return task.source === 'exceptional' ? '?/updateExceptionalStatus' : '?/updateStatus';
	}

	function activityAction(task: UnifiedTask): string {
		return task.source === 'exceptional' ? '?/resolveExceptionalActivity' : '?/resolveActivity';
	}

	function timeAction(task: UnifiedTask): string {
		return task.source === 'exceptional' ? '?/updateExceptionalTime' : '?/updateScheduledAt';
	}

	function durationAction(task: UnifiedTask): string {
		return task.source === 'exceptional' ? '?/updateExceptionalDuration' : '?/updateDuration';
	}

	function deleteAction(task: UnifiedTask): string {
		return task.source === 'exceptional' ? '?/deleteExceptional' : '?/deleteTask';
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

	<div class="text-xs text-gray-400">
		<kbd class="border border-gray-300 bg-gray-50 px-1">h</kbd>/<kbd
			class="border border-gray-300 bg-gray-50 px-1">l</kbd
		>
		switch day &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">j</kbd>/<kbd
			class="border border-gray-300 bg-gray-50 px-1">k</kbd
		>
		navigate &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">[</kbd>/<kbd
			class="border border-gray-300 bg-gray-50 px-1">]</kbd
		>
		prev/next week &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">c</kbd> done
		<kbd class="border border-gray-300 bg-gray-50 px-1">d</kbd> delayed
		<kbd class="border border-gray-300 bg-gray-50 px-1">e</kbd> early
		<kbd class="border border-gray-300 bg-gray-50 px-1">s</kbd> skip
		<kbd class="border border-gray-300 bg-gray-50 px-1">r</kbd> reset &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">t</kbd> time
		<kbd class="border border-gray-300 bg-gray-50 px-1">D</kbd> duration
		<kbd class="border border-gray-300 bg-gray-50 px-1">a</kbd> activity
		<kbd class="border border-gray-300 bg-gray-50 px-1">x</kbd> delete
	</div>

	<div class="flex gap-1">
		{#each data.weekdays as day, i (i)}
			{@const count = data.taskCountByDay[i] ?? 0}
			{@const today = isToday(i)}
			{@const catId = data.tasks.find((t: any) => {
				const d = new Date(t.scheduledAt).getDay();
				return d === i || (d === 0 && i === 6) || d === i + 1;
			})?.categoryId}
			<button
				onclick={() => navigateToDay(i)}
				class="flex-1 border px-2 py-2 text-center text-xs font-medium transition {data.selectedDayIndex ===
				i
					? 'border-gray-900 bg-gray-900 text-white'
					: today
						? 'border-slate-400 bg-slate-100 text-gray-900'
						: 'border-gray-200 bg-white text-gray-600 hover:bg-slate-50'}"
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
			{#each allTasks as task, i (task.uid)}
				{@const future = isFuture(task)}
				<div
					class="flex items-center gap-4 border-l-4 px-4 py-3 transition-colors {i === selectedIndex
						? 'ring-2 ring-gray-900 ring-inset'
						: ''} {future ? 'opacity-50' : ''}"
					style="border-left-color: {catColor(task.categoryId)}; background-color: {catColorLight(
						task.categoryId
					)}30"
				>
					{#if task.source === 'exceptional'}
						<span class="shrink-0 text-xs text-blue-500" title="Exceptional slot">★</span>
					{/if}

					{#if editingTimeId === task.uid}
						<form
							method="post"
							action={timeAction(task)}
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
							onclick={() => (editingTimeId = task.uid)}
							class="w-24 shrink-0 text-left font-mono text-sm text-gray-500 hover:text-gray-900"
							title="click to edit time"
						>
							{task.startTime} - {computeEndTime(
								task.startTime,
								effectiveDuration(task)
							)}
						</button>
					{/if}

					{#if editingDurationId === task.uid}
						<form
							method="post"
							action={durationAction(task)}
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
							onclick={() => (editingDurationId = task.uid)}
							class="shrink-0 font-mono text-xs text-gray-400 hover:text-gray-700"
							title="click to edit duration"
						>
							{formatDuration(effectiveDuration(task))}{#if task.durationOverride !== null}*{/if}
						</button>
					{/if}

					{#if editingActivityId === task.uid}
						<form
							method="post"
							action={activityAction(task)}
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
									onclick={() => (editingActivityId = task.uid)}
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
							{#if task.slotLabel && taskLabel(task) !== task.slotLabel}
								<p class="truncate text-xs text-gray-500">{task.slotLabel}</p>
							{/if}
						</div>
					{/if}

					<span class="shrink-0 px-2 py-0.5 text-xs font-medium {statusBadgeClass(task.status)}">
						{task.status}
					</span>

					{#if needsResolution(task)}
						{@const catActivities = activitiesForCategory(task.categoryId)}
						{#if catActivities.length > 0}
							<form method="post" action={activityAction(task)} use:enhance class="shrink-0">
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
						id="status-form-{task.uid}"
						method="post"
						action={statusAction(task)}
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

					<form
						id="delete-form-{task.uid}"
						method="post"
						action={deleteAction(task)}
						use:enhance
						class="shrink-0"
					>
						<input type="hidden" name="id" value={task.id} />
						<button
							type="submit"
							class="px-1 py-0.5 text-xs text-gray-300 transition hover:text-red-600"
							title="Delete task (x)">×</button
						>
					</form>
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
