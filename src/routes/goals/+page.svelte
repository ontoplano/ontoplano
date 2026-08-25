<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';
	import { autofocus } from '$lib/actions/autofocus.js';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import {
		HORIZONS,
		HORIZON_LABELS,
		canNestUnder,
		describePeriod,
		formatDate,
		periodStart,
		type Horizon
	} from '$lib/goals.js';
	import { SECTION_COLORS } from '$lib/colors.js';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Goal = PageServerData['goals'][number];

	let showForm = $state(false);
	let showAreas = $state(false);
	let editingId: number | null = $state(null);
	let linkingId: number | null = $state(null);
	let confirmingDelete: number | null = $state(null);
	let areaFilter: number | null = $state(null);
	let formHorizon: Horizon = $state('week');
	let formStart: string = $state('');
	let selectedIndex = $state(0);

	const accent = SECTION_COLORS.home;

	const visible = $derived(
		areaFilter === null ? data.goals : data.goals.filter((g) => g.areaId === areaFilter)
	);

	/** One column per horizon, so the year and the week sit side by side. */
	const byHorizon = $derived(
		HORIZONS.map((h) => ({ horizon: h, goals: visible.filter((g) => g.horizon === h) })).filter(
			(c) => c.goals.length > 0 || showForm
		)
	);

	/** Parents a goal of this horizon could genuinely belong to. */
	const parentOptions = $derived(
		data.goals.filter((g) => canNestUnder(formHorizon, g.horizon) && g.status === 'open')
	);

	const editing = $derived(editingId ? (data.goals.find((g) => g.id === editingId) ?? null) : null);

	/** Which period the chosen start date lands in, shown next to the field. */
	const formPeriod = $derived(
		formStart
			? describePeriod(formHorizon, periodStart(formHorizon, new Date(`${formStart}T00:00:00`)))
			: ''
	);
	const linking = $derived(linkingId ? (data.goals.find((g) => g.id === linkingId) ?? null) : null);

	function percent(goal: Goal): number | null {
		return goal.progress.fraction === null ? null : Math.round(goal.progress.fraction * 100);
	}

	function progressLabel(goal: Goal): string {
		if (goal.progress.total !== null) return `${goal.progress.done} of ${goal.progress.total} done`;
		if (goal.targetValue) return `${goal.currentValue} / ${goal.targetValue} ${goal.unit}`.trim();
		return 'No measure set';
	}

	function openCreate() {
		editingId = null;
		formHorizon = 'week';
		formStart = today();
		showForm = true;
	}

	function openEdit(goal: Goal) {
		editingId = goal.id;
		formHorizon = goal.horizon;
		formStart = goal.periodStart;
		showForm = true;
	}

	function today(): string {
		return formatDate(new Date());
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			showForm = false;
			editingId = null;
			linkingId = null;
			confirmingDelete = null;
			return;
		}
		if (e.key === 'n') {
			e.preventDefault();
			openCreate();
			return;
		}
		if (e.key === 'j' || e.key === 'k') {
			e.preventDefault();
			const max = visible.length - 1;
			if (max < 0) return;
			selectedIndex = Math.min(Math.max(selectedIndex + (e.key === 'j' ? 1 : -1), 0), max);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-lg font-bold text-gray-900">Goals</h1>
		<div class="flex items-center gap-2">
			<a href={data.includeClosed ? '/goals' : '/goals?closed=1'} class="btn btn-sm">
				{data.includeClosed ? 'Hide closed' : 'Show closed'}
			</a>
			<button onclick={() => (showAreas = true)} class="btn btn-sm">Areas</button>
			<button onclick={openCreate} class="btn btn-primary btn-sm">
				<Icon name="plus" /> New goal
				<kbd class="border border-gray-600 bg-gray-800 px-1 text-xs">n</kbd>
			</button>
		</div>
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{form.message}</div>
	{/if}

	<Modal
		bind:open={showAreas}
		error={form?.message}
		title="Areas"
		description="Fitness, study, money — whatever you track."
		size="sm"
	>
		{#if data.areas.length > 0}
			<div class="divide-y divide-gray-200 border border-gray-200">
				{#each data.areas as area (area.id)}
					<div class="flex items-center gap-3 px-3 py-2">
						<span class="h-4 w-1 shrink-0" style="background-color: {area.color}"></span>
						<span class="flex-1 text-sm text-gray-900">{area.name}</span>
						<form method="post" action="?/deleteArea" use:enhance>
							<input type="hidden" name="id" value={area.id} />
							<button class="btn btn-quiet btn-sm"><Icon name="trash" /> Remove</button>
						</form>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-gray-400">No areas yet.</p>
		{/if}

		<form
			id="area-form"
			method="post"
			action="?/createArea"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: true })}
			class="mt-4"
		>
			<FormGrid>
				<Field label="New area" span={8}>
					<input name="name" required autocomplete="off" placeholder="e.g. fitness" class="input" />
				</Field>
				<Field label="Colour" span={4}>
					<input name="color" type="color" value="#6b7280" class="input h-9 p-1" />
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showAreas = false)}>Done</button>
			<button type="submit" form="area-form" class="btn btn-primary">Add area</button>
		{/snippet}
	</Modal>

	{#if data.areas.length > 0}
		<div class="flex flex-wrap items-center gap-1 text-xs">
			<span class="eyebrow mr-1 text-gray-500">Area</span>
			<button
				onclick={() => (areaFilter = null)}
				class="border px-2 py-0.5 {areaFilter === null
					? 'border-gray-900 bg-gray-900 font-semibold text-white'
					: 'border-gray-300 bg-white text-gray-600 hover:text-gray-900'}">All</button
			>
			{#each data.areas as area (area.id)}
				<button
					onclick={() => (areaFilter = areaFilter === area.id ? null : area.id)}
					class="border px-2 py-0.5 {areaFilter === area.id
						? 'border-gray-900 bg-gray-900 font-semibold text-white'
						: 'border-gray-300 bg-white text-gray-600 hover:text-gray-900'}"
				>
					{area.name}
				</button>
			{/each}
		</div>
	{/if}

	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? 'Edit goal' : 'New goal'}
		onclose={() => (editingId = null)}
	>
		<form
			id="goal-form"
			method="post"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') {
						showForm = false;
						editingId = null;
					}
				}}
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}

			<FormGrid>
				<Field label="Goal" span={12} required>
					<input
						name="title"
						required
						use:autofocus
						autocomplete="off"
						value={editing?.title ?? ''}
						placeholder="e.g. train three times a week"
						class="input"
					/>
				</Field>

				<Field label="Horizon" span={4}>
					<select name="horizon" bind:value={formHorizon} class="select">
						{#each HORIZONS as h (h)}
							<option value={h}>{HORIZON_LABELS[h]}</option>
						{/each}
					</select>
				</Field>

				<Field label="Starts" span={4} hint={formPeriod ? `Counts for ${formPeriod}` : ''}>
					<input name="startDate" type="date" bind:value={formStart} class="input" />
				</Field>

				<Field label="Area" span={4}>
					<select name="areaId" class="select">
						<option value="">— none —</option>
						{#each data.areas as area (area.id)}
							<option value={area.id} selected={editing?.areaId === area.id}>{area.name}</option>
						{/each}
					</select>
				</Field>

				<Field label="Target" span={4} hint="Optional — leave empty for a yes/no goal">
					<input
						name="targetValue"
						type="number"
						min="0"
						step="any"
						value={editing?.targetValue ?? ''}
						class="input tabular"
					/>
				</Field>

				<Field label="Unit" span={4}>
					<input
						name="unit"
						autocomplete="off"
						placeholder="books, kg, €"
						value={editing?.unit ?? ''}
						class="input"
					/>
				</Field>

				{#if !editingId}
					<Field label="Part of" span={4}>
						<select name="parentId" class="select">
							<option value="">— standalone —</option>
							{#each parentOptions as g (g.id)}
								<option value={g.id}>{HORIZON_LABELS[g.horizon]}: {g.title}</option>
							{/each}
						</select>
					</Field>
				{/if}

				<Field label="Notes" span={12}>
					<textarea name="notes" rows="3" class="textarea" value={editing?.notes ?? ''}></textarea>
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
			<button type="submit" form="goal-form" class="btn btn-primary">
				{editingId ? 'Save' : 'Create goal'}
			</button>
		{/snippet}
	</Modal>

	{#if visible.length === 0 && !showForm}
		<div class="border border-gray-200 bg-white shadow-card">
			{#if data.goals.length === 0}
				<EmptyState
					icon="goals"
					title="No goals yet"
					description="A goal is a commitment with a deadline attached. Start with a week — you can promote it later."
				>
					{#snippet action()}
						<button onclick={openCreate} class="btn btn-primary">
							<Icon name="plus" /> New goal
						</button>
					{/snippet}
				</EmptyState>
			{:else}
				<EmptyState icon="goals" title="No goals in this area">
					{#snippet action()}
						<button onclick={() => (areaFilter = null)} class="btn">Show every area</button>
					{/snippet}
				</EmptyState>
			{/if}
		</div>
	{/if}

	<div class="space-y-4">
		{#each byHorizon as column (column.horizon)}
			<section class="border border-gray-200 bg-white p-4 shadow-card">
				<div
					class="-mx-4 -mt-4 mb-3 flex items-center justify-between border-t-2 border-b border-b-gray-200 px-4 py-2"
					style="border-top-color: {accent}"
				>
					<span class="eyebrow text-gray-500">{HORIZON_LABELS[column.horizon]}</span>
					<span class="tabular text-xs text-gray-400">{column.goals.length}</span>
				</div>

				<div class="divide-y divide-gray-200">
					{#each column.goals as goal (goal.id)}
						{@const pct = percent(goal)}
						<div class="py-3">
							<div class="flex items-start gap-3">
								<span
									class="mt-1 h-4 w-1 shrink-0"
									style="background-color: {goal.areaColor ?? '#d1d5db'}"
									title={goal.areaName ?? 'No area'}
								></span>

								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-baseline gap-2">
										<span
											class="text-sm font-medium text-gray-900 {goal.status !== 'open'
												? 'line-through opacity-60'
												: ''}">{goal.title}</span
										>
										<span class="tabular text-xs text-gray-400"
											>{describePeriod(goal.horizon, goal.periodStart)}</span
										>
										{#if goal.parentId}
											{@const parent = data.goals.find((g) => g.id === goal.parentId)}
											{#if parent}
												<span class="text-xs text-gray-400">part of “{parent.title}”</span>
											{/if}
										{/if}
										{#if goal.status !== 'open'}
											<span class="eyebrow text-gray-500">{goal.status}</span>
										{/if}
									</div>

									{#if goal.notes}
										<p class="mt-0.5 text-xs text-gray-500">{goal.notes}</p>
									{/if}

									<div class="mt-2 flex items-center gap-3">
										<div class="h-1.5 w-40 shrink-0 bg-gray-200">
											{#if pct !== null}
												<div
													class="h-full"
													style="width: {pct}%; background-color: {goal.areaColor ?? accent}"
												></div>
											{/if}
										</div>
										<span class="tabular text-xs text-gray-500">
											{progressLabel(goal)}{pct !== null ? ` · ${pct}%` : ''}
										</span>
									</div>

									{#if goal.progress.total === null && goal.targetValue}
										<!-- Nothing linked, so progress is self-reported. -->
										<form
											method="post"
											action="?/setProgress"
											use:enhance
											class="mt-2 flex items-center gap-2"
										>
											<input type="hidden" name="id" value={goal.id} />
											<input
												name="currentValue"
												type="number"
												min="0"
												step="any"
												value={goal.currentValue}
												class="tabular w-20 border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											/>
											<button
												class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
												>Update</button
											>
										</form>
									{/if}
								</div>

								<div class="flex shrink-0 items-center gap-2">
									<button
										onclick={() => (linkingId = linkingId === goal.id ? null : goal.id)}
										class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
										title="Choose which tasks count towards this"
									>
										Tasks ({goal.linkedSlotIds.length +
											goal.linkedTodoIds.length +
											goal.linkedActivityIds.length})
									</button>
									<button
										onclick={() => openEdit(goal)}
										class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
										><Icon name="edit" /> Edit</button
									>
									{#if goal.status === 'open'}
										<form method="post" action="?/close" use:enhance>
											<input type="hidden" name="id" value={goal.id} />
											<input type="hidden" name="status" value="achieved" />
											<button
												class="border border-blue-200 bg-white px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
												>Achieved</button
											>
										</form>
										<form method="post" action="?/close" use:enhance>
											<input type="hidden" name="id" value={goal.id} />
											<input type="hidden" name="status" value="missed" />
											<button
												class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
												>Missed</button
											>
										</form>
									{:else}
										<form method="post" action="?/close" use:enhance>
											<input type="hidden" name="id" value={goal.id} />
											<input type="hidden" name="status" value="open" />
											<button
												class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
												>Reopen</button
											>
										</form>
									{/if}
									{#if confirmingDelete === goal.id}
										<form method="post" action="?/remove" use:enhance>
											<input type="hidden" name="id" value={goal.id} />
											<button class="border border-red-200 px-2 py-1 text-xs text-red-600" use:armed
												>Confirm?</button
											>
										</form>
									{:else}
										<button
											onclick={() => (confirmingDelete = goal.id)}
											class="text-xs text-gray-400 hover:text-red-600"
											><Icon name="trash" /> Delete</button
										>
									{/if}
								</div>
							</div>
						</div>
					{/each}

					{#if column.goals.length === 0}
						<p class="py-3 text-xs text-gray-400">Nothing at this horizon.</p>
					{/if}
				</div>
			</section>
		{/each}
	</div>

	<Modal
		open={linkingId !== null}
		error={form?.message}
		onclose={() => (linkingId = null)}
		title="Linked tasks"
		description="Linked tasks make progress countable — how many of these actually got done inside the period, instead of a number you type in."
		size="lg"
	>
		{#if linking}
			<form
				id="links-form"
				method="post"
				action="?/setLinks"
				use:enhance={() =>
					async ({ update }) => {
						await update();
						linkingId = null;
					}}
			>
				<input type="hidden" name="id" value={linking.id} />

				<div class="grid gap-4 sm:grid-cols-3">
					<div>
						<span class="eyebrow text-gray-500">Activities</span>
						<div class="mt-2 max-h-64 space-y-1 overflow-y-auto">
							{#each data.activities as a (a.id)}
								<label class="flex items-center gap-2 text-sm text-gray-700">
									<input
										type="checkbox"
										name="activityId"
										value={a.id}
										checked={linking.linkedActivityIds.includes(a.id)}
										class="h-3 w-3"
									/>
									{a.name}
								</label>
							{:else}
								<p class="text-xs text-gray-400">No activities yet.</p>
							{/each}
						</div>
					</div>
					<div>
						<span class="eyebrow text-gray-500">Weekly blocks</span>
						<div class="mt-2 max-h-64 space-y-1 overflow-y-auto">
							{#each data.slots as sl (sl.id)}
								<label class="flex items-center gap-2 text-sm text-gray-700">
									<input
										type="checkbox"
										name="slotId"
										value={sl.id}
										checked={linking.linkedSlotIds.includes(sl.id)}
										class="h-3 w-3"
									/>
									<span class="tabular">{sl.startTime}</span>
									{sl.label || `block ${sl.id}`}
								</label>
							{:else}
								<p class="text-xs text-gray-400">No weekly blocks yet.</p>
							{/each}
						</div>
					</div>
					<div>
						<span class="eyebrow text-gray-500">Todos</span>
						<div class="mt-2 max-h-64 space-y-1 overflow-y-auto">
							{#each data.todos as t (t.id)}
								<label class="flex items-center gap-2 text-sm text-gray-700">
									<input
										type="checkbox"
										name="todoId"
										value={t.id}
										checked={linking.linkedTodoIds.includes(t.id)}
										class="h-3 w-3"
									/>
									{t.title}
								</label>
							{:else}
								<p class="text-xs text-gray-400">No open todos.</p>
							{/each}
						</div>
					</div>
				</div>
			</form>
		{/if}

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (linkingId = null)}>Cancel</button>
			<button type="submit" form="links-form" class="btn btn-primary">Save links</button>
		{/snippet}
	</Modal>
</div>
