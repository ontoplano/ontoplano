<script lang="ts">
	import Backlinks from '$lib/components/Backlinks.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import StripVerb from '$lib/components/StripVerb.svelte';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Picker from '$lib/components/Picker.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import ColorWell from '$lib/components/ColorWell.svelte';
	import { enhance } from '$lib/enhance';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { CATEGORY_FALLBACK_COLOR, CATEGORY_DEFAULT_NEW } from '$lib/colors.js';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { listCursor } from '$lib/actions/list-cursor';
	import { useT } from '$lib/i18n';

	const t = useT();
	const ROOM = '/tasks/activities';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let selectedIndex = $state(0);
	let activeFilters: Set<number> = $state(new Set());
	let looking = $state('');
	let showCategoryForm = $state(false);
	let editingCategoryId: number | null = $state(null);
	let newCatColor = $state(CATEGORY_DEFAULT_NEW);
	let confirmingDelete: string | null = $state(null);
	/**
	 * Put-away activities, on their own.
	 *
	 * An activity that history names cannot be deleted without rewriting that
	 * history, so it is put away instead: gone from the list and the plan's
	 * pickers, every record under it kept. Deleting is for one nothing names,
	 * and it is offered only here, once it has been put away.
	 */
	let showArchived = $state(false);
	const putAway = $derived(data.activities.filter((a) => !a.active).length);
	const pool = $derived(data.activities.filter((a) => a.active !== showArchived));

	function catColor(catId: number | null): string {
		if (!catId) return CATEGORY_FALLBACK_COLOR;
		return data.categories.find((c) => c.id === catId)?.color ?? CATEGORY_FALLBACK_COLOR;
	}

	const narrowed = $derived(activeFilters.size > 0 || looking.trim() !== '');

	const shown = $derived.by(() => {
		const needle = looking.trim().toLowerCase();
		return pool.filter(
			(a) =>
				(activeFilters.size === 0 || activeFilters.has(a.categoryId)) &&
				(!needle ||
					a.name.toLowerCase().includes(needle) ||
					(a.description ?? '').toLowerCase().includes(needle))
		);
	});

	/** "Every category" first: it is what the Picker says with nothing chosen, and picking it clears. */
	const EVERY = '';
	const categoryChoices = $derived([
		{ value: EVERY, label: t('tasks.activities.everyCategory') },
		...data.categories.map((c) => ({ value: String(c.id), label: c.name }))
	]);
	const chosenCategories = $derived([...activeFilters].map(String));

	function pickCategories(next: string[]) {
		const everyNewlyPicked = next.includes(EVERY) && !chosenCategories.includes(EVERY);
		activeFilters = everyNewlyPicked
			? new Set()
			: new Set(next.filter((v) => v !== EVERY).map(Number));
		selectedIndex = 0;
	}

	function summary(): string {
		const names = data.categories.filter((c) => activeFilters.has(c.id)).map((c) => c.name);
		if (looking.trim()) names.unshift(`“${looking.trim()}”`);
		return names.join(', ');
	}

	function clearFilters() {
		activeFilters = new Set();
		looking = '';
		showArchived = false;
		selectedIndex = 0;
	}

	function toggleFilter(catId: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built, read once and thrown away inside this function; nothing tracks it.
		const next = new Set(activeFilters);
		if (next.has(catId)) next.delete(catId);
		else next.add(catId);
		activeFilters = next;
		selectedIndex = 0;
	}

	function openNew() {
		editingId = null;
		showForm = true;
	}

	function openEdit(id: number) {
		editingId = id;
		showForm = true;
	}

	function toggleArchived() {
		showArchived = !showArchived;
		selectedIndex = 0;
		confirmingDelete = null;
	}

	/* Keep the cursor on the list when a row leaves it — put away, taken out, deleted. */
	$effect(() => {
		if (selectedIndex > shown.length - 1) selectedIndex = Math.max(0, shown.length - 1);
	});

	function openCategories() {
		showCategoryForm = true;
		editingCategoryId = null;
		newCatColor = CATEGORY_DEFAULT_NEW;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;
		if (e.key === 'Escape') {
			confirmingDelete = null;
			return;
		}

		const items = shown;
		const action = getAction(ROOM, e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'navigate-down':
				confirmingDelete = null;
				selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
				break;
			case 'navigate-up':
				confirmingDelete = null;
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'new':
				openNew();
				break;
			case 'edit':
				if (items[selectedIndex]) openEdit(items[selectedIndex].id);
				break;
			case 'archive': {
				const one = items[selectedIndex];
				if (one)
					(document.getElementById(`archive-${one.id}`) as HTMLFormElement | null)?.requestSubmit();
				break;
			}
			case 'delete': {
				// Arms the confirmation only; deleting takes a deliberate press.
				const one = items[selectedIndex];
				if (one && !one.active && !one.hasReferences) confirmingDelete = `act-${one.id}`;
				break;
			}
			default: {
				if (!action.startsWith('filter-')) break;
				const idx = parseInt(action.split('-')[1], 10) - 1;
				if (data.categories[idx]) toggleFilter(data.categories[idx].id);
				break;
			}
		}
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('tasks.activities.newActivity'),
		run: openNew,
		kbd: keyFor(ROOM, 'new')
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<FormError message={form?.message} />

	<RoomSurface dataTour="activity-list">
		{#snippet tools()}
			<FilterBar
				name="activities"
				on={narrowed || showArchived}
				summary={summary()}
				onclear={clearFilters}
			>
				{#snippet lead()}
					<SearchField
						bind:value={looking}
						oninput={() => (selectedIndex = 0)}
						label={t('tasks.activities.searchActivities')}
					/>
				{/snippet}
				{#snippet verb()}
					<StripVerb
						icon="sliders"
						label={t('tasks.activities.categories')}
						onclick={openCategories}
						aria-haspopup="dialog"
						data-tour="activity-categories"
					/>
				{/snippet}
				{#snippet count()}
					<!-- Held open at the count of every activity — see `.count-slot`. -->
					<ShowingCount
						total={data.activities.length}
						shown={shown.length}
						said={(count) => t('tasks.activities.showingCount', { count })}
					/>
				{/snippet}
				{#if data.categories.length > 0}
					<Picker
						values={chosenCategories}
						options={categoryChoices}
						onpickMany={pickCategories}
						label={t('ui.category')}
						class="min-w-40 flex-1 sm:flex-none"
					/>
				{/if}
				<!-- Named with its number, so a put-away activity is never quietly gone. -->
				<button
					type="button"
					onclick={toggleArchived}
					aria-pressed={showArchived}
					class="btn btn-sm shrink-0"
					hidden={putAway === 0 && !showArchived}
				>
					{t('todoRows.archivedCount', { count: putAway })}
				</button>
			</FilterBar>
		{/snippet}

		{#if shown.length === 0}
			{#if narrowed}
				<EmptyState
					filtered
					onclear={clearFilters}
					description={t('tasks.activities.noActivitiesMatchTheSelected')}
				/>
			{:else if showArchived}
				<EmptyState icon="archive" title={t('tasks.activities.nothingPutAway')} />
			{:else}
				<EmptyState
					icon="planner"
					title={t('tasks.activities.noActivitiesYet')}
					description={t('tasks.activities.anActivityIsANamed')}
				>
					{#snippet action()}
						<button onclick={openNew} class="btn btn-primary">
							<Icon name="plus" />
							{t('tasks.activities.newActivity')}
						</button>
					{/snippet}
				</EmptyState>
			{/if}
		{:else}
			<div class="divide-y divide-gray-200">
				{#each shown as activity, i (activity.id)}
					<div use:listCursor={i === selectedIndex} class="list-row" data-activity-id={activity.id}>
						<!-- One line whatever the row carries: the goals it counts toward
						     follow the category rather than adding a line under it, so a
						     row with a goal is the height of one without. -->
						<div class="list-row-main">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1 [&>p]:mt-0">
								<span class="text-sm font-medium text-gray-900">{activity.name}</span>
								<CategoryMark
									name={activity.categoryName ?? ''}
									color={catColor(activity.categoryId)}
								/>
								<Backlinks goals={data.goalLinks.activities[activity.id]} />
							</div>
							{#if activity.description}
								<p class="mt-0.5 truncate text-xs text-gray-500">{activity.description}</p>
							{/if}
						</div>

						<!-- Edit · put away · delete, the order every row in the app uses. -->
						<div class="list-row-actions">
							<button
								type="button"
								title={t('ui.edit')}
								aria-label={t('ui.edit')}
								onclick={() => openEdit(activity.id)}
								class="icon-btn"
							>
								<Icon name="edit" />
							</button>
							<form id="archive-{activity.id}" method="post" action="?/toggleActive" use:enhance>
								<input type="hidden" name="id" value={activity.id} />
								<button
									type="submit"
									class="icon-btn"
									title={activity.active
										? t('finance.ledgers.putItAway')
										: t('todoRows.takeItBackOut')}
									aria-label={activity.active
										? t('finance.ledgers.putItAway')
										: t('todoRows.takeItBackOut')}
								>
									<Icon name={activity.active ? 'archive' : 'undo'} />
								</button>
							</form>
							{#if !activity.active}
								{#if confirmingDelete === `act-${activity.id}`}
									<form
										data-leaves
										method="post"
										action="?/delete"
										use:enhance={() => {
											return async ({ update }) => {
												await update({ reset: false });
												confirmingDelete = null;
											};
										}}
									>
										<input type="hidden" name="id" value={activity.id} />
										<button type="submit" class="btn btn-sm btn-danger" use:armed>
											{t('tasks.activities.confirm')}
										</button>
									</form>
									<button
										type="button"
										onclick={() => (confirmingDelete = null)}
										class="btn btn-sm"
									>
										{t('ui.cancel')}
									</button>
								{:else}
									<!-- Held in place when history names it, so the column stays
									     put: that one can only be put away, never deleted. -->
									<button
										type="button"
										onclick={() => (confirmingDelete = `act-${activity.id}`)}
										class="icon-btn icon-btn-danger {activity.hasReferences ? 'invisible' : ''}"
										inert={activity.hasReferences}
										title={t('tasks.activities.deleteActivity')}
										aria-label={t('tasks.activities.deleteActivity')}
									>
										<Icon name="trash" />
									</button>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</RoomSurface>
</div>

<Modal bind:open={showCategoryForm} error={form?.message} title={t('tasks.activities.categories')}>
	<div class="divide-y divide-gray-200 border-b border-gray-200">
		{#each data.categories as cat (cat.id)}
			<div class="flex items-center gap-3 py-2">
				{#if editingCategoryId === cat.id}
					<form
						method="post"
						action="?/updateCategory"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: false });
								editingCategoryId = null;
							};
						}}
						class="flex flex-1 items-center gap-2"
					>
						<input type="hidden" name="id" value={cat.id} />
						<ColorWell name="color" value={cat.color} label={t('tasks.activities.colour')} />
						<OneLine
							name="label"
							value={cat.name}
							class="input input-sm min-w-0 flex-1"
							required
							autofocus
						/>
						<button type="submit" class="icon-btn" title={t('ui.save')} aria-label={t('ui.save')}>
							<Icon name="check" />
						</button>
						<button
							type="button"
							onclick={() => (editingCategoryId = null)}
							class="icon-btn"
							title={t('ui.cancel')}
							aria-label={t('ui.cancel')}
						>
							<Icon name="close" />
						</button>
					</form>
				{:else}
					<span class="min-w-0 flex-1"><CategoryMark name={cat.name} color={cat.color} /></span>
					{#if confirmingDelete === `cat-${cat.id}`}
						<form
							method="post"
							action="?/deleteCategory"
							use:enhance={() => {
								return async ({ update }) => {
									await update({ reset: false });
									confirmingDelete = null;
								};
							}}
						>
							<input type="hidden" name="id" value={cat.id} />
							<button type="submit" class="btn btn-sm btn-danger" use:armed>
								{t('tasks.activities.confirm')}
							</button>
						</form>
						<button type="button" onclick={() => (confirmingDelete = null)} class="btn btn-sm">
							{t('ui.cancel')}
						</button>
					{:else}
						<button
							type="button"
							title={t('ui.edit')}
							aria-label={t('ui.edit')}
							onclick={() => (editingCategoryId = cat.id)}
							class="icon-btn"
						>
							<Icon name="edit" />
						</button>
						<button
							type="button"
							title={t('ui.delete')}
							aria-label={t('ui.delete')}
							onclick={() => (confirmingDelete = `cat-${cat.id}`)}
							class="icon-btn icon-btn-danger"
						>
							<Icon name="trash" />
						</button>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
	<form
		method="post"
		action="?/createCategory"
		use:enhance={() => {
			return async ({ update }) => {
				await update();
				newCatColor = CATEGORY_DEFAULT_NEW;
			};
		}}
		class="mt-3 flex items-center gap-2"
	>
		<ColorWell name="color" bind:value={newCatColor} label={t('tasks.activities.colour')} />
		<OneLine
			name="label"
			placeholder={t('tasks.activities.newCategoryName')}
			class="input input-sm min-w-0 flex-1"
			required
		/>
		<button
			type="submit"
			class="btn btn-sm btn-primary shrink-0"
			title={t('ui.add')}
			aria-label={t('ui.add')}
		>
			<Icon name="plus" />
		</button>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showCategoryForm = false)}
			>{t('ui.done')}</button
		>
	{/snippet}
</Modal>

<Modal
	bind:open={showForm}
	error={form?.message}
	title={editingId ? t('tasks.activities.editActivity') : t('tasks.plan.newActivity')}
	onclose={() => (editingId = null)}
	size="sm"
>
	{@const editing = editingId ? data.activities.find((a) => a.id === editingId) : null}
	<form
		id="activity-form"
		method="post"
		action={editingId ? '?/update' : '?/create'}
		use:enhance={() => {
			return async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') {
					showForm = false;
					editingId = null;
				}
			};
		}}
	>
		{#if editingId}
			<input type="hidden" name="id" value={editingId} />
		{/if}

		<FormGrid>
			<Field label={t('ui.name')} span={12} required>
				<OneLine
					id="activity-name"
					name="label"
					value={editing?.name ?? ''}
					class="input"
					required
					autofocus
				/>
			</Field>

			<Field label={t('ui.category')} span={12} required>
				<select name="categoryId" required class="select">
					{#each data.categories as cat (cat.id)}
						<option value={cat.id} selected={editing?.categoryId === cat.id}>{cat.name}</option>
					{/each}
				</select>
			</Field>

			<Field label={t('ui.description')} span={12}>
				<OneLine name="description" value={editing?.description ?? ''} class="input" />
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="activity-form" class="btn btn-primary">
			{editingId ? t('ui.save') : t('tasks.activities.createActivity')}
		</button>
	{/snippet}
</Modal>
