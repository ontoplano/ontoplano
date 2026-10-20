<script lang="ts">
	import { openFromUrl } from '$lib/open-from-url.svelte';
	import { routeGlyph } from '$lib/glyphs';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import StripVerb from '$lib/components/StripVerb.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import { listCursor } from '$lib/actions/list-cursor';
	import { browsable, typing } from '$lib/browse.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import Picker from '$lib/components/Picker.svelte';
	import { enhance } from '$lib/enhance';
	import OneLine from '$lib/components/OneLine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { armed } from '$lib/actions/armed';
	import type { PageServerData, ActionData } from './$types';
	import WorkoutCard from '$lib/components/WorkoutCard.svelte';
	import WorkoutDialogs from '$lib/components/WorkoutDialogs.svelte';
	import { WORKOUT_ROOM_ACTIONS } from '$lib/workout-action-names';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const ROOM = '/health/workouts';

	/*
	 * What narrows the list: a name typed, a category picked. The archived
	 * ones are a toggle, as on the task list, and join the list below the
	 * others rather than hiding behind a fold of their own.
	 */
	let looking = $state('');
	let showArchived = $state(false);
	/** A category id, `none` for the uncategorised, or `all`. */
	let categoryFilter = $state('all');

	const categoryChoices = $derived([
		{ value: 'all', label: t('health.workouts.everyCategory') },
		...data.categories.map((c) => ({ value: String(c.id), label: c.name })),
		{ value: 'none', label: t('health.workouts.noCategory2') }
	]);

	function matches(workout: (typeof data.workouts)[number]): boolean {
		const needle = looking.trim().toLowerCase();
		if (needle && !workout.title.toLowerCase().includes(needle)) return false;
		if (categoryFilter === 'none') return workout.categoryId === null;
		if (categoryFilter !== 'all') return String(workout.categoryId) === categoryFilter;
		return true;
	}

	/*
	 * The order, the same control every list has. By name is how the loader
	 * sends them; "last done" ascending puts the one most overdue at the top,
	 * which is the question a training week asks.
	 */
	const SORTS = ['title', 'lastDone', 'category', 'minutes'] as const;
	type Sort = (typeof SORTS)[number];
	const SORT_LABELS = {
		title: 'ui.name',
		lastDone: 'health.workouts.sortLastDone',
		category: 'health.workouts.category',
		minutes: 'health.workouts.minutes'
	} as const;
	let sortBy = $state<Sort>('title');
	let sortDir = $state<'asc' | 'desc'>('asc');

	type Workout = (typeof data.workouts)[number];
	const categoryRank = $derived(new Map(data.categories.map((c, i) => [c.id, i])));

	/** One comparison per order; ties fall back to the name, so the list never shuffles. */
	function compare(a: Workout, b: Workout): number {
		let by = 0;
		if (sortBy === 'lastDone') by = (a.lastDoneAt ?? '').localeCompare(b.lastDoneAt ?? '');
		else if (sortBy === 'category')
			by =
				(categoryRank.get(a.categoryId ?? -1) ?? data.categories.length) -
				(categoryRank.get(b.categoryId ?? -1) ?? data.categories.length);
		else if (sortBy === 'minutes') by = (a.minutes ?? 0) - (b.minutes ?? 0);
		if (by !== 0) return sortDir === 'asc' ? by : -by;
		const named = a.title.localeCompare(b.title);
		return sortBy === 'title' && sortDir === 'desc' ? -named : named;
	}

	const narrowed = $derived(looking.trim() !== '' || categoryFilter !== 'all');
	const allActive = $derived(data.workouts.filter((w) => !w.archived));
	const active = $derived(allActive.filter(matches).sort(compare));
	const allArchived = $derived(data.workouts.filter((w) => w.archived));
	const archived = $derived(allArchived.filter(matches).sort(compare));
	const showing = $derived(active.length + (showArchived ? archived.length : 0));
	/** Every row on screen, in order — what j/k walks. */
	const rows = $derived(showArchived ? [...active, ...archived] : active);

	function clearFilters() {
		looking = '';
		categoryFilter = 'all';
		showArchived = false;
	}

	let confirmingDelete: (typeof data.workouts)[number] | null = $state(null);
	/**
	 * The workout whose plan is open.
	 *
	 * The plan is what somebody reads while doing it, and it used to be
	 * reachable only through Edit — a form is the wrong place to read from,
	 * and one stray keystroke there rewrites the thing you came to consult.
	 */
	let expanded: number | null = $state(null);

	/** The card's dialogs, shared with a notebook's Workouts tab — see `WorkoutDialogs`. */
	let dialogs: WorkoutDialogs | undefined = $state();
	const openNew = () => dialogs?.openNew();
	const openEdit = (chosen: (typeof data.workouts)[number]) => dialogs?.edit(chosen);

	// `?edit=<id>` opens its editor: how a notification or a receipt leads here (`$lib/object-links`).
	openFromUrl((id) => {
		const workout = data.workouts.find((one) => one.id === id);
		if (workout) openEdit(workout);
	});

	let showCategories = $state(false);
	let addingCategory = $state(false);
	let editingCategory = $state<number | null>(null);
	let confirmDeleteCategory = $state<number | null>(null);

	/** Where j/k stands: an index into `rows`, or -1 before the first press. */
	let cursor = $state(-1);
	browsable(() => ({
		items: () => rows,
		cursor: () => cursor,
		moveTo: (i) => (cursor = i),
		open: (i) => {
			const id = rows[i].id;
			expanded = expanded === id ? null : id;
		},
		edit: (i) => openEdit(rows[i])
	}));

	function onkeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (typing(event)) return;
		if (getAction(ROOM, event) === 'new') {
			event.preventDefault();
			openNew();
		}
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('health.workouts.newWorkout'),
		run: openNew,
		kbd: keyFor(ROOM, 'new')
	}));
