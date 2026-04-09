<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let selectedIndex = $state(0);
	let activeFilters: Set<number> = $state(new Set());
	let showCategoryForm = $state(false);
	let editingCategoryId: number | null = $state(null);
	let newCatColor = $state('#6b7280');

	function catColor(catId: number | null): string {
		if (!catId) return '#d1d5db';
		const cat = data.categories?.find((c: { id: number }) => c.id === catId);
		return cat?.color ?? '#d1d5db';
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
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const items = filteredActivities();

		switch (e.key) {
			case 'j':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
				break;
			case 'k':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case '1':
			case '2':
			case '3':
			case '4':
			case '5':
			case '6':
			case '7':
			case '8':
			case '9': {
				e.preventDefault();
				const idx = Number(e.key) - 1;
				if (data.categories[idx]) {
					toggleFilter(data.categories[idx].id);
				}
				break;
			}
			case 'n':
				e.preventDefault();
				showForm = true;
				editingId = null;
				tick().then(() => {
					const nameInput = document.querySelector<HTMLInputElement>('#activity-name');
					nameInput?.focus();
				});
				break;
			case 'Escape':
				e.preventDefault();
				showForm = false;
				editingId = null;
				showCategoryForm = false;
				editingCategoryId = null;
				break;
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
					newCatColor = '#6b7280';
				}
			}}
			class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
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
			class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
		>
			{showForm ? 'Cancel' : 'New Activity'}
		</button>
	</div>

	{#if showCategoryForm}
		<div class="space-y-3 border border-gray-200 bg-white p-4 shadow-sm">
			<div class="text-sm font-semibold text-gray-900">Categories</div>
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
								Edit
							</button>
							<form method="post" action="?/deleteCategory" use:enhance>
								<input type="hidden" name="id" value={cat.id} />
								<button
									type="submit"
									class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
								>
									Delete
								</button>
							</form>
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
						newCatColor = '#6b7280';
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
					placeholder="New category name"
					required
					class="flex-1 border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
				<button
					type="submit"
					class="bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800"
				>
					Add
				</button>
			</form>
		</div>
	{/if}

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

	<div class="text-xs text-gray-400">
		<kbd class="border border-gray-300 bg-gray-50 px-1">j</kbd>/<kbd
			class="border border-gray-300 bg-gray-50 px-1">k</kbd
		>
		navigate &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">n</kbd> new &middot;
		{#each data.categories as cat, i}
			<kbd class="border border-gray-300 bg-gray-50 px-1">{i + 1}</kbd>{' '}
		{/each}filter categories &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">Esc</kbd> close form
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if showForm}
		<form
			method="post"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				return async ({ update }) => {
					await update();
					showForm = false;
					editingId = null;
				};
			}}
			class="space-y-3 border border-gray-200 bg-white p-4 shadow-sm"
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}
			<div class="flex gap-3">
				<label class="flex-1">
					<span class="text-sm font-medium text-gray-700">Name</span>
					<input
						id="activity-name"
						name="name"
						type="text"
						required
						value={editingId ? (data.activities.find((a) => a.id === editingId)?.name ?? '') : ''}
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					/>
				</label>
				<label class="w-40">
					<span class="text-sm font-medium text-gray-700">Category</span>
					<select
						name="categoryId"
						required
						class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>
						{#each data.categories as cat}
							<option
								value={cat.id}
								selected={editingId
									? data.activities.find((a) => a.id === editingId)?.categoryId === cat.id
									: false}
							>
								{cat.name}
							</option>
						{/each}
					</select>
				</label>
			</div>
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Description</span>
				<input
					name="description"
					type="text"
					value={editingId
						? (data.activities.find((a) => a.id === editingId)?.description ?? '')
						: ''}
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<button
				type="submit"
				class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
			>
				{editingId ? 'Update' : 'Create'}
			</button>
		</form>
	{/if}

	{#if filteredActivities().length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{#if activeFilters.size > 0}
				No activities match the selected filters.
			{:else}
				No activities yet. Create one to get started.
			{/if}
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-sm">
			{#each filteredActivities() as activity, i}
				<div
					class="flex items-center gap-4 px-4 py-3 transition-colors {i === selectedIndex
						? 'ring-2 ring-gray-900 ring-inset'
						: ''} {!activity.active ? 'opacity-50' : ''}"
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
							Edit
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
						<form method="post" action="?/delete" use:enhance>
							<input type="hidden" name="id" value={activity.id} />
							<button
								type="submit"
								disabled={activity.hasReferences}
								class="border px-2 py-1 text-xs transition {activity.hasReferences
									? 'cursor-not-allowed border-gray-100 text-gray-300'
									: 'border-red-200 bg-white text-red-600 hover:bg-red-50'}"
								title={activity.hasReferences
									? 'Cannot delete: referenced by planner or history'
									: 'Delete activity'}
							>
								Delete
							</button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
