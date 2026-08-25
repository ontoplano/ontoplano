<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import { CATEGORY_FALLBACK_COLOR, CATEGORY_DEFAULT_NEW } from '$lib/colors.js';
	import { getAction } from '$lib/shortcuts';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let selectedIndex = $state(0);
	let activeFilters: Set<number> = $state(new Set());
	let showCategoryForm = $state(false);
	let editingCategoryId: number | null = $state(null);
	let newCatColor = $state(CATEGORY_DEFAULT_NEW);
	let confirmingDelete: string | null = $state(null);

	function catColor(catId: number | null): string {
		if (!catId) return CATEGORY_FALLBACK_COLOR;
		const cat = data.categories?.find((c: { id: number }) => c.id === catId);
		return cat?.color ?? CATEGORY_FALLBACK_COLOR;
	}

	function filteredActivities() {
		if (activeFilters.size === 0) return data.activities;
		return data.activities.filter((a: { categoryId: number }) => activeFilters.has(a.categoryId));
	}

	function toggleFilter(catId: number) {
		const next = new Set(activeFilters);
		if (next.has(catId)) next.delete(catId);
		else next.add(catId);
		activeFilters = next;
		selectedIndex = 0;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			showForm = false;
			editingId = null;
			showCategoryForm = false;
			editingCategoryId = null;
			confirmingDelete = null;
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const items = filteredActivities();
		const action = getAction('/planner/activities', e.key);
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
				showForm = true;
				editingId = null;
				tick().then(() => {
					const nameInput = document.querySelector<HTMLInputElement>('#activity-name');
					nameInput?.focus();
				});
				break;
			default: {
				if (!action.startsWith('filter-')) break;
				const idx = parseInt(action.split('-')[1], 10) - 1;
				if (data.categories[idx]) {
					toggleFilter(data.categories[idx].id);
				}
				break;
			}
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-end gap-2">
		<button
			onclick={() => {
				showCategoryForm = !showCategoryForm;
				editingCategoryId = null;
				if (showCategoryForm) {
					newCatColor = CATEGORY_DEFAULT_NEW;
				}
			}}
			class="btn btn-sm"
		>
			{showCategoryForm ? 'Hide Categories' : 'Manage Categories'}
		</button>
		<button
			onclick={() => {
				showForm = !showForm;
				editingId = null;
				if (!showForm) return;
				tick().then(() => {
					const nameInput = document.querySelector<HTMLInputElement>('#activity-name');
					nameInput?.focus();
				});
			}}
			class="btn btn-primary btn-sm"
		>
			New activity
		</button>
	</div>

	<Modal bind:open={showCategoryForm} error={form?.message} title="Categories" size="sm">
		<div class="space-y-3">
			<div class="divide-y divide-gray-100">
				{#each data.categories as cat (cat.id)}
					<div class="flex items-center gap-3 py-2">
						{#if editingCategoryId === cat.id}
							<form
								method="post"
								action="?/updateCategory"
								use:enhance={() => {
									return async ({ update }) => {
										await update();
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
									class="h-8 w-10 cursor-pointer border border-gray-300"
								/>
								<input
									name="name"
									type="text"
									autocomplete="off"
									value={cat.name}
									required
									class="flex-1 border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								/>
								<button
									type="submit"
									class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:bg-gray-50"
								>
									Save
								</button>
								<button
									type="button"
									onclick={() => (editingCategoryId = null)}
									class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
								>
									Cancel
								</button>
							</form>
						{:else}
							<span
								class="inline-block h-4 w-4 shrink-0 border border-gray-200"
								style="background-color: {cat.color}"
							></span>
							<span class="flex-1 text-sm text-gray-900">{cat.name}</span>
							<button
								onclick={() => (editingCategoryId = cat.id)}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
							>
								<Icon name="edit" /> Edit
							</button>
							{#if confirmingDelete === `cat-${cat.id}`}
								<form
									method="post"
									action="?/deleteCategory"
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											confirmingDelete = null;
										};
									}}
								>
									<input type="hidden" name="id" value={cat.id} />
									<button
										type="submit"
										class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
										use:armed
									>
										Confirm?
									</button>
								</form>
								<button
									type="button"
									onclick={() => {
										confirmingDelete = null;
									}}
									class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
								>
									Cancel
								</button>
							{:else}
								<button
									type="button"
									onclick={() => {
										confirmingDelete = `cat-${cat.id}`;
									}}
									class="btn btn-danger btn-sm"
								>
									<Icon name="trash" /> Delete
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
				class="flex items-center gap-2 border-t border-gray-100 pt-3"
			>
				<input
					name="color"
					type="color"
					bind:value={newCatColor}
					class="h-8 w-10 cursor-pointer border border-gray-300"
				/>
				<input
					name="name"
					type="text"
					autocomplete="off"
					placeholder="New category name"
					required
					class="flex-1 border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
				<button type="submit" class="btn btn-primary btn-sm">Add</button>
			</form>
		</div>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showCategoryForm = false)}>Done</button>
		{/snippet}
	</Modal>

	<div class="flex gap-2">
		{#each data.categories as cat}
			<button
				onclick={() => toggleFilter(cat.id)}
				class="border px-2 py-1 text-xs font-medium transition {activeFilters.has(cat.id)
					? 'border-2 bg-white'
					: 'border-gray-200 bg-white text-gray-400 hover:text-gray-600'}"
				style={activeFilters.has(cat.id) ? `border-color: ${cat.color}; color: ${cat.color}` : ''}
			>
				{cat.name}
			</button>
		{/each}
		{#if activeFilters.size > 0}
			<button
				onclick={() => {
					activeFilters = new Set();
					selectedIndex = 0;
				}}
				class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-400 transition hover:text-gray-600"
			>
				clear
			</button>
		{/if}
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? 'Edit activity' : 'New activity'}
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
					await update();
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
				<Field label="Name" span={12} required>
					<input
						name="name"
						type="text"
						autocomplete="off"
						required
						value={editing?.name ?? ''}
						class="input"
					/>
				</Field>

				<Field label="Category" span={12} required>
					<select name="categoryId" required class="select">
						{#each data.categories as cat (cat.id)}
							<option value={cat.id} selected={editing?.categoryId === cat.id}>{cat.name}</option>
						{/each}
					</select>
				</Field>

				<Field label="Description" span={12}>
					<input
						name="description"
						type="text"
						autocomplete="off"
						value={editing?.description ?? ''}
						class="input"
					/>
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
			<button type="submit" form="activity-form" class="btn btn-primary">
				{editingId ? 'Save' : 'Create activity'}
			</button>
		{/snippet}
	</Modal>

	{#if filteredActivities().length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{#if activeFilters.size > 0}
				No activities match the selected filters.
			{:else}
				<EmptyState
					icon="planner"
					title="No activities yet"
					description="An activity is a named thing you do — gym, Russian, deep work. Blocks on the grid point at these."
				>
					{#snippet action()}
						<button onclick={() => (showForm = true)} class="btn btn-primary">
							<Icon name="plus" /> New activity
						</button>
					{/snippet}
				</EmptyState>
			{/if}
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card">
			{#each filteredActivities() as activity, i}
				<div
					class="flex items-center gap-4 px-4 py-3 transition-colors {i === selectedIndex
						? 'ring-2 ring-gray-900 ring-inset'
						: ''} {!activity.active ? 'opacity-50' : ''}"
					style="border-left: 4px solid {catColor(activity.categoryId)}"
				>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium text-gray-900">{activity.name}</span>
							<span class="text-xs font-medium" style="color: {catColor(activity.categoryId)}"
								>{activity.categoryName}</span
							>
						</div>
						{#if activity.description}
							<p class="truncate text-xs text-gray-500">{activity.description}</p>
						{/if}
					</div>

					<div class="flex shrink-0 items-center gap-2">
						<button
							onclick={() => {
								editingId = activity.id;
								showForm = true;
								tick().then(() => {
									const nameInput = document.querySelector<HTMLInputElement>('input[name="name"]');
									nameInput?.focus();
								});
							}}
							class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
						>
							<Icon name="edit" /> Edit
						</button>
						<form method="post" action="?/toggleActive" use:enhance>
							<input type="hidden" name="id" value={activity.id} />
							<input type="hidden" name="active" value={String(activity.active)} />
							<button
								type="submit"
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
							>
								{activity.active ? 'Disable' : 'Enable'}
							</button>
						</form>
						{#if confirmingDelete === `act-${activity.id}` && !activity.hasReferences}
							<form
								method="post"
								action="?/delete"
								use:enhance={() => {
									return async ({ update }) => {
										await update();
										confirmingDelete = null;
									};
								}}
							>
								<input type="hidden" name="id" value={activity.id} />
								<button
									type="submit"
									class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
									use:armed
								>
									Confirm?
								</button>
							</form>
							<button
								type="button"
								onclick={() => {
									confirmingDelete = null;
								}}
								class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
							>
								Cancel
							</button>
						{:else}
							<button
								type="button"
								onclick={() => {
									if (!activity.hasReferences) confirmingDelete = `act-${activity.id}`;
								}}
								disabled={activity.hasReferences}
								class="border px-2 py-1 text-xs transition {activity.hasReferences
									? 'cursor-not-allowed border-gray-100 text-gray-300'
									: 'border-red-200 bg-white text-red-600 hover:bg-red-50'}"
								title={activity.hasReferences
									? 'Cannot delete: referenced by planner or history'
									: 'Delete activity'}
							>
								<Icon name="trash" /> Delete
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