</script>

<svelte:window {onkeydown} />

{#snippet sortControl()}
	<SortControl
		value={sortBy}
		options={SORTS}
		labels={SORT_LABELS}
		direction={sortDir}
		onpick={(next) => (sortBy = next)}
		onflip={() => (sortDir = sortDir === 'asc' ? 'desc' : 'asc')}
		label={t('health.workouts.orderBy')}
	/>
{/snippet}

<!-- The controls and the workouts are one object — see `RoomSurface` — with
     the task list's strip along its top. -->
<RoomSurface dataTour="workout-list">
	{#snippet tools()}
		<FilterBar
			name="workouts"
			on={narrowed || showArchived}
			summary={categoryFilter === 'all'
				? ''
				: (categoryChoices.find((c) => c.value === categoryFilter)?.label ?? '')}
			onclear={clearFilters}
			trailing={sortControl}
		>
			{#snippet lead()}
				<SearchField bind:value={looking} label={t('health.workouts.search')} />
			{/snippet}
			<!-- What the category picker picks from, at the end of the strip. -->
			{#snippet verb()}
				<StripVerb
					icon="blocks"
					label={t('health.workouts.categories')}
					onclick={() => (showCategories = true)}
					aria-haspopup="dialog"
				/>
			{/snippet}
			{#snippet count()}
				<!-- Held open by the count of every workout, so narrowing does not
				     change its width. See `.count-slot`. -->
				<ShowingCount
					total={data.workouts.length}
					shown={showing}
					said={(count) => t('health.workouts.showingCount', { count })}
				/>
			{/snippet}
			<!-- Two filters, so they stay out on a phone rather than behind a sheet. -->
			{#snippet inline()}
				{#if data.categories.length > 0}
					<Picker
						value={categoryFilter}
						options={categoryChoices}
						onpick={(next) => (categoryFilter = next)}
						label={t('health.workouts.category')}
					/>
				{/if}
				<!-- Named with its number, so a put-away workout is never quietly gone. -->
				<button
					onclick={() => (showArchived = !showArchived)}
					aria-pressed={showArchived}
					class="btn btn-sm shrink-0"
					hidden={allArchived.length === 0 && !showArchived}
				>
					{t('health.workouts.archived', { length: allArchived.length })}
				</button>
			{/snippet}
		</FilterBar>
	{/snippet}

	{#if showing === 0}
		<!-- None yet, or none that match: saying the first when the second is
		     true reads as a list that lost something. -->
		{#if narrowed}
			<EmptyState filtered onclear={clearFilters} title={t('health.workouts.noneMatch')} />
		{:else}
			<EmptyState
				icon={routeGlyph('/health/workouts')!}
				title={t('health.workouts.noWorkoutsYet')}
				description={t('health.workouts.writeAWorkoutDown')}
			/>
		{/if}
	{/if}

	{#if active.length > 0}
		<ul class="divide-y divide-gray-200">
			{#each active as workout, i (workout.id)}
				<!--
					The card is a component, so a workout filed under a notebook is the
					same workout this room shows — its plan, and the register of what
					was actually done under it. See `WorkoutCard`.
				-->
				<WorkoutCard
					{workout}
					sessions={data.sessions}
					actions={WORKOUT_ROOM_ACTIONS}
					expanded={expanded === workout.id}
					cursor={cursor === i}
					onexpand={(id) => (expanded = expanded === id ? null : id)}
					onedit={() => openEdit(workout)}
					onlog={() => dialogs?.log(workout)}
					onschedule={() => dialogs?.schedule(workout)}
					onsession={(_, sessionId) => dialogs?.editSession(workout, sessionId)}
					ondeletesession={(sessionId) => dialogs?.removeSession(sessionId)}
				/>
			{/each}
		</ul>
	{/if}

	{#if showArchived && archived.length > 0}
		<!-- Put away, under the rest: back onto the list, or gone for good. -->
		<ul class="divide-y divide-gray-200 {active.length > 0 ? 'border-t border-gray-200' : ''}">
			{#each archived as workout, i (workout.id)}
				<li
					class="list-row opacity-60 focus-within:opacity-100 hover:opacity-100"
					data-row
					use:listCursor={cursor === active.length + i}
				>
					<span class="row-rail"></span>
					<span class="list-row-main">
						<span class="block text-sm font-medium break-words text-gray-900">{workout.title}</span>
						{#if workout.categoryName}
							<span class="mt-1 flex"
								><CategoryMark name={workout.categoryName} color={null} /></span
							>
						{/if}
					</span>
					<span class="list-row-actions">
						<form data-leaves method="post" action="?/archive" use:enhance>
							<input type="hidden" name="id" value={workout.id} />
							<input type="hidden" name="archived" value="false" />
							<button
								class="icon-btn"
								type="submit"
								title={t('health.workouts.restore')}
								aria-label={t('health.workouts.restoreIt', { title: workout.title })}
							>
								<Icon name="undo" />
							</button>
						</form>
						<button
							class="icon-btn icon-btn-danger"
							title={t('ui.delete')}
							aria-label={t('health.workouts.delete', { title: workout.title })}
							onclick={() => (confirmingDelete = workout)}
						>
							<Icon name="trash" />
						</button>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</RoomSurface>

<WorkoutDialogs
	bind:this={dialogs}
	sessions={data.sessions}
	categories={data.categories}
	notebooks={data.notebooks}
	activityNames={data.activityNames}
	actions={WORKOUT_ROOM_ACTIONS}
	error={form?.message}
/>

<!-- Hard delete, only from the archived list, confirmed in its own dialog. -->
<Modal
	open={confirmingDelete !== null}
	error={form?.message}
	title={t('health.workouts.deleteThisWorkout')}
	onclose={() => (confirmingDelete = null)}
	size="sm"
>
	{#if confirmingDelete}
		<p class="text-sm text-gray-600">
			<strong>{confirmingDelete.title}</strong>
			{t('health.workouts.isDeletedForGoodAnd')}
		</p>
		<!-- One that has been done is refused, and the dialog stays open to say
		     so: the sessions behind it are the record of what somebody actually
		     did, and deleting the plan would take them with it. -->
	{/if}
	{#snippet footer()}
		<button class="btn" type="button" onclick={() => (confirmingDelete = null)}
			>{t('health.workouts.keepIt')}</button
		>
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') confirmingDelete = null;
					return update();
				}}
		>
			<input type="hidden" name="id" value={confirmingDelete?.id} />
			<button class="btn btn-danger" type="submit" use:armed>{t('ui.delete')}</button>
		</form>
	{/snippet}
</Modal>

<!--
	The categories this account keeps.

	They were five words in the schema — strength, cardio, mobility, sport,
	other — which is somebody else deciding what your training is made of, and
	the fifth being called "other" is the proof it did not fit. The same shape
	and the same word as the shopping list's categories, because it is the same
	idea and calling it something else would be two names for one thing.
-->
<Modal
	bind:open={showCategories}
	error={form?.message}
	title={t('health.workouts.categoriesOfWorkout')}
	description={t('health.workouts.yoursToNameAWorkout')}
	size="sm"
>
	<ul class="divide-y divide-gray-200 border border-gray-200">
		{#each data.categories as category (category.id)}
			<li class="flex items-center gap-2 px-3 py-2">
				{#if editingCategory === category.id}
					<form
						method="post"
						action="?/renameCategory"
						use:enhance={() =>
							async ({ update, result }) => {
								await update({ reset: false });
								if (result.type === 'success') editingCategory = null;
							}}
						class="flex flex-1 items-center gap-2"
					>
						<input type="hidden" name="id" value={category.id} />
						<OneLine name="name" value={category.name} required autofocus class="input flex-1" />
						<button
							class="btn btn-sm btn-primary"
							title={t('ui.save')}
							aria-label={t('health.workouts.saveTheName')}
						>
							<Icon name="check" />
						</button>
						<button type="button" class="btn btn-sm" onclick={() => (editingCategory = null)}>
							{t('ui.cancel')}
						</button>
					</form>
				{:else}
					<span class="flex-1 text-sm text-gray-900">{category.name}</span>
					<button
						onclick={() => (editingCategory = category.id)}
						class="icon-btn"
						title={t('ui.rename')}
						aria-label={t('health.workouts.rename', { name: category.name })}
						><Icon name="edit" /></button
					>
					{#if confirmDeleteCategory === category.id}
						<form
							method="post"
							action="?/deleteCategory"
							use:enhance={() =>
								async ({ update }) => {
									await update({ reset: false });
									confirmDeleteCategory = null;
								}}
							class="flex items-center gap-1"
						>
							<input type="hidden" name="id" value={category.id} />
							<button
								type="button"
								class="btn btn-sm"
								onclick={() => (confirmDeleteCategory = null)}
							>
								{t('ui.cancel')}
							</button>
							<button class="btn btn-danger btn-sm" use:armed>{t('ui.remove')}</button>
						</form>
					{:else}
						<button
							onclick={() => (confirmDeleteCategory = category.id)}
							class="icon-btn icon-btn-danger"
							title={t('ui.remove')}
							aria-label={t('health.workouts.remove', { name: category.name })}
							><Icon name="trash" /></button
						>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>

	{#if addingCategory}
		<form
			method="post"
			action="?/createCategory"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: result.type === 'success' });
					if (result.type === 'success') addingCategory = false;
				}}
			class="mt-3 flex items-center gap-2"
		>
			<OneLine
				name="label"
				placeholder={t('health.workouts.swimming')}
				required
				autofocus
				class="input flex-1"
			/>
			<button
				class="btn btn-sm btn-primary"
				title={t('ui.add')}
				aria-label={t('health.workouts.addTheCategory')}
			>
				<Icon name="plus" />
			</button>
			<button type="button" class="btn btn-sm" onclick={() => (addingCategory = false)}
				>{t('ui.cancel')}</button
			>
		</form>
	{:else}
		<button onclick={() => (addingCategory = true)} class="btn btn-sm mt-3">
			<Icon name="plus" />
			{t('health.workouts.newCategory')}
		</button>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn btn-primary" onclick={() => (showCategories = false)}
			>{t('ui.done')}</button
		>
	{/snippet}
</Modal>
