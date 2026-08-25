<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageServerData } from './$types';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { getAction } from '$lib/shortcuts';

	let { data }: { data: PageServerData } = $props();

	let selectedDay: number = $state(0);
	let selectedIndex: number = $state(0);

	function catColor(catId: number | null): string {
		if (!catId) return CATEGORY_FALLBACK_COLOR;
		const cat = data.categories?.find((c: { id: number }) => c.id === catId);
		return cat?.color ?? CATEGORY_FALLBACK_COLOR;
	}

	const statusBadgeClass: Record<string, string> = {
		todo: 'bg-gray-100 text-gray-600',
		doing: 'bg-blue-100 text-blue-700',
		done: 'bg-green-100 text-green-700',
		skipped: 'bg-gray-200 text-gray-500'
	};

	function instancesForDay(day: number) {
		return data.instancesByDay[day] ?? [];
	}

	function instanceLabel(inst: {
		slotMode: string | null;
		activityName: string | null;
		slotLabel: string | null;
		categoryName: string | null;
	}): string {
		if (inst.slotMode === 'activity' && inst.activityName) return inst.activityName;
		if (inst.slotLabel) return inst.slotLabel;
		if (inst.categoryName) return inst.categoryName;
		return 'Task';
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

	function navigateWeek(direction: 'prev' | 'next') {
		const target = direction === 'prev' ? data.weekMeta.prevWeek : data.weekMeta.nextWeek;
		goto(`/planner/history?week=${target}`);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const items = instancesForDay(selectedDay);
		const action = getAction('/planner/history', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'prev-week':
				navigateWeek('prev');
				break;
			case 'next-week':
				navigateWeek('next');
				break;
			case 'prev-day':
				selectedDay = Math.max(selectedDay - 1, 0);
				selectedIndex = 0;
				break;
			case 'next-day':
				selectedDay = Math.min(selectedDay + 1, 6);
				selectedIndex = 0;
				break;
			case 'navigate-down':
				if (items.length > 0) selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
				break;
			case 'navigate-up':
				if (items.length > 0) selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-end">
		<div class="flex items-center gap-2">
			<button onclick={() => navigateWeek('prev')} class="btn btn-sm" title="Previous week ([)"
				>&larr;</button
			>
			<span
				class="border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-sm"
			>
				W{data.weekMeta.weekNumber}, {data.weekMeta.weekYear}
			</span>
			<button onclick={() => navigateWeek('next')} class="btn btn-sm" title="Next week (])"
				>&rarr;</button
			>
		</div>
	</div>

	<div class="text-center text-sm text-gray-500">
		{formatWeekDate(data.weekMeta.monday)} &mdash; {formatWeekDate(data.weekMeta.sunday)}
	</div>

	{#if data.summary.total > 0}
		<div class="flex gap-3 text-xs text-gray-500">
			<span>{data.summary.total} tasks</span>
			{#if data.summary.done > 0}
				<span class="text-green-600">{data.summary.done} done</span>
			{/if}
			{#if data.summary.early > 0}
				<span class="text-blue-600">{data.summary.early} early</span>
			{/if}
			{#if data.summary.late > 0}
				<span class="text-gray-500">{data.summary.late} late</span>
			{/if}
			{#if data.summary.skipped > 0}
				<span class="text-gray-500">{data.summary.skipped} skipped</span>
			{/if}
			{#if data.summary.todo > 0}
				<span class="text-gray-400">{data.summary.todo} to do</span>
			{/if}
		</div>
	{/if}

	<div class="flex gap-1">
		{#each data.weekdays as day, i (i)}
			{@const count = instancesForDay(i).length}
			<button
				onclick={() => (selectedDay = i)}
				class="flex-1 border px-2 py-2 text-center text-xs font-medium transition {selectedDay === i
					? 'border-gray-900 bg-gray-900 text-white'
					: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}"
			>
				{day.slice(0, 3)}
				{#if count > 0}
					<span class="ml-1 opacity-60">({count})</span>
				{/if}
			</button>
		{/each}
	</div>

	{#if instancesForDay(selectedDay).length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			No tasks recorded for {data.weekdays[selectedDay]}.
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card">
			{#each instancesForDay(selectedDay) as inst, i (inst.id)}
				<div
					class="flex items-center gap-4 border-l-4 px-4 py-3 {selectedIndex === i
						? 'bg-gray-100'
						: ''}"
					style="border-left-color: {catColor(inst.categoryId)}"
				>
					<div
						class="w-24 shrink-0 font-mono text-sm text-gray-500"
						title={formatDuration(inst.slotDuration ?? 60)}
					>
						{inst.slotStartTime} - {computeEndTime(
							inst.slotStartTime ?? '00:00',
							inst.slotDuration ?? 60
						)}
					</div>
					<div class="min-w-0 flex-1">
						<span class="text-sm font-medium text-gray-900">{instanceLabel(inst)}</span>
						{#if inst.slotMode === 'activity' && inst.categoryName}
							<span class="ml-1 text-xs text-gray-400">{inst.categoryName}</span>
						{/if}
						{#if inst.slotLabel && instanceLabel(inst) !== inst.slotLabel}
							<p class="truncate text-xs text-gray-500">{inst.slotLabel}</p>
						{/if}
					</div>
					<span
						class="shrink-0 px-2 py-0.5 text-xs font-medium {statusBadgeClass[inst.status] ??
							'bg-gray-100 text-gray-600'}"
					>
						{inst.status}
					</span>
					{#if inst.slotMode === 'category' && inst.activityName}
						<span class="shrink-0 text-xs text-gray-500">({inst.activityName})</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
