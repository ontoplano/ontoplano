<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let selectedIndex = $state(0);

	const categoryColors: Record<string, string> = {
		duty: 'text-duty',
		skill: 'text-skill',
		money: 'text-money'
	};

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		switch (e.key) {
			case 'j':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, data.activities.length - 1);
				break;
			case 'k':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'n':
				e.preventDefault();
				showForm = true;
				editingId = null;
				break;
			case 'Escape':
				e.preventDefault();
				showForm = false;
				editingId = null;
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Activities</h1>
		<button
			onclick={() => {
				showForm = !showForm;
				editingId = null;
			}}
			class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
		>
			{showForm ? 'Cancel' : 'New Activity'}
		</button>
	</div>

	<div class="text-xs text-gray-400">
		<kbd class="border border-gray-300 bg-gray-50 px-1">j</kbd>/<kbd
			class="border border-gray-300 bg-gray-50 px-1">k</kbd
		>
		navigate &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">n</kbd> new &middot;
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

	{#if data.activities.length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			No activities yet. Create one to get started.
		</div>
	{:else}
		<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-sm">
			{#each data.activities as activity, i}
				<div
					class="flex items-center gap-4 px-4 py-3 transition-colors {i === selectedIndex
						? 'ring-2 ring-gray-900 ring-inset'
						: ''} {!activity.active ? 'opacity-50' : ''}"
				>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium text-gray-900">{activity.name}</span>
							<span
								class="text-xs font-medium {categoryColors[activity.categoryName ?? ''] ??
									'text-gray-400'}">{activity.categoryName}</span
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
								class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
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
