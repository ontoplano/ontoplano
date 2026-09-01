<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { getAction } from '$lib/shortcuts';
	import { keepInView } from '$lib/actions/keep-in-view';
	import EmptyState from '$lib/components/EmptyState.svelte';

	let { data }: { data: PageData } = $props();

	let selectedDay: number = $state(0);
	let selectedIndex: number = $state(0);

	/**
	 * Filters, because a week of history is a hundred rows.
	 *
	 * The two questions somebody actually brings to this page are "where did my
	 * time go" — one category at a time — and "what did I keep not doing", which
	 * is the skipped rows and nothing else.
	 */
	let categoryFilter: number | 'all' = $state('all');
	let statusFilter: string = $state('all');

	function catColor(catId: number | null): string {
		if (!catId) return CATEGORY_FALLBACK_COLOR;
		const cat = data.categories.find((c) => c.id === catId);
		return cat?.color ?? CATEGORY_FALLBACK_COLOR;
	}

	/*
	 * Done is blue, not green.
	 *
	 * Green against grey is the one distinction this app never leans on — see
	 * the same rule in the watchers' alerts. The word is there either way; the
	 * colour is only there to make the done ones findable at a glance, and blue
	 * does that for everybody.
	 */
	const statusBadgeClass: Record<string, string> = {
		todo: 'bg-gray-100 text-gray-600',
		doing: 'bg-blue-50 text-blue-600',
		done: 'bg-blue-100 text-blue-800',
		skipped: 'bg-gray-200 text-gray-500'
	};

	function instancesForDay(day: number) {
		return (data.instancesByDay[day] ?? []).filter(
			(inst) =>
				(categoryFilter === 'all' || inst.categoryId === categoryFilter) &&
				(statusFilter === 'all' || inst.status === statusFilter)
		);
	}

	/** How many a day holds before the filters, so the strip still says the truth. */
	function countForDay(day: number) {
		return (data.instancesByDay[day] ?? []).length;
	}

	const filtering = $derived(categoryFilter !== 'all' || statusFilter !== 'all');

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

	/** The last column that has happened — the whole strip, in a past week. */
	function lastPastDay(): number {
		for (let i = 6; i >= 0; i--) if (!data.days[i].future) return i;
		return 0;
	}

	function formatWeekDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function navigateWeek(direction: 'prev' | 'next') {
		// There is no history of a week that has not happened. The button is
		// disabled for the same reason, but the shortcut has to know it too.
		if (direction === 'next' && !data.weekMeta.hasNextWeek) return;
		const target = direction === 'prev' ? data.weekMeta.prevWeek : data.weekMeta.nextWeek;
		// The route is resolved; the rule cannot see through the query string.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`${resolve('/planner/history')}?week=${target}`);
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
			case 'next-day': {
				const last = lastPastDay();
				if (selectedDay >= last) break;
				selectedDay = selectedDay + 1;
				selectedIndex = 0;
				break;
			}
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
	<div class="flex items-center justify-between gap-2 sm:justify-end">
		<!-- The range sits with the control on a phone rather than centred on a
		     line of its own, which cost a whole row to say six words. -->
		<span class="text-sm text-gray-500 sm:hidden">
			{formatWeekDate(data.weekMeta.monday)} &mdash; {formatWeekDate(data.weekMeta.sunday)}
		</span>
		<div class="flex items-center gap-1" data-tour="history-week">
			<button onclick={() => navigateWeek('prev')} class="icon-btn" title="Previous week ([)"
				>&larr;</button
			>
			<span
				class="border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-sm"
			>
				W{data.weekMeta.weekNumber}, {data.weekMeta.weekYear}
			</span>
			<!--
				A week that has not happened has no history, so there is nothing to
				walk into. Disabled rather than hidden: the arrow disappearing under
				the cursor is worse than one that is plainly at the end.
			-->
			<button
				onclick={() => navigateWeek('next')}
				class="icon-btn"
				disabled={!data.weekMeta.hasNextWeek}
				title={data.weekMeta.hasNextWeek ? 'Next week (])' : 'This is the latest week'}
				>&rarr;</button
			>
		</div>
	</div>

	<div class="hidden text-center text-sm text-gray-500 sm:block">
		{formatWeekDate(data.weekMeta.monday)} &mdash; {formatWeekDate(data.weekMeta.sunday)}
	</div>

	{#if data.summary.total > 0}
		<div class="flex gap-3 text-xs text-gray-500" data-tour="history-summary">
			<span>{data.summary.total} tasks</span>
			{#if data.summary.done > 0}
				<span class="text-blue-700">{data.summary.done} done</span>
			{/if}
			{#if data.summary.early > 0}
				<span class="text-gray-600">{data.summary.early} early</span>
			{/if}
			{#if data.summary.late > 0}
				<span class="text-gray-500">{data.summary.late} late</span>
			{/if}
			{#if data.summary.skipped > 0}
				<span class="text-gray-500">{data.summary.skipped} skipped</span>
			{/if}
			{#if data.summary.todo > 0}
				<span class="text-gray-500">{data.summary.todo} to do</span>
			{/if}
		</div>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<select
			bind:value={categoryFilter}
			class="input w-auto py-1 pr-8 text-xs"
			aria-label="Filter by category"
		>
			<option value="all">Every category</option>
			{#each data.categories as cat (cat.id)}
				<option value={cat.id}>{cat.name}</option>
			{/each}
		</select>

		<select
			bind:value={statusFilter}
			class="input w-auto py-1 pr-8 text-xs"
			aria-label="Filter by status"
		>
			<option value="all">Whatever happened</option>
			<option value="done">Done</option>
			<option value="skipped">Skipped</option>
			<option value="todo">Never touched</option>
		</select>

		{#if filtering}
			<button
				type="button"
				class="btn btn-sm"
				onclick={() => {
					categoryFilter = 'all';
					statusFilter = 'all';
				}}
			>
				Clear
			</button>
		{/if}
	</div>

	<!--
		Each column says its own date. A strip reading Mon…Sun leaves somebody
		counting along from the week's range to work out which Wednesday they are
		looking at, every time. The date leads because that is the thing being
		identified; the weekday is how it is remembered.
	-->
	<div class="flex gap-1">
		{#each data.days as day, i (day.date)}
			{@const count = filtering ? instancesForDay(i).length : countForDay(i)}
			<button
				onclick={() => (selectedDay = i)}
				disabled={day.future}
				title={day.future ? 'Not yet' : day.date}
				class="flex-1 border px-2 py-2 text-center text-xs font-medium transition {selectedDay === i
					? 'border-gray-900 bg-gray-900 text-white'
					: day.future
						? 'border-gray-200 bg-gray-50 text-gray-400'
						: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}"
			>
				<!--
					Two lines on a phone, one sentence on a wide screen.

					Seven columns at 412px cannot hold "Aug 24 — Mon (3)", and
					stacking it whole made seven tall boxes of three crowded lines.
					The month is already in the range above the strip, so the phone
					gets the weekday and the date, which is all that tells one column
					from another.
				-->
				<span class="flex flex-col items-center justify-center leading-tight sm:flex-row sm:gap-1">
					<span class="opacity-60 sm:hidden">{day.name.slice(0, 3)}</span>
					<span class="tabular hidden sm:inline">{formatWeekDate(day.date)}</span>
					<span class="hidden opacity-40 sm:inline">&mdash;</span>
					<span>
						<span class="tabular sm:hidden">{day.date.slice(-2)}</span>
						<span class="hidden sm:inline">{day.name.slice(0, 3)}</span>
						{#if count > 0}
							<span class="opacity-60">({count})</span>
						{/if}
					</span>
				</span>
			</button>
		{/each}
	</div>

	{#if instancesForDay(selectedDay).length === 0}
		<div class="border border-gray-200 bg-white shadow-sm">
			<EmptyState
				icon="clock"
				title={filtering
					? `Nothing matches on ${data.weekdays[selectedDay]}`
					: `No tasks recorded for ${data.weekdays[selectedDay]}`}
				description={filtering ? 'Try clearing the filters, or another day.' : ''}
			/>
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card">
			{#each instancesForDay(selectedDay) as inst, i (inst.id)}
				<div
					use:keepInView={selectedIndex === i}
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
							<span class="ml-1 text-xs text-gray-500">{inst.categoryName}</span>
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
