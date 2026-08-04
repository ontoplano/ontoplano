<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import { SECTION_COLORS } from '$lib/colors.js';
	import { getAction } from '$lib/shortcuts';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showDiaryForm = $state(false);
	let showBeliefForm = $state(false);
	let showWinsForm = $state(false);

	const winsEnabled = $derived(Boolean(data.features?.['feature.threeWins']));
	const habitsEnabled = $derived(Boolean(data.features?.['feature.dashboardHabits']));
	const shoppingEnabled = $derived(Boolean(data.features?.['feature.dashboardShopping']));
	const quickBeliefEnabled = $derived(Boolean(data.features?.['feature.dashboardQuickBelief']));

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function truncate(text: string, max: number): string {
		if (text.length <= max) return text;
		return text.slice(0, max).trimEnd() + '…';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			showDiaryForm = false;
			showBeliefForm = false;
			showWinsForm = false;
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const action = getAction('/', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'new-diary':
				showDiaryForm = !showDiaryForm;
				showBeliefForm = false;
				showWinsForm = false;
				if (showDiaryForm) {
					tick().then(() => {
						const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
						ta?.focus();
					});
				}
				break;
			case 'new-wins':
				if (!winsEnabled) break;
				showWinsForm = !showWinsForm;
				showDiaryForm = false;
				showBeliefForm = false;
				if (showWinsForm) {
					tick().then(() => {
						const input = document.querySelector<HTMLInputElement>('input[name="win_0"]');
						input?.focus();
					});
				}
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">
			{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
		</h1>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div
			class="border border-l-4 border-gray-200 bg-white p-4 shadow-sm"
			style="border-left-color: {SECTION_COLORS.planner}"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-bold text-gray-900">Today's Tasks</h2>
				<a href="/planner/track" class="text-xs text-gray-500 transition hover:text-gray-900">
					Open →
				</a>
			</div>
			{#if data.taskSummary.total === 0}
				<p class="text-sm text-gray-400">No tasks scheduled.</p>
			{:else}
				<div class="flex items-baseline gap-3">
					<span class="text-2xl font-bold text-gray-900">
						{data.taskSummary.completed + data.taskSummary.early + data.taskSummary.delayed}
						<span class="text-sm font-normal text-gray-400">/ {data.taskSummary.total}</span>
					</span>
				</div>
				<div class="mt-2 flex gap-3 text-xs">
					{#if data.taskSummary.completed > 0}
						<span class="text-green-600">{data.taskSummary.completed} done</span>
					{/if}
					{#if data.taskSummary.early > 0}
						<span class="text-blue-600">{data.taskSummary.early} early</span>
					{/if}
					{#if data.taskSummary.delayed > 0}
						<span class="text-yellow-600">{data.taskSummary.delayed} delayed</span>
					{/if}
					{#if data.taskSummary.skipped > 0}
						<span class="text-red-600">{data.taskSummary.skipped} skipped</span>
					{/if}
					{#if data.taskSummary.pending > 0}
						<span class="text-gray-400">{data.taskSummary.pending} pending</span>
					{/if}
				</div>
			{/if}
		</div>

		{#if habitsEnabled}
			<div
				class="border border-l-4 border-gray-200 bg-white p-4 shadow-sm"
				style="border-left-color: {SECTION_COLORS.health}"
			>
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-sm font-bold text-gray-900">Habits</h2>
					<a href="/health/habits" class="text-xs text-gray-500 transition hover:text-gray-900">
						Open →
					</a>
				</div>
				{#if data.habitStreaks.length === 0}
					<p class="text-sm text-gray-400">No habits tracked.</p>
				{:else}
					<div class="space-y-2">
						{#each data.habitStreaks as habit (habit.id)}
							<div class="flex items-center justify-between">
								<span class="text-sm text-gray-700">{habit.name}</span>
								<span
									class="text-xs font-medium {habit.type === 'bad'
										? habit.streak > 0
											? 'text-blue-600'
											: 'text-red-600'
										: habit.type === 'neutral'
											? habit.streak > 0
												? 'text-gray-600'
												: 'text-gray-400'
											: habit.streak > 0
												? 'text-blue-600'
												: 'text-gray-400'}"
								>
									{habit.streak}d
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if data.weekSlots.length > 0}
		{@const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
		{@const todayDow = new Date().getDay()}
		{@const todayIndex = todayDow === 0 ? 6 : todayDow - 1}
		<div
			class="border border-l-4 border-gray-200 bg-white p-4 shadow-sm"
			style="border-left-color: {SECTION_COLORS.planner}"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-bold text-gray-900">Week Plan</h2>
				<a href="/planner/plan" class="text-xs text-gray-500 transition hover:text-gray-900">Edit →</a>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-xs">
					<thead>
						<tr>
							{#each DAYS as day, i}
								<th class="px-1 py-1 text-center font-medium {i === todayIndex ? 'bg-gray-100 text-gray-900' : 'text-gray-500'}">
									{day}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{@const timeSlots = [...new Set(data.weekSlots.map((s: { startTime: string }) => s.startTime))].sort()}
						{#each timeSlots as time}
							<tr class="border-t border-gray-100">
								{#each Array(7) as _, day}
									{@const slots = data.weekSlots.filter((s: { weekday: number; startTime: string }) => s.weekday === day && s.startTime === time)}
									<td class="px-1 py-0.5 {day === todayIndex ? 'bg-gray-50' : ''}">
										{#each slots as slot}
											<div
												class="truncate leading-tight"
												title="{time} - {slot.activityName || slot.label || slot.categoryName}"
												style="color: {slot.categoryColor || '#6b7280'}"
											>
												<span class="text-gray-400">{time.slice(0, 5)}</span>
												{slot.activityName || slot.label || slot.categoryName}
											</div>
										{/each}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<div
		class="border border-l-4 border-gray-200 bg-white p-4 shadow-sm"
		style="border-left-color: {SECTION_COLORS.diary}"
	>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-sm font-bold text-gray-900">Diary</h2>
			<div class="flex items-center gap-3">
				<a href="/diary" class="text-xs text-gray-500 transition hover:text-gray-900">
					All entries →
				</a>
				{#if winsEnabled}
					<button
						onclick={() => {
							showWinsForm = !showWinsForm;
							showDiaryForm = false;
							showBeliefForm = false;
							if (showWinsForm) {
								tick().then(() => {
									const input = document.querySelector<HTMLInputElement>('input[name="win_0"]');
									input?.focus();
								});
							}
						}}
						class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50"
					>
						{showWinsForm ? 'Cancel' : 'Wins'} <kbd class="border border-gray-300 bg-gray-50 px-1">w</kbd>
					</button>
				{/if}
				<button
					onclick={() => {
						showDiaryForm = !showDiaryForm;
						showBeliefForm = false;
						showWinsForm = false;
					}}
					class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50"
				>
					{showDiaryForm ? 'Cancel' : 'New Entry'}
				</button>
			</div>
		</div>

		{#if showDiaryForm}
			<form
				method="post"
				action="?/createDiaryEntry"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						showDiaryForm = false;
					};
				}}
				class="mb-4 space-y-3 border border-gray-100 bg-gray-50 p-3"
			>
				<textarea
					name="content"
					required
					rows="3"
					placeholder="What's on your mind?"
					class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				></textarea>
				<input
					name="tags"
					type="text"
					placeholder="Tags (comma-separated)"
					class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
				<button
					type="submit"
					class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					Save
				</button>
			</form>
		{/if}

		{#if winsEnabled && showWinsForm}
			<form
				method="post"
				action="?/createWins"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						showWinsForm = false;
					};
				}}
				class="mb-4 space-y-3 border border-gray-100 bg-gray-50 p-3"
			>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-gray-700">3 Wins</span>
					<input
						name="forDate"
						type="date"
						value={new Date().toISOString().slice(0, 10)}
						class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</div>
				<input
					name="win_0"
					type="text"
					placeholder="Win 1"
					class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
				<input
					name="win_1"
					type="text"
					placeholder="Win 2"
					class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
				<input
					name="win_2"
					type="text"
					placeholder="Win 3"
					class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
				<button
					type="submit"
					class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					Save Wins
				</button>
			</form>
		{/if}

		{#if data.lastEntry}
			<div>
				<p class="text-sm leading-relaxed text-gray-700">{truncate(data.lastEntry.content, 300)}</p>
				<div class="mt-2 flex items-center gap-2">
					<span class="text-xs text-gray-400">{formatDate(data.lastEntry.createdAt)}</span>
					{#each data.lastEntry.tags as tag (tag.id)}
						<span class="border border-gray-200 px-1.5 py-0.5 text-xs text-gray-500"
							>{tag.name}</span
						>
					{/each}
				</div>
			</div>
		{:else}
			<p class="text-sm text-gray-400">No diary entries yet.</p>
		{/if}
	</div>

	{#if shoppingEnabled}
		<div
			class="border border-l-4 border-gray-200 bg-white p-4 shadow-sm"
			style="border-left-color: {SECTION_COLORS.shopping}"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-bold text-gray-900">Shopping</h2>
				<a href="/shopping" class="text-xs text-gray-500 transition hover:text-gray-900">Open →</a>
			</div>
			{#if data.shoppingToBuy.length === 0}
				<p class="text-sm text-gray-400">Nothing to buy.</p>
			{:else}
				<div class="space-y-1">
					{#each data.shoppingToBuy.slice(0, 8) as item (item.id)}
						<div class="flex items-center gap-2">
							<span class="text-sm text-gray-700">{item.name}</span>
							<span
								class="text-[10px] {item.type === 'replenish' ? 'text-cyan-600' : 'text-orange-600'}"
							>
								{item.type === 'replenish' ? 'inventory' : 'someday'}
							</span>
						</div>
					{/each}
					{#if data.shoppingToBuy.length > 8}
						<span class="text-xs text-gray-400">+{data.shoppingToBuy.length - 8} more</span>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		{#if quickBeliefEnabled}
			<div
				class="border border-l-4 border-gray-200 bg-white p-4 shadow-sm"
				style="border-left-color: {SECTION_COLORS.beliefs}"
			>
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-sm font-bold text-gray-900">Quick Belief</h2>
					<a href="/beliefs" class="text-xs text-gray-500 transition hover:text-gray-900">
						All beliefs →
					</a>
				</div>

				{#if showBeliefForm}
					<form
						method="post"
						action="?/createBelief"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								showBeliefForm = false;
							};
						}}
						class="space-y-3"
					>
						<textarea
							name="content"
							required
							rows="2"
							placeholder="Describe a belief or implicit learning…"
							class="block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						></textarea>
						<select
							name="valence"
							class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							<option value="">Neutral</option>
							<option value="positive">Positive</option>
							<option value="negative">Negative</option>
						</select>
						<div class="flex gap-2">
							<button
								type="submit"
								class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
							>
								Save
							</button>
							<button
								type="button"
								onclick={() => (showBeliefForm = false)}
								class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
							>
								Cancel
							</button>
						</div>
					</form>
				{:else}
					<button
						onclick={() => {
							showBeliefForm = true;
							showDiaryForm = false;
							showWinsForm = false;
						}}
						class="w-full border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-400 transition hover:border-gray-400 hover:text-gray-600"
					>
						+ Add a belief
					</button>
					{#if data.recentBeliefs.length > 0}
						<div class="mt-3 space-y-2">
							{#each data.recentBeliefs as belief (belief.id)}
								<div class="flex items-start gap-2">
									{#if belief.valence === 'positive'}
										<span class="mt-0.5 text-xs text-green-500">+</span>
									{:else if belief.valence === 'negative'}
										<span class="mt-0.5 text-xs text-red-500">−</span>
									{:else}
										<span class="mt-0.5 text-xs text-gray-300">·</span>
									{/if}
									<span class="text-sm text-gray-600">{truncate(belief.content, 80)}</span>
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<div class="border border-gray-200 bg-white p-4 shadow-sm">
			<h2 class="mb-3 text-sm font-bold text-gray-900">Quick Links</h2>
			<div class="space-y-2">
				<a href="/planner/track" class="block text-sm text-gray-600 transition hover:text-gray-900"
					>→ Track tasks</a
				>
				<a href="/planner/plan" class="block text-sm text-gray-600 transition hover:text-gray-900"
					>→ Edit weekly plan</a
				>
				<a href="/diary" class="block text-sm text-gray-600 transition hover:text-gray-900"
					>→ Diary</a
				>
				<a href="/health/habits" class="block text-sm text-gray-600 transition hover:text-gray-900"
					>→ Habits</a
				>
				<a href="/beliefs" class="block text-sm text-gray-600 transition hover:text-gray-900"
					>→ Beliefs</a
				>
				<a href="/shopping" class="block text-sm text-gray-600 transition hover:text-gray-900"
					>→ Shopping</a
				>
			</div>
		</div>
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}
</div>
