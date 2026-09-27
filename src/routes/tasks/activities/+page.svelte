<script lang="ts">
	import Backlinks from '$lib/components/Backlinks.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import StripVerb from '$lib/components/StripVerb.svelte';
	import Swatch from '$lib/components/Swatch.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Picker from '$lib/components/Picker.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
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
	import { pillStyle } from '$lib/pill-ink';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { keepInView } from '$lib/actions/keep-in-view';
	import { phoneWidth } from '$lib/breakpoints.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();
	const phone = phoneWidth();
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

	function catColor(catId: number | null): string {
		if (!catId) return CATEGORY_FALLBACK_COLOR;
		return data.categories.find((c) => c.id === catId)?.color ?? CATEGORY_FALLBACK_COLOR;
	}

	const narrowed = $derived(activeFilters.size > 0 || looking.trim() !== '');

	const shown = $derived.by(() => {
		const needle = looking.trim().toLowerCase();
		return data.activities.filter(
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
			<FilterBar name="activities" on={narrowed} summary={summary()} onclear={clearFilters}>
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
			</FilterBar>
		{/snippet}

		{#if shown.length === 0}
			{#if narrowed}
				<EmptyState
					icon="search"
					title={t('todoRows.nothingToShow')}
					description={t('tasks.activities.noActivitiesMatchTheSelected')}
				>
					{#snippet action()}
						<!-- On a phone the strip's own Clear is behind the filter sheet. -->
						{#if phone.current}
							<button type="button" class="btn btn-sm" onclick={clearFilters}>
								{t('filters.clear')}
							</button>
						{/if}
					{/snippet}
				</EmptyState>
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
					<div
						use:keepInView={i === selectedIndex}
						class="list-row {i === selectedIndex ? 'kbd-cursor' : ''}"
						data-activity-id={activity.id}
					>
						<div class="list-row-main {activity.active ? '' : 'opacity-60'}">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
								<span class="text-sm font-medium text-gray-900">{activity.name}</span>
								<span class="pill" style={pillStyle(catColor(activity.categoryId))}
									>{activity.categoryName}</span
								>
								{#if !activity.active}
									<span class="text-xs text-gray-600">{t('tasks.activities.disabled')}</span>
								{/if}
							</div>
							{#if activity.description}
								<p class="mt-0.5 truncate text-xs text-gray-500">{activity.description}</p>
							{/if}
							<Backlinks goals={data.goalLinks.activities[activity.id]} />
						</div>

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
							<!-- One glyph whichever way it is set, so the rail does not move;
							     the pressed surface and the word say which. -->
							<form method="post" action="?/toggleActive" use:enhance>
								<input type="hidden" name="id" value={activity.id} />
								<input type="hidden" name="active" value={String(activity.active)} />
								<button
									type="submit"
									class="icon-btn"
									aria-pressed={!activity.active}
									title={activity.active
										? t('tasks.activities.disable')
										: t('tasks.activities.enable')}
									aria-label={activity.active
										? t('tasks.activities.disable')
										: t('tasks.activities.enable')}
								>
									<Icon name="pause" />
								</button>
							</form>
							{#if confirmingDelete === `act-${activity.id}` && !activity.hasReferences}
								<form
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
								<button type="button" onclick={() => (confirmingDelete = null)} class="btn btn-sm">
									{t('ui.cancel')}
								</button>
							{:else}
								<button
									type="button"
									onclick={() => (confirmingDelete = `act-${activity.id}`)}
									disabled={activity.hasReferences}
									class="icon-btn icon-btn-danger"
									title={activity.hasReferences
										? t('tasks.activities.cannotDeleteReferencedByPlanner')
										: t('tasks.activities.deleteActivity')}
									aria-label={activity.hasReferences
										? t('tasks.activities.cannotDeleteReferencedByPlanner')
										: t('tasks.activities.deleteActivity')}
								>
									<Icon name="trash" />
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</RoomSurface>
</div>

<Modal bind:open={showCategoryForm} error={form?.message} title={t('tasks.activities.categories')}>
	<div class="divide-y divide-gray-200 border-y border-gray-200">
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
						<input
							name="color"
							type="color"
							value={cat.color}
							class="h-8 w-10 shrink-0 cursor-pointer border border-gray-300"
							aria-label={t('tasks.activities.colour')}
						/>
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
					<Swatch color={cat.color} shape="tall" />
					<span class="min-w-0 flex-1 truncate text-sm text-gray-900">{cat.name}</span>
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
		<input
			name="color"
			type="color"
			bind:value={newCatColor}
			class="h-8 w-10 shrink-0 cursor-pointer border border-gray-300"
			aria-label={t('tasks.activities.colour')}
		/>
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
