<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let slotMode: 'category' | 'activity' = $state('activity');
	let selectedDay: number = $state(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
	let selectedIndex: number = $state(0);

	const categoryColors: Record<string, string> = {
		duty: 'border-l-duty',
		skill: 'border-l-skill',
		money: 'border-l-money'
	};

	function slotsForDay(day: number) {
		return data.slots.filter((s) => s.weekday === day);
	}

	function slotLabel(slot: (typeof data.slots)[number]): string {
		if (slot.mode === 'activity' && slot.activityName) return slot.activityName;
		if (slot.label) return slot.label;
		if (slot.categoryName) return slot.categoryName;
		return 'Slot';
	}

	function startEdit(slot: (typeof data.slots)[number]) {
		editingId = slot.id;
		slotMode = slot.mode as 'category' | 'activity';
		showForm = true;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const slots = slotsForDay(selectedDay);

		switch (e.key) {
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
				showForm = true;
				editingId = null;
				break;
			case 'Escape':
				e.preventDefault();
				showForm = false;
				editingId = null;
				break;
		}
	}

	function editingSlot() {
		return editingId ? data.slots.find((s) => s.id === editingId) : null;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Weekly Planner</h1>
		<button
			onclick={() => {
				showForm = !showForm;
				editingId = null;
			}}
			class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
		>
			{showForm ? 'Cancel' : 'New Slot'}
		</button>
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
		<kbd class="border border-gray-300 bg-gray-50 px-1">e</kbd> edit &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">d</kbd> disable &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">D</kbd> delete &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">n</kbd> new &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">Esc</kbd> close form
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
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
						{#each data.weekdays as day, i}
							<option value={i} selected={editing ? editing.weekday === i : selectedDay === i}
								>{day}</option
							>
						{/each}
					</select>
				</label>
				<label class="w-28">
					<span class="text-sm font-medium text-gray-700">Time</span>
					<input
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
							{#each data.categories as cat}
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
							{#each data.activities as act}
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
		{#each data.weekdays as day, i}
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
			{#each slotsForDay(selectedDay) as slot, i}
				{@const colorClass = categoryColors[slot.categoryName ?? ''] ?? 'border-l-gray-300'}
				<div
					class="flex items-center gap-4 border-l-4 px-4 py-3 {colorClass} {!slot.active
						? 'opacity-50'
						: ''} {selectedIndex === i ? 'bg-gray-100' : ''}"
				>
					<div class="w-12 shrink-0 font-mono text-sm text-gray-500">
						{slot.startTime}
					</div>
					<div class="min-w-0 flex-1">
						<span class="text-sm font-medium text-gray-900">{slotLabel(slot)}</span>
						{#if slot.mode === 'activity' && slot.categoryName}
							<span class="ml-1 text-xs text-gray-400">{slot.categoryName}</span>
						{/if}
						{#if slot.durationMinutes !== 60}
							<span class="ml-1 text-xs text-gray-400">{slot.durationMinutes}min</span>
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
