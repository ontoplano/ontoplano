<script lang="ts">
	import { resolve } from '$app/paths';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { cancelFor, changeLater, isPending } from '$lib/undo.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';
	import { autofocus } from '$lib/actions/autofocus.js';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
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
	/** Whose linked tasks are unfolded on the card. */
	let openTasksId: number | null = $state(null);
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

	/**
	 * Close a goal, in a few seconds, unless it was a slip.
	 *
	 * The same shape the board uses for ticking a task off: the screen shows the
	 * outcome at once and the request is held, so Undo cancels a request that was
	 * never sent rather than unwinding one that was. A second press inside the
	 * window is the same gesture as pressing Undo.
	 */
	function closeLater(goal: { id: number; title: string }, status: 'achieved' | 'missed') {
		const key = `goal:${goal.id}`;
		if (isPending(key)) {
			cancelFor(key);
			return;
		}

		const said = status === 'achieved' ? 'Achieved' : 'Missed';
		changeLater(key, `${said} — ${goal.title}`, () => {
			const body = new FormData();
			body.set('id', String(goal.id));
			body.set('status', status);
			void fetch(`${location.pathname}?/close`, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			}).then(() => invalidateAll());
		});
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
		const action = getAction('/goals', e.key);
		if (action === 'new') {
			e.preventDefault();
			openCreate();
			return;
		}
		if (action === 'next' || action === 'prev') {
			e.preventDefault();
			const max = visible.length - 1;
			if (max < 0) return;
			selectedIndex = Math.min(Math.max(selectedIndex + (action === 'next' ? 1 : -1), 0), max);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-lg font-bold text-gray-900">Goals</h1>
		<div class="flex items-center gap-2">
			<!-- Nothing to filter and nothing to file: an account with no goals is
			     offered one button, which is the one that helps. -->
			{#if data.goals.length > 0}
				<!-- Both branches are resolved; the rule reads the href expression
				     and does not look inside a conditional. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={data.includeClosed ? resolve('/goals') : resolve('/goals?closed=1')}
					class="btn btn-sm"
				>
					{data.includeClosed ? 'Hide closed' : 'Show closed'}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
				<button onclick={() => (showAreas = true)} class="btn btn-sm" data-tour="goal-areas">
					Areas
				</button>
			{/if}
			<button onclick={openCreate} class="btn btn-primary btn-sm" data-tour="goal-new">
				<Icon name="plus" /> New goal
				<kbd class="border border-gray-600 bg-gray-800 px-1 text-xs">{keyFor('/goals', 'new')}</kbd>
			</button>
		</div>
	</div>

	<FormError message={form?.message} />

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
			<EmptyState icon="tag" title="No areas yet" compact />
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
					<input
						name="label"
						required
						autocomplete="off"
						placeholder="e.g. fitness"
						class="input"
					/>
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
					await update({ reset: false });
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
						name="heading"
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
					<input
						autocomplete="off"
						name="startDate"
						type="date"
						bind:value={formStart}
						class="input"
					/>
				</Field>

				<Field label="Area" span={4}>
					<select name="areaId" class="select">
						<option value="">— none —</option>
						{#each data.areas as area (area.id)}
							<option value={area.id} selected={editing?.areaId === area.id}>{area.name}</option>
						{/each}
					</select>
				</Field>

				<NotebookField notebooks={data.notebooks} value={editing?.notebookId ?? null} span={4} />

				<Field label="Target" span={4} hint="Optional — leave empty for a yes/no goal">
					<input
						autocomplete="off"
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

	<div class="space-y-4" data-tour="goal-list">
		{#each byHorizon as column (column.horizon)}
			<section
				class="card-accent border border-gray-200 bg-white p-4 shadow-card"
				style="--card-accent: {accent}"
			>
				<div
					class="-mx-4 -mt-4 mb-3 flex items-center justify-between border-b border-b-gray-200 px-4 py-2"
				>
					<span class="eyebrow text-gray-600">{HORIZON_LABELS[column.horizon]}</span>
					<span class="tabular text-xs text-gray-500">{column.goals.length}</span>
				</div>

				<div class="divide-y divide-gray-200">
					{#each column.goals as goal (goal.id)}
						{@const pct = percent(goal)}
						<!-- Named so anything that belongs to this goal can link straight at it. -->
						<div id="goal-{goal.id}" class="py-3 target:bg-yellow-50">
							<!-- The buttons do not shrink, so on a phone they used to squeeze
							     the title into a one-word-per-line ribbon. Below `sm` they go
							     underneath instead. -->
							<div class="flex flex-col gap-3 sm:flex-row sm:items-start">
								<div class="flex min-w-0 flex-1 items-start gap-3">
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
											<span class="tabular text-xs text-gray-500"
												>{describePeriod(goal.horizon, goal.periodStart)}</span
											>
											{#if goal.parentId}
												{@const parent = data.goals.find((g) => g.id === goal.parentId)}
												{#if parent}
													<span class="text-xs text-gray-500">part of “{parent.title}”</span>
												{/if}
											{/if}
											{#if goal.status !== 'open'}
												<span class="eyebrow text-gray-600">{goal.status}</span>
											{/if}
										</div>

										{#if goal.notes}
											<p class="mt-0.5 text-xs text-gray-500">{goal.notes}</p>
										{/if}

										<!-- No bar without a measure. An empty track under a goal with
										     nothing to count reads as "0%", which is a claim about
										     progress rather than the absence of one. -->
										<div class="mt-2 flex items-center gap-3">
											{#if pct !== null}
												<div class="h-1.5 w-24 shrink-0 bg-gray-200 sm:w-40">
													<div
														class="h-full"
														style="width: {pct}%; background-color: {goal.areaColor ?? accent}"
													></div>
												</div>
											{/if}
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
													autocomplete="off"
													name="currentValue"
													type="number"
													min="0"
													step="any"
													value={goal.currentValue}
													class="tabular w-20 border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
												/>
												<button class="btn btn-sm">Update</button>
											</form>
										{/if}
									</div>
								</div>

								<!--
									Five controls per row, in three different treatments, starting
									wherever the goal's text happened to end. The rail puts them at
									the same place on every row, and the two that matter — how it
									ended — keep their words, because "achieved" and "missed" are a
									judgement you make once and not a routine action you would
									recognise from a glyph.
								-->
								<div class="row-actions gap-1">
									<button
										onclick={() => (openTasksId = openTasksId === goal.id ? null : goal.id)}
										class="btn btn-sm btn-quiet"
										title="What counts towards this goal"
									>
										Tasks ({goal.linkedSlotIds.length +
											goal.linkedTodoIds.length +
											goal.linkedActivityIds.length})
										<Icon
											name={openTasksId === goal.id ? 'chevron-up' : 'chevron-down'}
											size={12}
										/>
									</button>
									{#if goal.status === 'open'}
										<!--
											Closing a goal is a verdict on months of work, and it was
											one click with nothing between the click and the verdict.
											Both answers wait a few seconds now, the way ticking a
											task off does.
										-->
										<button
											type="button"
											class="btn btn-sm"
											title="Close it as done"
											onclick={() => closeLater(goal, 'achieved')}
										>
											Achieved
										</button>
										<button
											type="button"
											class="btn btn-sm btn-quiet"
											title="Close it as not done"
											onclick={() => closeLater(goal, 'missed')}
										>
											Missed
										</button>
									{:else}
										<form method="post" action="?/close" use:enhance>
											<input type="hidden" name="id" value={goal.id} />
											<input type="hidden" name="status" value="open" />
											<button class="btn btn-sm">Reopen</button>
										</form>
									{/if}
									<button
										title="Edit"
										aria-label="Edit"
										onclick={() => openEdit(goal)}
										class="icon-btn"><Icon name="edit" /></button
									>
									{#if confirmingDelete === goal.id}
										<form method="post" action="?/remove" use:enhance>
											<input type="hidden" name="id" value={goal.id} />
											<button class="btn btn-sm btn-danger" use:armed>Confirm?</button>
										</form>
									{:else}
										<button
											title="Delete"
											aria-label="Delete"
											onclick={() => (confirmingDelete = goal.id)}
											class="icon-btn icon-btn-danger"><Icon name="trash" /></button
										>
									{/if}
								</div>
							</div>

							{#if openTasksId === goal.id}
								<!--
									What already counts, on the card. The modal is for choosing;
									this is for looking and ticking — a list you could see but not
									tick sent you to the todo page for the one action the list
									exists for.
								-->
								<div class="mt-3 border border-gray-200 bg-gray-50 p-3">
									{#each data.allTodos.filter( (t) => goal.linkedTodoIds.includes(t.id) ) as todo (todo.id)}
										<form method="post" action="?/setTodoStatus" use:enhance class="contents">
											<input type="hidden" name="todoId" value={todo.id} />
											<input
												type="hidden"
												name="status"
												value={todo.status === 'done' ? 'todo' : 'done'}
											/>
											<label class="flex cursor-pointer items-center gap-2 py-1 text-sm">
												<input
													type="checkbox"
													checked={todo.status === 'done'}
													onchange={(e) => e.currentTarget.form?.requestSubmit()}
													class="h-3.5 w-3.5"
												/>
												<span
													class={todo.status === 'done'
														? 'text-gray-400 line-through'
														: 'text-gray-800'}>{todo.title}</span
												>
											</label>
										</form>
									{/each}

									{#each data.slots.filter( (sl) => goal.linkedSlotIds.includes(sl.id) ) as sl (sl.id)}
										<p class="py-1 text-xs text-gray-500">
											<span class="tabular">{sl.startTime}</span>
											{sl.name} — every week; its occurrences count as they are done
										</p>
									{/each}
									{#each data.activities.filter( (a) => goal.linkedActivityIds.includes(a.id) ) as a (a.id)}
										<p class="py-1 text-xs text-gray-500">
											{a.name} — every block of it counts as it is done
										</p>
									{/each}

									{#if goal.linkedTodoIds.length + goal.linkedSlotIds.length + goal.linkedActivityIds.length === 0}
										<p class="py-1 text-xs text-gray-500">
											Nothing linked yet — progress is the number you type in.
										</p>
									{/if}

									<button
										type="button"
										class="btn btn-sm mt-2"
										onclick={() => (linkingId = goal.id)}
									>
										Choose tasks
									</button>
								</div>
							{/if}
						</div>
					{/each}

					{#if column.goals.length === 0}
						<p class="py-3 text-xs text-gray-500">Nothing at this horizon.</p>
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
						await update({ reset: false });
						linkingId = null;
					}}
			>
				<input type="hidden" name="id" value={linking.id} />

				<div class="grid gap-4 sm:grid-cols-3">
					<div>
						<span class="eyebrow text-gray-600">Activities</span>
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
								<EmptyState icon="planner" title="No activities yet" compact />
							{/each}
						</div>
					</div>
					<div>
						<span class="eyebrow text-gray-600">Weekly blocks</span>
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
									{sl.name}
								</label>
							{:else}
								<EmptyState icon="calendar" title="No weekly blocks yet" compact />
							{/each}
						</div>
					</div>
					<div>
						<span class="eyebrow text-gray-600">Todos</span>
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
								<p class="text-xs text-gray-500">No open todos.</p>
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
