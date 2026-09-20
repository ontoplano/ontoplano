<script lang="ts">
	import { useWhen } from '$lib/when-context.svelte';
	import Swatch from '$lib/components/Swatch.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import RoomBar from '$lib/components/RoomBar.svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import OneLine from '$lib/components/OneLine.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { enhance } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageServerData, ActionData } from './$types';
	import Field from '$lib/components/Field.svelte';
	import GoalCard from '$lib/components/GoalCard.svelte';
	import GoalLinksModal from '$lib/components/GoalLinksModal.svelte';
	import GoalFields from '$lib/components/fields/GoalFields.svelte';
	import { GOAL_ROOM_ACTIONS } from '$lib/goal-action-names';
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
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Goal = PageServerData['goals'][number];

	let showForm = $state(false);
	let showAreas = $state(false);
	let editingId: number | null = $state(null);
	let linkingId: number | null = $state(null);
	let areaFilter: number | null = $state(null);
	let formHorizon: Horizon = $state('week');
	let formStart: string = $state('');
	/**
	 * The measures on the goal being written, one row each.
	 *
	 * A row carries the id of the measure it edits so the number already on it
	 * survives a rename of its unit; a row with no id is a new one.
	 */
	let formTargets: {
		id: number | null;
		value: string;
		unit: string;
		whole: boolean;
		/** A workout measure this one counts, or '' for a number kept by hand. */
		measureActivity: string;
	}[] = $state([]);
	let selectedIndex = $state(0);

	const accent = SECTION_COLORS.home;

	const visible = $derived(
		areaFilter === null ? data.goals : data.goals.filter((g) => g.areaId === areaFilter)
	);

	/** One column per horizon, so the year and the week sit side by side. */
	const byHorizon = $derived(
		HORIZONS.map((h) => {
			const of = visible.filter((g) => g.horizon === h);
			/*
			 * A goal about a subject sits below the ones about the life.
			 *
			 * Filing a goal under a notebook scopes it — "read twelve books" is
			 * a goal you hold; "finish the kitchen tiling" belongs to the
			 * renovation and is only a goal while that is going on. Mixed into
			 * one list they read as the same kind of thing, so the loose ones
			 * come first and each notebook's own are grouped under its name.
			 */
			const loose = of.filter((g) => g.notebookId === null);
			const filed = [...new Set(of.filter((g) => g.notebookId !== null).map((g) => g.notebookId))]
				.map((id) => ({
					id: id as number,
					title: of.find((g) => g.notebookId === id)?.notebookTitle ?? '',
					goals: of.filter((g) => g.notebookId === id)
				}))
				.sort((a, b) => a.title.localeCompare(b.title));
			return { horizon: h, goals: of, loose, filed };
		}).filter((c) => c.goals.length > 0 || showForm)
	);

	/** Parents a goal of this horizon could genuinely belong to. */
	const parentOptions = $derived(
		data.goals.filter((g) => canNestUnder(formHorizon, g.horizon) && g.status === 'open')
	);

	const editing = $derived(editingId ? (data.goals.find((g) => g.id === editingId) ?? null) : null);

	/** Which period the chosen start date lands in, shown next to the field. */
	const formPeriod = $derived(
		formStart
			? describePeriod(
					t,
					now(),
					formHorizon,
					periodStart(formHorizon, new Date(`${formStart}T00:00:00`))
				)
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

	function blankTarget() {
		// Counted by default: most goals are a number of things done, and kept
		// by hand, which is what an empty measure means.
		return { id: null, value: '', unit: '', whole: true, measureActivity: '' };
	}

	function openCreate(inNotebook: number | null = null) {
		editingId = null;
		formHorizon = 'week';
		formStart = today();
		formTargets = [blankTarget()];
		startingNotebook = inNotebook;
		showForm = true;
	}

	/**
	 * Which notebook a goal being written belongs to, when something else asked.
	 *
	 * A notebook's Goals tab offers "New goal", and the goal it means is a goal
	 * about that notebook — so the link carries it and the form opens with it
	 * already chosen rather than making somebody find it in the picker after
	 * being sent here.
	 */
	let startingNotebook: number | null = $state(null);

	/*
	 * `?new=1` opens the form on arrival, with `?notebookId=` already filled in.
	 * Read once per navigation rather than on every render, so closing the form
	 * does not reopen it while the query is still in the address bar.
	 */
	let openedFor = '';
	$effect(() => {
		const url = page.url;
		if (url.search === openedFor) return;
		openedFor = url.search;
		if (url.searchParams.get('new') !== '1') return;
		const asked = Number(url.searchParams.get('notebookId'));
		openCreate(Number.isInteger(asked) && asked > 0 ? asked : null);
	});

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
						whole: t.whole,
						measureActivity: t.measureActivity ?? ''
					}))
				: [blankTarget()];
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
		label: t('goals.newGoal'),
		tour: 'goal-new',
		kbd: keyFor('/goals', 'new'),
		run: () => openCreate()
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
		description={t('goals.fitnessStudyMoney')}
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
						? 'on-fill font-semibold'
						: 'border-gray-300 bg-white text-gray-600 hover:text-gray-900'}">{t('ui.all')}</button
				>
			{/if}
			{#each data.areas as area (area.id)}
				<button
					onclick={() => (areaFilter = areaFilter === area.id ? null : area.id)}
					class="border px-2 py-0.5 {areaFilter === area.id
						? 'on-fill font-semibold'
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
					{data.includeClosed ? t('goals.hideClosed') : t('goals.showClosed')}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	{/if}

	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? t('goals.editGoal') : t('goals.newGoal')}
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

			<GoalFields
				{editing}
				{editingId}
				bind:horizon={formHorizon}
				bind:start={formStart}
				bind:targets={formTargets}
				period={formPeriod}
				areas={data.areas}
				notebooks={data.notebooks}
				workoutMeasures={data.workoutMeasures}
				{parentOptions}
				{knownUnits}
				{startingNotebook}
			/>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
			<button type="submit" form="goal-form" class="btn btn-primary">
				{editingId ? 'Save' : t('goals.createGoal')}
			</button>
		{/snippet}
	</Modal>

	{#if visible.length === 0 && !showForm}
		<div class="border border-gray-200 bg-white shadow-card">
			{#if data.goals.length === 0}
				<EmptyState
					icon="goals"
					title={t('goals.noGoalsYet')}
					description={t('goals.aGoalIsACommitment')}
				>
					{#snippet action()}
						<button onclick={() => openCreate()} class="btn btn-primary">
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

	{#snippet card(goal: Goal)}
		<GoalCard
			{goal}
			goals={data.goals}
			allTodos={data.allTodos}
			slots={data.slots}
			activities={data.activities}
			actions={GOAL_ROOM_ACTIONS}
			{accent}
			onedit={(id) => {
				const one = data.goals.find((g) => g.id === id);
				if (one) openEdit(one);
			}}
			onlink={(id) => (linkingId = id)}
		/>
	{/snippet}

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
					<span class="eyebrow text-gray-600">{t(HORIZON_LABELS[column.horizon])}</span>
					<span class="tabular text-xs text-gray-500">{column.goals.length}</span>
				</div>

				<div class="divide-y divide-gray-200">
					{#each column.loose as goal (goal.id)}
						{@render card(goal)}
					{/each}

					{#if column.goals.length === 0}
						<p class="py-3 text-xs text-gray-500">{t('goals.nothingAtThisHorizon')}</p>
					{/if}
				</div>

				<!--
					A notebook's own goals, under a rule with its name on it, so the
					list says which of these are about a subject and which are not.
					The name is a link: the notebook is where the rest of it is.
				-->
				{#each column.filed as book (book.id)}
					<div class="mt-3 border-t-2 border-gray-300 pt-2">
						<a
							href={resolve('/notebooks/[id]', { id: String(book.id) })}
							class="eyebrow flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
						>
							<Icon name="notebook" size={12} />
							{book.title}
						</a>
						<div class="mt-1 divide-y divide-gray-200">
							{#each book.goals as goal (goal.id)}
								{@render card(goal)}
							{/each}
						</div>
					</div>
				{/each}
			</section>
		{/each}
	</div>

	<GoalLinksModal
		goal={linking}
		activities={data.activities}
		slots={data.slots}
		todos={data.todos}
		allTodos={data.allTodos}
		action={GOAL_ROOM_ACTIONS.setLinks}
		error={form?.message}
		onclose={() => (linkingId = null)}
	/>
</div>
