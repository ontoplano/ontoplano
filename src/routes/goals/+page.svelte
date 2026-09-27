<script lang="ts">
	import { useWhen } from '$lib/when-context.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import StripVerb from '$lib/components/StripVerb.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import Picker from '$lib/components/Picker.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
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
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Goal = PageServerData['goals'][number];

	let showForm = $state(false);
	let showAreas = $state(false);
	/** The area whose removal has been asked for and not yet confirmed. */
	let removingArea: number | null = $state(null);
	/** The area being renamed in place. */
	let renamingArea: number | null = $state(null);
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
	/* Drawn once the keys have moved it, not as a ring on the first goal. */
	let cursorShown = $state(false);

	/** What the search box holds; a goal matches on its title, notes or area. */
	let looking = $state('');
	const needle = $derived(looking.trim().toLocaleLowerCase());

	const inArea = $derived(
		areaFilter === null ? data.goals : data.goals.filter((g) => g.areaId === areaFilter)
	);
	const visible = $derived(
		needle === ''
			? inArea
			: inArea.filter((g) =>
					[g.title, g.notes ?? '', g.areaName ?? ''].some((text) =>
						text.toLocaleLowerCase().includes(needle)
					)
				)
	);
	/** Whether the area or the search is hiding any goal. */
	const narrowed = $derived(areaFilter !== null || needle !== '');

	function clearFilters() {
		areaFilter = null;
		looking = '';
		if (data.includeClosed) toggleClosed();
	}

	/** What is narrowing the list, for the phone's folded filter button. */
	const summary = $derived(
		[
			areaFilter === null ? '' : (data.areas.find((a) => a.id === areaFilter)?.name ?? ''),
			data.includeClosed ? t('goals.closedCount', { count: data.closedCount }) : ''
		]
			.filter(Boolean)
			.join(', ')
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
		}).filter((c) => c.goals.length > 0)
	);

	/** Every goal in the order it is drawn, which is the order j and k walk. */
	const ordered = $derived(
		byHorizon.flatMap((c) => [...c.loose, ...c.filed.flatMap((b) => b.goals)])
	);
	const cursorId = $derived(ordered[Math.min(selectedIndex, ordered.length - 1)]?.id ?? null);

	/** The area filter as the picker holds it: a string, 'all' for none. */
	const ALL_AREAS = 'all';
	const areaOptions = $derived([
		{ value: ALL_AREAS, label: t('goals.allAreas') },
		...data.areas.map((a) => ({ value: String(a.id), label: a.name }))
	]);

	function toggleClosed() {
		// Both branches are resolved; the rule does not look inside a conditional.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(data.includeClosed ? resolve('/goals') : resolve('/goals?closed=1'), {
			noScroll: true,
			keepFocus: true
		});
	}

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
			const max = ordered.length - 1;
			if (max < 0) return;
			if (!cursorShown) {
				cursorShown = true;
				selectedIndex = Math.min(selectedIndex, max);
				return;
			}
			selectedIndex = Math.min(Math.max(selectedIndex + (action === 'next' ? 1 : -1), 0), max);
			document.getElementById(`goal-${ordered[selectedIndex].id}`)?.scrollIntoView({
				block: 'nearest'
			});
			return;
		}
		if (action === 'edit') {
			const under = cursorShown ? ordered.find((g) => g.id === cursorId) : undefined;
			if (!under) return;
			e.preventDefault();
			openEdit(under);
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

<TabbedRoom title={t('goals.goals')} room="goals" label={t('goals.goals')}>
	<div class="space-y-4">
		<FormError message={form?.message} />

		<Modal
			bind:open={showAreas}
			onclose={() => {
				renamingArea = null;
				removingArea = null;
			}}
			error={form?.message}
			title={t('goals.areas')}
			description={t('goals.fitnessStudyMoney')}
			size="sm"
		>
			{#if data.areas.length > 0}
				<div class="divide-y divide-gray-200 border border-gray-200">
					{#each data.areas as area, index (area.id)}
						<div class="list-row" data-area={area.name}>
							{#if renamingArea === area.id}
								<form
									method="post"
									action="?/updateArea"
									use:enhance={() =>
										async ({ update, result }) => {
											await update({ reset: false });
											if (result.type === 'success') renamingArea = null;
										}}
									class="flex min-w-0 flex-1 items-center gap-2"
								>
									<input type="hidden" name="id" value={area.id} />
									<OneLine
										name="label"
										value={area.name}
										class="input min-w-0 flex-1"
										required
										autofocus
									/>
									<button class="icon-btn" title={t('ui.save')} aria-label={t('ui.save')}>
										<Icon name="check" />
									</button>
									<button
										type="button"
										class="icon-btn"
										title={t('ui.cancel')}
										aria-label={t('ui.cancel')}
										onclick={() => (renamingArea = null)}
									>
										<Icon name="close" />
									</button>
								</form>
							{:else}
								<div class="list-row-main flex items-center gap-3">
									<!-- The browser's own colour control, saved as it is let go of:
								     there is nothing else on the row a Save would cover. -->
									<form method="post" action="?/updateArea" use:enhance class="flex shrink-0">
										<input type="hidden" name="id" value={area.id} />
										<input
											type="color"
											name="color"
											value={area.color}
											class="h-7 w-8 cursor-pointer border border-gray-300 bg-transparent p-0"
											title={t('goals.areaColour', { name: area.name })}
											aria-label={t('goals.areaColour', { name: area.name })}
											onchange={(e) => e.currentTarget.form?.requestSubmit()}
										/>
									</form>
									<span class="min-w-0 text-sm break-words text-gray-900">{area.name}</span>
								</div>
								<!-- Two steps, like every removal: the bin arms it, the worded
							     button does it, and Cancel sits where the bin was. -->
								<div class="list-row-actions">
									{#if removingArea === area.id}
										<form
											method="post"
											action="?/deleteArea"
											use:enhance={() =>
												async ({ update }) => {
													removingArea = null;
													await update();
												}}
										>
											<input type="hidden" name="id" value={area.id} />
											<button class="btn btn-sm btn-danger" use:armed>{t('ui.remove')}</button>
										</form>
										<button type="button" class="btn btn-sm" onclick={() => (removingArea = null)}
											>{t('ui.cancel')}</button
										>
									{:else}
										<!-- The order here is the order of the area filter and of
									     the goal form's list. The end rows keep both arrows,
									     disabled, so the row does not shift as an area moves. -->
										<form method="post" action="?/moveArea" use:enhance class="contents">
											<input type="hidden" name="id" value={area.id} />
											<input type="hidden" name="delta" value="-1" />
											<button
												class="icon-btn"
												disabled={index === 0}
												title={t('goals.moveAreaEarlier', { name: area.name })}
												aria-label={t('goals.moveAreaEarlier', { name: area.name })}
											>
												<Icon name="chevron-up" />
											</button>
										</form>
										<form method="post" action="?/moveArea" use:enhance class="contents">
											<input type="hidden" name="id" value={area.id} />
											<input type="hidden" name="delta" value="1" />
											<button
												class="icon-btn"
												disabled={index === data.areas.length - 1}
												title={t('goals.moveAreaLater', { name: area.name })}
												aria-label={t('goals.moveAreaLater', { name: area.name })}
											>
												<Icon name="chevron-down" />
											</button>
										</form>
										<button
											type="button"
											class="icon-btn"
											title={t('ui.rename')}
											aria-label={t('goals.renameArea', { name: area.name })}
											onclick={() => {
												removingArea = null;
												renamingArea = area.id;
											}}
										>
											<Icon name="edit" />
										</button>
										<button
											type="button"
											class="icon-btn icon-btn-danger"
											title={t('ui.remove')}
											aria-label={t('ui.remove')}
											onclick={() => (removingArea = area.id)}
										>
											<Icon name="trash" />
										</button>
									{/if}
								</div>
							{/if}
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
				<button type="button" class="btn" onclick={() => (showAreas = false)}>{t('ui.done')}</button
				>
				<button type="submit" form="area-form" class="btn btn-primary">{t('goals.addArea')}</button>
			{/snippet}
		</Modal>

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
				<button type="button" class="btn" onclick={() => (showForm = false)}
					>{t('ui.cancel')}</button
				>
				<button type="submit" form="goal-form" class="btn btn-primary">
					{editingId ? t('ui.save') : t('goals.createGoal')}
				</button>
			{/snippet}
		</Modal>

		{#snippet card(goal: Goal)}
			<GoalCard
				{goal}
				goals={data.goals}
				allTodos={data.allTodos}
				slots={data.slots}
				activities={data.activities}
				actions={GOAL_ROOM_ACTIONS}
				onedit={(id) => {
					const one = data.goals.find((g) => g.id === id);
					if (one) openEdit(one);
				}}
				onlink={(id) => (linkingId = id)}
				selected={cursorShown && goal.id === cursorId}
			/>
		{/snippet}

		<RoomSurface dataTour="goal-list">
			{#snippet tools()}
				<FilterBar
					name="goals"
					on={narrowed || data.includeClosed}
					{summary}
					onclear={clearFilters}
				>
					{#snippet lead()}
						<SearchField bind:value={looking} label={t('goals.searchGoals')} />
					{/snippet}
					<!-- Managing the areas is not narrowing the list, so it stands at the
				     far end of the strip, where another room keeps its order. -->
					{#snippet verb()}
						<StripVerb
							icon="tag"
							label={t('goals.areas')}
							onclick={() => (showAreas = true)}
							data-tour="goal-areas"
						/>
					{/snippet}
					{#snippet count()}
						<!-- Held open by the whole list's count, so narrowing it moves nothing. -->
						<ShowingCount
							total={data.goals.length}
							shown={visible.length}
							said={(count) => t('goals.showingCount', { count })}
						/>
					{/snippet}
					{#if data.areas.length > 0}
						<Picker
							value={areaFilter === null ? ALL_AREAS : String(areaFilter)}
							options={areaOptions}
							onpick={(next) => (areaFilter = next === ALL_AREAS ? null : Number(next))}
							label={t('goals.area')}
							class="min-w-36 flex-1 sm:flex-none"
						/>
					{/if}
					<!-- One label either way, with the number of goals it puts away. -->
					<button
						type="button"
						class="btn btn-sm shrink-0"
						aria-pressed={data.includeClosed}
						onclick={toggleClosed}
						hidden={data.closedCount === 0 && !data.includeClosed}
					>
						{t('goals.closedCount', { count: data.closedCount })}
					</button>
				</FilterBar>
			{/snippet}

			{#if visible.length === 0}
				{#if narrowed}
					<EmptyState
						icon="search"
						title={t('goals.noGoalsMatch')}
						description={t('goals.noneOfTheseMatch', { count: data.goals.length })}
					>
						{#snippet action()}
							<button onclick={clearFilters} class="btn btn-sm">{t('filters.clear')}</button>
						{/snippet}
					</EmptyState>
				{:else}
					<EmptyState
						icon="goals"
						title={t('goals.noGoalsYet')}
						description={t('goals.aGoalIsACommitment')}
					/>
				{/if}
			{:else}
				<!--
				One group per horizon, headed the way the review heads its days: a
				quiet band with the name and how many, the rows edge to edge under it.
			-->
				<div class="divide-y divide-gray-200">
					{#each byHorizon as column (column.horizon)}
						<section aria-labelledby="horizon-{column.horizon}">
							<h2
								id="horizon-{column.horizon}"
								class="eyebrow flex items-center justify-between gap-4 border-b border-gray-200 bg-gray-50 px-4 py-1.5 text-gray-600"
							>
								{t(HORIZON_LABELS[column.horizon])}
								<span class="tabular">{column.goals.length}</span>
							</h2>
							<div class="divide-y divide-gray-200">
								{#each column.loose as goal (goal.id)}
									{@render card(goal)}
								{/each}
								<!--
								A notebook's own goals, under its name, so the list says which
								of these are about a subject and which are not. The name is a
								link: the notebook is where the rest of it is.
							-->
								{#each column.filed as book (book.id)}
									<div>
										<a
											href={resolve('/notebooks/[id]', { id: String(book.id) })}
											class="flex items-center gap-1.5 px-4 pt-2.5 pb-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline"
										>
											<Icon name="notebook" size={12} />
											{book.title}
										</a>
										<div class="divide-y divide-gray-200">
											{#each book.goals as goal (goal.id)}
												{@render card(goal)}
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</section>
					{/each}
				</div>
			{/if}
		</RoomSurface>

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
</TabbedRoom>
