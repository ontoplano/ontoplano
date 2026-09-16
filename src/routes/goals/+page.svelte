<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import Swatch from '$lib/components/Swatch.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import RoomBar from '$lib/components/RoomBar.svelte';
	import { COUNT_STEP, NUMBER_KINDS } from '$lib/number-kinds';
	import { resolve } from '$app/paths';
	import OneLine from '$lib/components/OneLine.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { cancelFor, changeNow, isPending } from '$lib/undo.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';
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
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Goal = PageServerData['goals'][number];

	let showForm = $state(false);
	let showAreas = $state(false);
	let editingId: number | null = $state(null);
	let linkingId: number | null = $state(null);
	/*
	 * Completed to-dos in the choosing modal, off until asked for. Linked done
	 * ones always show (unlisting them is how saving used to unlink them); the
	 * REST of the finished list only appears on request, because a goal made
	 * of work already done is the exception and forty struck-through lines are
	 * not a picker.
	 */
	let showDoneTodos = $state(false);
	/** Whose linked tasks are unfolded on the card. */
	let openTasksId: number | null = $state(null);
	let confirmingDelete: number | null = $state(null);
	let areaFilter: number | null = $state(null);
	let formHorizon: Horizon = $state('week');
	let formStart: string = $state('');
	/**
	 * The measures on the goal being written, one row each.
	 *
	 * A row carries the id of the measure it edits so the number already on it
	 * survives a rename of its unit; a row with no id is a new one.
	 */
	let formTargets: { id: number | null; value: string; unit: string; whole: boolean }[] = $state(
		[]
	);
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

	/**
	 * Units this account already counts things in.
	 *
	 * Somebody who reads in books and runs in kilometres types those words
	 * again for every goal, and two spellings of one unit are two units. The
	 * list is what they have used, offered rather than imposed.
	 */
	const knownUnits = $derived(
		[...new Set(data.goals.flatMap((g) => g.targets.map((t) => t.unit)).filter(Boolean))].sort()
	);

	function percent(goal: Goal): number | null {
		return goal.progress.fraction === null ? null : Math.round(goal.progress.fraction * 100);
	}

	function progressLabel(goal: Goal): string {
		// The tasks, when there are any: the measures under them say the rest.
		if (goal.progress.total) return `${goal.progress.done} of ${goal.progress.total} done`;
		if (goal.progress.total === 0 && goal.targets.length === 0) return 'Nothing counted yet';
		// One measure reads as itself; several are listed under the bar, so the
		// line above them says how many rather than repeating the first.
		if (goal.targets.length === 1) {
			const t = goal.targets[0];
			return `${t.currentValue} / ${t.targetValue} ${t.unit}`.trim();
		}
		if (goal.targets.length > 1) return `${goal.targets.length} measures`;
		return 'No measure set';
	}

	function blankTarget() {
		// Counted by default: most goals are a number of things done.
		return { id: null, value: '', unit: '', whole: true };
	}

	function openCreate() {
		editingId = null;
		formHorizon = 'week';
		formStart = today();
		formTargets = [blankTarget()];
		showForm = true;
	}

	function openEdit(goal: Goal) {
		editingId = goal.id;
		formHorizon = goal.horizon;
		formStart = goal.periodStart;
		formTargets =
			goal.targets.length > 0
				? goal.targets.map((t) => ({
						id: t.id,
						value: String(t.targetValue),
						unit: t.unit,
						whole: t.whole
					}))
				: [blankTarget()];
		showForm = true;
	}

	function today(): string {
		return formatDate(new Date());
	}

	/**
	 * Close a goal, in a few seconds, unless it was a slip.
	 *
	 * The same shape the board uses for ticking a task off: the screen shows the
	 * outcome at once and so does the server: holding the request made the card
	 * and everything counted from it disagree for the length of a toast. Undo
	 * reopens the goal, which is an ordinary write. A second press inside the
	 * window is the same gesture as pressing Undo.
	 */
	function closeLater(goal: { id: number; title: string }, status: 'achieved' | 'missed') {
		const key = `goal:${goal.id}`;
		if (isPending(key)) {
			cancelFor(key);
			return;
		}

		const write = (to: string) => {
			const body = new FormData();
			body.set('id', String(goal.id));
			body.set('status', to);
			return fetch(`${location.pathname}?/close`, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			}).then(() => invalidateAll());
		};

		const said = status === 'achieved' ? 'Achieved' : 'Missed';
		// `close` reopens too — it clears the closing date for `open` — so Undo
		// is the same action in the other direction.
		changeNow(
			key,
			`${said} — ${goal.title}`,
			() => write(status),
			() => write('open')
		);
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

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: 'New goal',
		tour: 'goal-new',
		kbd: keyFor('/goals', 'new'),
		run: openCreate
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<RoomBar title={t('goals.goals')} />
	<RoomToolbar>
		{#snippet tools()}
			<!-- Managing areas is not filtering by them, so it stands with the
			     tools rather than among the filters below. Nothing to manage on
			     an account with no goals. -->
			{#if data.goals.length > 0}
				<button onclick={() => (showAreas = true)} class="btn btn-sm" data-tour="goal-areas">
					{t('goals.areas')}
				</button>
			{/if}
		{/snippet}
	</RoomToolbar>

	<FormError message={form?.message} />

	<Modal
		bind:open={showAreas}
		error={form?.message}
		title={t('goals.areas')}
		description="Fitness, study, money — whatever you track."
		size="sm"
	>
		{#if data.areas.length > 0}
			<div class="divide-y divide-gray-200 border border-gray-200">
				{#each data.areas as area (area.id)}
					<div class="flex items-center gap-3 px-3 py-2">
						<Swatch color={area.color} shape="tall" />
						<span class="flex-1 text-sm text-gray-900">{area.name}</span>
						<form method="post" action="?/deleteArea" use:enhance>
							<input type="hidden" name="id" value={area.id} />
							<button class="btn btn-quiet btn-sm"><Icon name="trash" /> {t('ui.remove')}</button>
						</form>
					</div>
				{/each}
			</div>
		{:else}
			<EmptyState icon="tag" title={t('goals.noAreasYet')} compact />
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
				<Field label={t('goals.newArea')} span={8}>
					<OneLine name="label" placeholder={t('goals.eGFitness')} class="input" required />
				</Field>
				<Field label={t('ui.colour')} span={4}>
					<input name="color" type="color" value="#6b7280" class="input h-9 p-1" />
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showAreas = false)}>{t('ui.done')}</button>
			<button type="submit" form="area-form" class="btn btn-primary">{t('goals.addArea')}</button>
		{/snippet}
	</Modal>

	<!--
		The filters, together and on one line.

		An area chip and "Show closed" do the same kind of thing — they narrow
		what is on the page — so they sit in the same row, with the areas on the
		left where reading starts and the closed switch at the far right where it
		is not mistaken for one more area.
	-->
	{#if data.areas.length > 0 || data.goals.length > 0}
		<div class="flex flex-wrap items-center gap-1 text-xs">
			{#if data.areas.length > 0}
				<span class="eyebrow mr-1 text-gray-500">{t('goals.area')}</span>
			{/if}
			{#if data.areas.length > 0}
				<button
					onclick={() => (areaFilter = null)}
					class="border px-2 py-0.5 {areaFilter === null
						? 'border-gray-900 bg-gray-900 font-semibold text-white'
						: 'border-gray-300 bg-white text-gray-600 hover:text-gray-900'}">{t('ui.all')}</button
				>
			{/if}
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

			{#if data.goals.length > 0}
				<!-- Both branches are resolved; the rule reads the href expression
				     and does not look inside a conditional. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={data.includeClosed ? resolve('/goals') : resolve('/goals?closed=1')}
					class="ml-auto border border-gray-300 bg-white px-2 py-0.5 text-gray-600 hover:text-gray-900"
				>
					{data.includeClosed ? 'Hide closed' : 'Show closed'}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
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
				<Field label={t('goals.goal')} span={12} required>
					<OneLine
						name="heading"
						placeholder={t('goals.eGTrainThreeTimesA')}
						value={editing?.title ?? ''}
						class="input"
						required
						autofocus
					/>
				</Field>

				<Field label={t('goals.horizon')} span={4}>
					<select name="horizon" bind:value={formHorizon} class="select">
						{#each HORIZONS as h (h)}
							<option value={h}>{HORIZON_LABELS[h]}</option>
						{/each}
					</select>
				</Field>

				<Field
					label={t('goals.starts')}
					span={4}
					hint={formPeriod ? `Counts for ${formPeriod}` : ''}
				>
					<input
						autocomplete="off"
						name="startDate"
						type="date"
						bind:value={formStart}
						class="input"
					/>
				</Field>

				<Field label={t('goals.area')} span={4}>
					<select name="areaId" class="select">
						<option value="">{t('goals.none')}</option>
						{#each data.areas as area (area.id)}
							<option value={area.id} selected={editing?.areaId === area.id}>{area.name}</option>
						{/each}
					</select>
				</Field>

				<NotebookField notebooks={data.notebooks} value={editing?.notebookId ?? null} span={4} />

				<!--
					What the goal is measured by, one row per thing. Several of them is
					the ordinary case for a big goal — three gigs played and five songs
					recorded — and each keeps its own number.
				-->
				<div class="col-span-12">
					<span class="eyebrow text-gray-600">{t('goals.measuredBy')}</span>
					<div class="mt-1 space-y-2">
						{#each formTargets as target, i (i)}
							<div class="flex items-center gap-2">
								<input type="hidden" name="targetId" value={target.id ?? ''} />
								<!--
									Counted or measured, before the number itself.

									It decides what the goal's own card offers later — a plus
									and a minus, or a field — so it sits where the number is
									being decided rather than somewhere in a settings screen.
								-->
								<label class="shrink-0">
									<span class="sr-only">{t('goals.whatKindOfNumber')}</span>
									<select
										name="targetWhole"
										bind:value={target.whole}
										class="select w-16 text-center text-base"
										title={NUMBER_KINDS.find((k) => k.whole === target.whole)?.label}
									>
										{#each NUMBER_KINDS as kind (kind.symbol)}
											<option value={kind.whole} title={kind.label}>{kind.symbol}</option>
										{/each}
									</select>
								</label>
								<NumberBox
									autocomplete="off"
									name="targetValue"
									min="0"
									step={target.whole ? COUNT_STEP : 'any'}
									inputmode={target.whole ? 'numeric' : 'decimal'}
									placeholder="3"
									bind:value={target.value}
									class="w-24 shrink-0"
								/>
								<input
									autocomplete="off"
									name="targetUnit"
									list="goal-units"
									placeholder={t('goals.booksKmGigs')}
									bind:value={target.unit}
									class="input min-w-0 flex-1"
								/>
								<button
									type="button"
									class="icon-btn icon-btn-danger"
									title={t('goals.removeMeasure')}
									aria-label={t('goals.removeMeasure')}
									onclick={() => (formTargets = formTargets.filter((_, at) => at !== i))}
								>
									<Icon name="trash" />
								</button>
							</div>
						{/each}
					</div>
					<datalist id="goal-units">
						{#each knownUnits as unit (unit)}
							<option value={unit}></option>
						{/each}
					</datalist>
					<button
						type="button"
						class="btn btn-sm mt-2"
						onclick={() => (formTargets = [...formTargets, blankTarget()])}
					>
						<Icon name="plus" />
						{t('goals.addMeasure')}
					</button>
					<span class="mt-1 block text-xs text-gray-500">
						{t('goals.optionalLeaveItEmptyFor')}
					</span>
				</div>

				{#if !editingId}
					<Field label={t('goals.partOf')} span={4}>
						<select name="parentId" class="select">
							<option value="">{t('goals.standalone')}</option>
							{#each parentOptions as g (g.id)}
								<option value={g.id}>{HORIZON_LABELS[g.horizon]}: {g.title}</option>
							{/each}
						</select>
					</Field>
				{/if}

				<Field label={t('ui.notes')} span={12}>
					<textarea name="notes" rows="3" class="textarea" value={editing?.notes ?? ''}></textarea>
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
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
					title={t('goals.noGoalsYet')}
					description="A goal is a commitment with a deadline attached. Start with a week — you can promote it later."
				>
					{#snippet action()}
						<button onclick={openCreate} class="btn btn-primary">
							<Icon name="plus" />
							{t('goals.newGoal')}
						</button>
					{/snippet}
				</EmptyState>
			{:else}
				<EmptyState icon="goals" title={t('goals.noGoalsInThisArea')}>
					{#snippet action()}
						<button onclick={() => (areaFilter = null)} class="btn"
							>{t('goals.showEveryArea')}</button
						>
					{/snippet}
				</EmptyState>
			{/if}
		</div>
	{/if}

	<!--
		No strip of page between two groups on a phone.

		Each horizon is a card, and on a phone the cards are the page — a band
		of background between MONTH and QUARTER reads as a trench rather than
		as a boundary. The gap comes back at desktop width, where a card is an
		object on a page again.
	-->
	<div class="space-y-0 sm:space-y-4" data-tour="goal-list">
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
													<span class="text-xs text-gray-500"
														>{t('goals.partOf2', { title: parent.title })}</span
													>
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
												<!-- Grows into the width instead of leaving it empty: on a
												     phone a fixed 6rem bar left two thirds of the row blank. -->
												<div class="h-1.5 min-w-24 flex-1 bg-gray-200 sm:max-w-40 sm:flex-none">
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

										<!--
											Every measure the goal was given, each with the number it
											stands at. A goal counted from linked tasks keeps them
											visible and editable: they are what somebody typed in, and
											hiding them because a todo got attached loses the record.
										-->
										{#if goal.targets.length > 0}
											<div class="mt-2 space-y-1">
												{#each goal.targets as target (target.id)}
													<form
														method="post"
														action="?/setProgress"
														use:enhance
														class="flex flex-wrap items-center gap-2"
													>
														<input type="hidden" name="targetId" value={target.id} />
														<!--
															A thing you count moves one at a time.
															
															Twelve books is finished a book at a time, and
															reaching for a keyboard to turn 3 into 4 is absurd —
															so a counted measure gets a minus and a plus, each of
															which is the whole gesture: the button carries the new
															number, so a press is a submit and there is nothing to
															save afterwards. A measured one keeps its field,
															because 14.6 is not two presses away from anything.
														-->
														{#if target.whole}
															<button
																class="icon-btn"
																name="currentValue"
																value={Math.max(0, target.currentValue - COUNT_STEP)}
																disabled={target.currentValue <= 0}
																title={t('goals.oneFewer')}
																aria-label={`One fewer ${target.unit || 'towards this'}`.trim()}
															>
																<Icon name="minus" />
															</button>
															<span class="tabular text-xs text-gray-700">
																{target.currentValue}
															</span>
															<button
																class="icon-btn"
																name="currentValue"
																value={target.currentValue + COUNT_STEP}
																title={t('goals.oneMore')}
																aria-label={`One more ${target.unit || 'towards this'}`.trim()}
															>
																<Icon name="plus" />
															</button>
														{:else}
															<NumberBox
																autocomplete="off"
																name="currentValue"
																min="0"
																step="any"
																value={target.currentValue}
																aria-label={`Progress towards ${target.targetValue} ${target.unit}`.trim()}
																class="w-20"
															/>
														{/if}
														<span class="tabular text-xs text-gray-500">
															/ {target.targetValue}
															{target.unit}
														</span>
														<div class="h-1 w-16 shrink-0 bg-gray-200">
															<div
																class="h-full"
																style="width: {Math.round(target.fraction * 100)}%;
																	background-color: {goal.areaColor ?? accent}"
															></div>
														</div>
														{#if !target.whole}
															<button
																class="icon-btn"
																title={t('goals.saveProgress')}
																aria-label={t('goals.saveProgress')}
															>
																<Icon name="check" />
															</button>
														{/if}
													</form>
												{/each}
											</div>
										{/if}

										<!--
											What counts towards this goal, under the goal rather than
											among the buttons that close it. It reveals a part of this
											card, so it belongs to the card's own column.
										-->
										<button
											onclick={() => (openTasksId = openTasksId === goal.id ? null : goal.id)}
											class="btn btn-sm btn-quiet mt-2"
											title={t('goals.whatCountsTowardsThisGoal')}
											>{t('goals.tasks', {
												length:
													goal.linkedSlotIds.length +
													goal.linkedTodoIds.length +
													goal.linkedActivityIds.length
											})}<Icon
												name={openTasksId === goal.id ? 'chevron-up' : 'chevron-down'}
												size={12}
											/>
										</button>
									</div>
								</div>

								<!--
									The controls, in three treatments, starting wherever the goal's
									text happened to end. The rail puts them at the same place on
									every row, and the two that matter — how it ended — keep their
									words, because "achieved" and "missed" are a judgement you make
									once and not a routine action you would recognise from a glyph.

									Four of them, not five: "Tasks (n)" went back to the goal's own
									column below. It is a disclosure for what is already on the card
									and not something done to the goal, and as the rail's fifth
									member it was what pushed the row past the width of a phone —
									which put delete on a line of its own, alone, in the corner.
								-->
								<!--
									The words on the left, under the goal's own text; the two
									glyphs against the right edge. On a phone the whole rail sat
									left and the right half of the card was air.
								-->
								<!--
									Full width only where the card is a column.

									`.row-actions` is `flex: none`, so `w-full` on a row makes
									it take the whole width and the text beside it collapses to
									one character per line. That is what a goal card did on a
									desktop: the title read downwards, a letter at a time.
								-->
								<div class="row-actions w-full gap-1 sm:w-auto">
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
											title={t('goals.closeItAsDone')}
											onclick={() => closeLater(goal, 'achieved')}
										>
											{t('goals.achieved')}
										</button>
										<button
											type="button"
											class="btn btn-sm btn-quiet"
											title={t('goals.closeItAsNotDone')}
											onclick={() => closeLater(goal, 'missed')}
										>
											{t('goals.missed')}
										</button>
									{:else}
										<form method="post" action="?/close" use:enhance>
											<input type="hidden" name="id" value={goal.id} />
											<input type="hidden" name="status" value="open" />
											<button class="btn btn-sm">{t('goals.reopen')}</button>
										</form>
									{/if}
									<button
										title={t('ui.edit')}
										aria-label={t('ui.edit')}
										onclick={() => openEdit(goal)}
										class="icon-btn ml-auto"><Icon name="edit" /></button
									>
									{#if confirmingDelete === goal.id}
										<form method="post" action="?/remove" use:enhance>
											<input type="hidden" name="id" value={goal.id} />
											<button class="btn btn-sm btn-danger" use:armed>{t('goals.confirm')}</button>
										</form>
									{:else}
										<button
											title={t('ui.delete')}
											aria-label={t('ui.delete')}
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
											<span class="tabular">{sl.startTime}</span>{t('goals.everyWeekIts', {
												name: sl.name
											})}
										</p>
									{/each}
									{#each data.activities.filter( (a) => goal.linkedActivityIds.includes(a.id) ) as a (a.id)}
										<p class="py-1 text-xs text-gray-500">
											{t('goals.everyBlockOf', { name: a.name })}
										</p>
									{/each}

									{#if goal.linkedTodoIds.length + goal.linkedSlotIds.length + goal.linkedActivityIds.length === 0}
										<p class="py-1 text-xs text-gray-500">
											{t('goals.nothingLinkedYetProgress')}
										</p>
									{/if}

									<button
										type="button"
										class="btn btn-sm mt-2"
										onclick={() => {
											showDoneTodos = false;
											linkingId = goal.id;
										}}
									>
										{t('goals.chooseTasks')}
									</button>
								</div>
							{/if}
						</div>
					{/each}

					{#if column.goals.length === 0}
						<p class="py-3 text-xs text-gray-500">{t('goals.nothingAtThisHorizon')}</p>
					{/if}
				</div>
			</section>
		{/each}
	</div>

	<Modal
		open={linkingId !== null}
		error={form?.message}
		onclose={() => (linkingId = null)}
		title={t('goals.linkedTasks')}
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
						<span class="eyebrow text-gray-600">{t('goals.activities')}</span>
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
								<EmptyState icon="planner" title={t('goals.noActivitiesYet')} compact />
							{/each}
						</div>
					</div>
					<div>
						<span class="eyebrow text-gray-600">{t('goals.weeklyBlocks')}</span>
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
								<EmptyState icon="calendar" title={t('goals.noWeeklyBlocksYet')} compact />
							{/each}
						</div>
					</div>
					<div>
						<span class="eyebrow text-gray-600">{t('goals.toDos')}</span>
						<div class="mt-2 max-h-64 space-y-1 overflow-y-auto">
							<!--
								Open to-dos, plus any DONE one this goal already counts.

								setGoalLinks replaces the whole set, which is only safe while
								this form shows a checkbox for everything linked — and it
								stopped: done to-dos left the list, so saving the form silently
								unlinked them and the progress bar dropped. They stay here,
								ticked and struck through, until somebody unticks them; the
								rest of the finished list unfolds on request below, so a goal
								can also count something already done.
							-->
							{#each [...data.todos, ...data.allTodos.filter((t) => t.status === 'done' && (showDoneTodos || linking.linkedTodoIds.includes(t.id)))] as t (t.id)}
								<label class="flex items-center gap-2 text-sm text-gray-700">
									<input
										type="checkbox"
										name="todoId"
										value={t.id}
										checked={linking.linkedTodoIds.includes(t.id)}
										class="h-3 w-3"
									/>
									<span
										class={'status' in t && t.status === 'done' ? 'text-gray-400 line-through' : ''}
										>{t.title}</span
									>
								</label>
							{:else}
								<p class="text-xs text-gray-500">{t('goals.noOpenTodos')}</p>
							{/each}
						</div>
						{#if !showDoneTodos}
							<button
								type="button"
								class="btn btn-sm btn-quiet mt-2"
								onclick={() => (showDoneTodos = true)}
							>
								{t('goals.showCompletedToDos')}
							</button>
						{/if}
					</div>
				</div>
			</form>
		{/if}

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (linkingId = null)}>{t('ui.cancel')}</button>
			<button type="submit" form="links-form" class="btn btn-primary">{t('goals.saveLinks')}</button
			>
		{/snippet}
	</Modal>
</div>
