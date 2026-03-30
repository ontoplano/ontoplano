<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types.js';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let slotMode: 'category' | 'activity' = $state('activity');
	let selectedDay: number = $state(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
	let selectedIndex: number = $state(0);

	// Multiselect state
	let selectedIds: Set<number> = $state(new Set());
	let multiselect = $state(false);
	let showCopyPanel = $state(false);
	let copyTargetDays: Set<number> = $state(new Set());

	// Time input ref for auto-focus
	let timeInput: HTMLInputElement | undefined = $state(undefined);

	// Slot type alias
	type Slot = (typeof data.slots)[number];

	const categoryColors: Record<string, string> = {
		duty: 'border-l-duty',
		skill: 'border-l-skill',
		money: 'border-l-money'
	};

	function slotsForDay(day: number): Slot[] {
		return data.slots.filter((s: Slot) => s.weekday === day);
	}

	function slotLabel(slot: (typeof data.slots)[number]): string {
		if (slot.mode === 'activity' && slot.activityName) return slot.activityName;
		if (slot.label) return slot.label;
		if (slot.categoryName) return slot.categoryName;
		return 'Slot';
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

	function startEdit(slot: (typeof data.slots)[number]) {
		editingId = slot.id;
		slotMode = slot.mode as 'category' | 'activity';
		showForm = true;
		tick().then(() => timeInput?.focus());
	}

	function startNew() {
		showForm = true;
		editingId = null;
		tick().then(() => timeInput?.focus());
	}

	function goToNextWeek() {
		goto(`/planner?week=${data.weekMeta.nextWeek}`);
	}

	function goToCurrentWeek() {
		goto('/planner');
	}

	function toggleSlotSelection(id: number) {
		if (selectedIds.has(id)) {
			selectedIds = new Set([...selectedIds].filter((x) => x !== id));
		} else {
			selectedIds = new Set([...selectedIds, id]);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (showCopyPanel) {
			if (e.key === 'Escape') {
				e.preventDefault();
				showCopyPanel = false;
			}
			return;
		}

		if (multiselect) {
			const slots = slotsForDay(selectedDay);
			switch (e.key) {
				case 'v':
					e.preventDefault();
					multiselect = false;
					selectedIds = new Set();
					return;
				case ' ':
					e.preventDefault();
					if (slots.length > 0 && slots[selectedIndex]) {
						toggleSlotSelection(slots[selectedIndex].id);
					}
					return;
				case 'x':
					e.preventDefault();
					if (selectedIds.size > 0) {
						const form = document.getElementById('bulk-delete-form');
						if (form instanceof HTMLFormElement) form.requestSubmit();
					}
					return;
				case 'p':
					e.preventDefault();
					if (selectedIds.size > 0) {
						showCopyPanel = true;
						copyTargetDays = new Set();
					}
					return;
				case 'Escape':
					e.preventDefault();
					multiselect = false;
					selectedIds = new Set();
					return;
				case 'h':
					e.preventDefault();
					selectedDay = Math.max(selectedDay - 1, 0);
					selectedIndex = 0;
					return;
				case 'l':
					e.preventDefault();
					selectedDay = Math.min(selectedDay + 1, 6);
					selectedIndex = 0;
					return;
				case 'j':
					e.preventDefault();
					if (slots.length > 0) {
						selectedIndex = Math.min(selectedIndex + 1, slots.length - 1);
					}
					return;
				case 'k':
					e.preventDefault();
					if (slots.length > 0) {
						selectedIndex = Math.max(selectedIndex - 1, 0);
					}
					return;
			}
			return;
		}

		if (e.key === ']') {
			e.preventDefault();
			goToNextWeek();
			return;
		}

		const slots = slotsForDay(selectedDay);

		switch (e.key) {
			case 'v':
				e.preventDefault();
				multiselect = true;
				break;
			case 'h':
				e.preventDefault();
				selectedDay = Math.max(selectedDay - 1, 0);
				selectedIndex = 0;
				break;
			case 'l':
				e.preventDefault();
				selectedDay = Math.min(selectedDay + 1, 6);
				selectedIndex = 0;
				break;
			case 'j':
				e.preventDefault();
				if (slots.length > 0) {
					selectedIndex = Math.min(selectedIndex + 1, slots.length - 1);
				}
				break;
			case 'k':
				e.preventDefault();
				if (slots.length > 0) {
					selectedIndex = Math.max(selectedIndex - 1, 0);
				}
				break;
			case 'e':
				e.preventDefault();
				if (slots.length > 0 && slots[selectedIndex]) {
					startEdit(slots[selectedIndex]);
				}
				break;
			case 'd':
				e.preventDefault();
				if (slots.length > 0 && slots[selectedIndex]) {
					const form = document.getElementById(`toggle-form-${slots[selectedIndex].id}`);
					if (form instanceof HTMLFormElement) form.requestSubmit();
				}
				break;
			case 'D':
				e.preventDefault();
				if (slots.length > 0 && slots[selectedIndex]) {
					const form = document.getElementById(`delete-form-${slots[selectedIndex].id}`);
					if (form instanceof HTMLFormElement) form.requestSubmit();
				}
				break;
			case 'n':
				e.preventDefault();
				startNew();
				break;
			case 'Escape':
				e.preventDefault();
				showForm = false;
				editingId = null;
				break;
		}
	}

	function editingSlot(): Slot | null {
		return editingId ? (data.slots.find((s: Slot) => s.id === editingId) ?? null) : null;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Weekly Planner</h1>
		<div class="flex items-center gap-2">
			<button
				onclick={goToCurrentWeek}
				class="border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
				class:border-gray-900={data.weekMeta.isCurrent}
				class:text-gray-900={data.weekMeta.isCurrent}
			>
				W{data.weekMeta.weekNumber}, {data.weekMeta.weekYear}
			</button>
			<button
				onclick={goToNextWeek}
				class="border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
				title="Next week (])">&rarr;</button
			>
		</div>
		<button
			onclick={() => {
				if (showForm) {
					showForm = false;
					editingId = null;
				} else {
					startNew();
				}
			}}
			class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
		>
			{showForm ? 'Cancel' : 'New Slot'}
		</button>
	</div>

	<div class="text-center text-sm text-gray-500">
		{formatWeekDate(data.weekMeta.monday)} &mdash; {formatWeekDate(data.weekMeta.sunday)}
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
		<kbd class="border border-gray-300 bg-gray-50 px-1">]</kbd> next week &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">e</kbd> edit &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">d</kbd> disable &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">D</kbd> delete &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">n</kbd> new &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">Esc</kbd> close form
		{#if !multiselect}
			&middot; <kbd class="border border-gray-300 bg-gray-50 px-1">v</kbd> multiselect
		{:else}
			&middot; <kbd class="border border-gray-300 bg-gray-50 px-1">Space</kbd> select &middot;
			<kbd class="border border-gray-300 bg-gray-50 px-1">x</kbd> delete &middot;
			<kbd class="border border-gray-300 bg-gray-50 px-1">p</kbd> copy &middot;
			<kbd class="border border-gray-300 bg-gray-50 px-1">Esc</kbd> cancel
		{/if}
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if showCopyPanel}
		<div class="border border-gray-200 bg-white p-4 shadow-sm">
			<h3 class="mb-3 text-sm font-medium text-gray-900">Copy to days</h3>
			<form
				method="post"
				action="?/copyToWeekdays"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						showCopyPanel = false;
						multiselect = false;
						selectedIds = new Set();
					};
				}}
			>
				<input type="hidden" name="ids" value={[...selectedIds].join(',')} />
				<input type="hidden" name="targetDays" value={[...copyTargetDays].join(',')} />
				<div class="mb-3 flex flex-wrap gap-2">
					{#each data.weekdays as day, i (i)}
						<label
							class="flex items-center gap-1.5 px-2 py-1 text-sm {selectedDay === i
								? 'cursor-not-allowed text-gray-400'
								: 'cursor-pointer text-gray-700 hover:bg-gray-50'}"
						>
							<input
								type="checkbox"
								checked={copyTargetDays.has(i)}
								disabled={selectedDay === i}
								onchange={() => {
									if (copyTargetDays.has(i)) {
										copyTargetDays = new Set([...copyTargetDays].filter((x) => x !== i));
									} else {
										copyTargetDays = new Set([...copyTargetDays, i]);
									}
								}}
								class="sr-only"
							/>
							<span
								class="inline-block h-4 w-4 border border-gray-400 {copyTargetDays.has(i)
									? 'bg-gray-900'
									: 'bg-white'}"
							></span>
							{day}
						</label>
					{/each}
				</div>
				<div class="flex gap-2">
					<button
						type="submit"
						class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
						disabled={copyTargetDays.size === 0}
					>
						Copy
					</button>
					<button
						type="button"
						onclick={() => (showCopyPanel = false)}
						class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	{/if}

	{#if multiselect && selectedIds.size > 0}
		<div class="border border-blue-200 bg-blue-50 px-4 py-2">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-blue-900">{selectedIds.size} selected</span>
				<div class="flex gap-2">
					<form
						id="bulk-delete-form"
						method="post"
						action="?/bulkDelete"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								multiselect = false;
								selectedIds = new Set();
							};
						}}
					>
						<input type="hidden" name="ids" value={[...selectedIds].join(',')} />
						<button
							type="submit"
							class="border border-red-200 bg-white px-3 py-1 text-sm text-red-600 transition hover:bg-red-50"
						>
							Delete selected
						</button>
					</form>
					<button
						onclick={() => (showCopyPanel = true)}
						class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-50"
					>
						Copy to...
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if showForm}
		{@const editing = editingSlot()}
		<form
			method="post"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				return async ({ update }) => {
					await update();
					showForm = false;
					editingId = null;
				};
			}}
			class="space-y-3 border border-gray-200 bg-white p-4 shadow-sm"
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}
			<div class="flex gap-3">
				<label class="w-36">
					<span class="text-sm font-medium text-gray-700">Day</span>
					<select
						name="weekday"
						required
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						{#each data.weekdays as day, i (i)}
							<option value={i} selected={editing ? editing.weekday === i : selectedDay === i}
								>{day}</option
							>
						{/each}
					</select>
				</label>
				<label class="w-28">
					<span class="text-sm font-medium text-gray-700">Time</span>
					<input
						bind:this={timeInput}
						name="startTime"
						type="time"
						required
						value={editing?.startTime ?? '09:00'}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
				<label class="w-24">
					<span class="text-sm font-medium text-gray-700">Duration</span>
					<input
						name="durationMinutes"
						type="number"
						min="15"
						step="15"
						value={editing?.durationMinutes ?? 60}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			</div>
			<div class="flex gap-3">
				<label class="w-36">
					<span class="text-sm font-medium text-gray-700">Mode</span>
					<select
						name="mode"
						required
						bind:value={slotMode}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						<option value="activity">Activity</option>
						<option value="category">Category</option>
					</select>
				</label>
				{#if slotMode === 'category'}
					<label class="flex-1">
						<span class="text-sm font-medium text-gray-700">Category</span>
						<select
							name="categoryId"
							required
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							{#each data.categories as cat (cat.id)}
								<option value={cat.id} selected={editing?.categoryId === cat.id}>{cat.name}</option>
							{/each}
						</select>
					</label>
				{:else}
					<label class="flex-1">
						<span class="text-sm font-medium text-gray-700">Activity</span>
						<select
							name="activityId"
							required
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							{#each data.activities as act (act.id)}
								<option value={act.id} selected={editing?.activityId === act.id}>{act.name}</option>
							{/each}
						</select>
					</label>
				{/if}
				<label class="flex-1">
					<span class="text-sm font-medium text-gray-700">Label (optional)</span>
					<input
						name="label"
						type="text"
						value={editing?.label ?? ''}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
			</div>
			<button
				type="submit"
				class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
			>
				{editingId ? 'Update' : 'Create'}
			</button>
		</form>
	{/if}

	<div class="flex gap-1">
		{#each data.weekdays as day, i (i)}
			<button
				onclick={() => (selectedDay = i)}
				class="flex-1 border px-2 py-2 text-center text-xs font-medium transition {selectedDay === i
					? 'border-gray-900 bg-gray-900 text-white'
					: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}"
			>
				{day.slice(0, 3)}
			</button>
		{/each}
	</div>

	{#if slotsForDay(selectedDay).length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			No slots for {data.weekdays[selectedDay]}.
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-sm">
			{#each slotsForDay(selectedDay) as slot, i (slot.id)}
				{@const colorClass = categoryColors[slot.categoryName ?? ''] ?? 'border-l-gray-300'}
				{@const isSelected = selectedIds.has(slot.id)}
				<div
					class="flex items-center gap-4 border-l-4 px-4 py-3 {colorClass} {!slot.active
						? 'opacity-50'
						: ''} {selectedIndex === i ? 'bg-gray-100' : ''} {isSelected ? 'bg-blue-50' : ''}"
				>
					{#if multiselect}
						<button
							type="button"
							onclick={() => toggleSlotSelection(slot.id)}
							class="h-5 w-5 shrink-0 border {isSelected
								? 'border-blue-500 bg-blue-500'
								: 'border-gray-400 bg-white'}"
							aria-label={isSelected ? 'Deselect' : 'Select'}
						>
							{#if isSelected}
								<svg class="h-full w-full text-white" viewBox="0 0 20 20" fill="currentColor">
									<path
										fill-rule="evenodd"
										d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
										clip-rule="evenodd"
									/>
								</svg>
							{/if}
						</button>
					{/if}
					<div
						class="w-24 shrink-0 font-mono text-sm text-gray-500"
						title={formatDuration(slot.durationMinutes)}
					>
						{slot.startTime} - {computeEndTime(slot.startTime, slot.durationMinutes)}
					</div>
					<div class="min-w-0 flex-1">
						<span class="text-sm font-medium text-gray-900">{slotLabel(slot)}</span>
						{#if slot.mode === 'activity' && slot.categoryName}
							<span class="ml-1 text-xs text-gray-400">{slot.categoryName}</span>
						{/if}
						{#if slot.label && slotLabel(slot) !== slot.label}
							<p class="truncate text-xs text-gray-500">{slot.label}</p>
						{/if}
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<button
							onclick={() => startEdit(slot)}
							class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
						>
							Edit
						</button>
						<form id="toggle-form-{slot.id}" method="post" action="?/toggleActive" use:enhance>
							<input type="hidden" name="id" value={slot.id} />
							<input type="hidden" name="active" value={String(slot.active)} />
							<button
								type="submit"
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
							>
								{slot.active ? 'Disable' : 'Enable'}
							</button>
						</form>
						<form id="delete-form-{slot.id}" method="post" action="?/delete" use:enhance>
							<input type="hidden" name="id" value={slot.id} />
							<button
								type="submit"
								class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
							>
								Delete
							</button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
