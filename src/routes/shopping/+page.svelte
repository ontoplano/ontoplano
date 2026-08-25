<script lang="ts">
	import { enhance } from '$app/forms';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { autofocus } from '$lib/actions/autofocus.js';
	import { getAction } from '$lib/shortcuts';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let selectedIndex = $state(-1);
	let editingId: number | null = $state(null);
	let editName = $state('');
	let editType = $state('');
	let editShoppingCategoryId: number | null = $state(null);
	let editNotes = $state('');
	let filterType = $state<'all' | 'someday' | 'replenish'>('all');
	let newItemType = $state<'replenish' | 'someday'>('replenish');
	let showBought = $state(false);
	let showSnoozed = $state(false);
	let confirmingDelete: number | null = $state(null);

	let defaultShoppingCategoryId = $derived.by(() => {
		const otherCategory = data.shoppingCategories.find((category) => category.name === 'Other');
		return otherCategory?.id ?? data.shoppingCategories[0]?.id ?? null;
	});

	let filteredItems = $derived(
		data.items.filter((item) => {
			if (!showSnoozed && item.snoozed) return false;
			if (!showBought && item.bought && item.type === 'someday') return false;
			if (filterType === 'all') return true;
			return item.type === filterType;
		})
	);

	let somedayItems = $derived(filteredItems.filter((i) => i.type === 'someday'));
	let replenishItems = $derived(filteredItems.filter((i) => i.type === 'replenish'));
	let replenishByCategory = $derived.by(() => {
		const catOrder = new Map(data.shoppingCategories.map((c) => [c.name, c.sortOrder]));
		const grouped: Record<string, typeof replenishItems> = {};

		for (const item of replenishItems) {
			const catName = item.shoppingCategoryName ?? 'Other';
			if (!(catName in grouped)) grouped[catName] = [];
			grouped[catName].push(item);
		}

		return Object.entries(grouped)
			.sort((a, b) => (catOrder.get(a[0]) ?? 999) - (catOrder.get(b[0]) ?? 999))
			.map(([name, items]) => {
				const cat = data.shoppingCategories.find((c) => c.name === name);
				return { name, id: cat?.id ?? null, items };
			});
	});

	function openCreateForm() {
		newItemType = filterType === 'someday' ? 'someday' : 'replenish';
		showForm = true;
	}

	function startEdit(item: (typeof data.items)[0]) {
		editingId = item.id;
		editName = item.name;
		editType = item.type;
		editShoppingCategoryId = item.shoppingCategoryId;
		editNotes = item.notes ?? '';
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
		editType = '';
		editShoppingCategoryId = null;
		editNotes = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			showForm = false;
			cancelEdit();
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

		const items = filteredItems;
		const action = getAction('/shopping', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'navigate-down':
				selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
				confirmingDelete = null;
				break;
			case 'navigate-up':
				selectedIndex = Math.max(selectedIndex - 1, -1);
				confirmingDelete = null;
				break;
			case 'new':
				openCreateForm();
				break;
			case 'edit':
				if (items.length > 0 && selectedIndex >= 0) {
					startEdit(items[selectedIndex]);
				}
				break;
			case 'filter-someday':
				filterType = filterType === 'someday' ? 'all' : 'someday';
				break;
			case 'filter-replenish':
				filterType = filterType === 'replenish' ? 'all' : 'replenish';
				break;
			case 'toggle-show-bought':
				showBought = !showBought;
				break;
			case 'toggle-show-snoozed':
				showSnoozed = !showSnoozed;
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Shopping List</h1>
		<div class="flex flex-wrap items-center gap-2">
			<button
				onclick={() => (filterType = filterType === 'someday' ? 'all' : 'someday')}
				class="px-2 py-1 text-xs shadow-sm {filterType === 'someday'
					? 'border border-orange-200 bg-orange-50 text-orange-700'
					: 'border border-gray-300 bg-white text-gray-700'}"
			>
				Wishlist <kbd class="border border-gray-300 bg-gray-50 px-1">1</kbd>
			</button>
			<button
				onclick={() => (filterType = filterType === 'replenish' ? 'all' : 'replenish')}
				class="px-2 py-1 text-xs shadow-sm {filterType === 'replenish'
					? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
					: 'border border-gray-300 bg-white text-gray-700'}"
			>
				Inventory <kbd class="border border-gray-300 bg-gray-50 px-1">2</kbd>
			</button>
			<button
				onclick={() => (showBought = !showBought)}
				class="px-2 py-1 text-xs shadow-sm {showBought
					? 'border border-gray-400 bg-gray-100 text-gray-700'
					: 'border border-gray-300 bg-white text-gray-500'}"
			>
				{showBought ? 'Hide' : 'Show'} bought
				<kbd class="border border-gray-300 bg-gray-50 px-1">b</kbd>
			</button>
			<button
				onclick={() => (showSnoozed = !showSnoozed)}
				class="px-2 py-1 text-xs shadow-sm {showSnoozed
					? 'border border-gray-400 bg-gray-100 text-gray-700'
					: 'border border-gray-300 bg-white text-gray-500'}"
			>
				{showSnoozed ? 'Hide' : 'Show'} snoozed
				<kbd class="border border-gray-300 bg-gray-50 px-1">s</kbd>
			</button>
			<button
				onclick={() => (showForm ? (showForm = false) : openCreateForm())}
				class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
			>
				{showForm ? 'Cancel' : 'Add item'}
				<kbd class="border border-gray-300 bg-gray-50 px-1">n</kbd>
			</button>
		</div>
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	<Modal bind:open={showForm} title="New item" size="sm">
		<form
			id="item-form"
			method="POST"
			action="?/create"
			use:enhance={() => {
				return async ({ update, result }) => {
					await update();
					if (result.type === 'success') showForm = false;
				};
			}}
		>
			<FormGrid>
				<Field label="Item" span={8} required>
					<input name="name" type="text" autocomplete="off" required class="input" />
				</Field>

				<Field label="List" span={4}>
					<select name="type" required bind:value={newItemType} class="select">
						<option value="replenish">Inventory</option>
						<option value="someday">Wishlist</option>
					</select>
				</Field>

				{#if newItemType === 'replenish'}
					<Field label="Category" span={12}>
						<select name="shoppingCategoryId" class="select">
							{#each data.shoppingCategories as category (category.id)}
								<option value={category.id} selected={category.id === defaultShoppingCategoryId}>
									{category.name}
								</option>
							{/each}
						</select>
					</Field>
				{/if}

				<Field label="Notes" span={12}>
					<input name="notes" type="text" autocomplete="off" class="input" />
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
			<button type="submit" form="item-form" class="btn btn-primary">Add item</button>
		{/snippet}
	</Modal>

	{#if replenishItems.length > 0}
		<div>
			<h2 class="mb-2 text-sm font-bold text-gray-500">Inventory</h2>
			<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card">
				{#each replenishByCategory as category (category.name)}
					<h3 class="mt-3 mb-1 px-1 text-xs font-medium tracking-wide text-gray-400 uppercase">
						{category.name}
					</h3>
					{#each category.items as item (item.id)}
						{@const globalIdx = filteredItems.indexOf(item)}
						<div
							class="flex items-center gap-4 px-4 py-3 {item.snoozed
								? 'bg-gray-50 opacity-50'
								: item.bought
									? 'bg-blue-50'
									: 'bg-red-50'} {globalIdx === selectedIndex
								? 'ring-2 ring-gray-400 ring-inset'
								: ''}"
						>
							{#if editingId === item.id}
								<form
									method="POST"
									action="?/update"
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											cancelEdit();
										};
									}}
									use:autofocus
									class="flex flex-1 items-center gap-2"
								>
									<input type="hidden" name="id" value={item.id} />
									<input
										name="name"
										type="text"
										autocomplete="off"
										bind:value={editName}
										required
										class="flex-1 border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
									/>
									<select
										name="type"
										bind:value={editType}
										class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
									>
										<option value="replenish">Inventory</option>
										<option value="someday">Wishlist</option>
									</select>
									{#if editType === 'replenish'}
										<select
											name="shoppingCategoryId"
											bind:value={editShoppingCategoryId}
											class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
										>
											{#each data.shoppingCategories as categoryOption (categoryOption.id)}
												<option value={categoryOption.id}>{categoryOption.name}</option>
											{/each}
										</select>
									{/if}
									<input
										name="notes"
										type="text"
										autocomplete="off"
										bind:value={editNotes}
										placeholder="Notes"
										class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
									/>
									<button
										type="submit"
										class="bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-800"
									>
										Save
									</button>
									<button
										type="button"
										onclick={cancelEdit}
										class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
									>
										Cancel
									</button>
								</form>
							{:else}
								<div class="min-w-0 flex-1">
									<span class="text-sm text-gray-900">{item.name}</span>
									{#if item.notes}
										<span class="ml-2 text-xs text-gray-400">{item.notes}</span>
									{/if}
								</div>
								{#if item.snoozed}
									<form method="POST" action="?/toggleSnoozed" use:enhance>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
											class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm hover:bg-gray-50"
										>
											Unshelve
										</button>
									</form>
								{:else if item.bought}
									<form method="POST" action="?/restock" use:enhance>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
											class="border border-orange-200 bg-white px-2 py-1 text-xs text-orange-600 shadow-sm hover:bg-orange-50"
										>
											Need to buy
										</button>
									</form>
								{:else}
									<form method="POST" action="?/toggleBought" use:enhance>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
											class="border border-blue-200 bg-white px-2 py-1 text-xs text-blue-600 shadow-sm hover:bg-blue-50"
										>
											Got it
										</button>
									</form>
									<form method="POST" action="?/toggleSnoozed" use:enhance>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
											class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 shadow-sm hover:bg-gray-50"
										>
											Not now
										</button>
									</form>
								{/if}
								<button
									onclick={() => startEdit(item)}
									class="text-xs text-gray-400 hover:text-gray-700"
								>
									edit
								</button>
								{#if confirmingDelete === item.id}
									<form
										method="POST"
										action="?/delete"
										use:enhance={() => {
											return async ({ update }) => {
												await update();
												confirmingDelete = null;
											};
										}}
									>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
											class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
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
											confirmingDelete = item.id;
										}}
										class="text-xs text-gray-400 hover:text-red-500"
									>
										&times;
									</button>
								{/if}
							{/if}
						</div>
					{/each}
				{/each}
			</div>
		</div>
	{/if}

	{#if somedayItems.length > 0}
		<div>
			<h2 class="mb-2 text-sm font-bold text-gray-500">Wishlist</h2>
			<div class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card">
				{#each somedayItems as item, i (item.id)}
					{@const globalIdx = filteredItems.indexOf(item)}
					<div
						class="flex items-center gap-4 px-4 py-3 {globalIdx === selectedIndex
							? 'bg-gray-50'
							: ''} {item.snoozed ? 'opacity-50' : ''}"
					>
						{#if editingId === item.id}
							<form
								method="POST"
								action="?/update"
								use:enhance={() => {
									return async ({ update }) => {
										await update();
										cancelEdit();
									};
								}}
								use:autofocus
								class="flex flex-1 items-center gap-2"
							>
								<input type="hidden" name="id" value={item.id} />
								<input
									name="name"
									type="text"
									autocomplete="off"
									bind:value={editName}
									required
									class="flex-1 border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								/>
								<select
									name="type"
									bind:value={editType}
									class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								>
									<option value="replenish">Inventory</option>
									<option value="someday">Wishlist</option>
								</select>
								{#if editType === 'replenish'}
									<select
										name="shoppingCategoryId"
										bind:value={editShoppingCategoryId}
										class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
									>
										{#each data.shoppingCategories as categoryOption (categoryOption.id)}
											<option value={categoryOption.id}>{categoryOption.name}</option>
										{/each}
									</select>
								{/if}
								<input
									name="notes"
									type="text"
									autocomplete="off"
									bind:value={editNotes}
									placeholder="Notes"
									class="border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								/>
								<button
									type="submit"
									class="bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-800"
								>
									Save
								</button>
								<button
									type="button"
									onclick={cancelEdit}
									class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
								>
									Cancel
								</button>
							</form>
						{:else}
							{#if item.snoozed}
								<div class="min-w-0 flex-1">
									<span class="text-sm text-gray-900">{item.name}</span>
									{#if item.notes}
										<span class="ml-2 text-xs text-gray-400">{item.notes}</span>
									{/if}
								</div>
								<form method="POST" action="?/toggleSnoozed" use:enhance>
									<input type="hidden" name="id" value={item.id} />
									<button
										type="submit"
										class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm hover:bg-gray-50"
									>
										Unshelve
									</button>
								</form>
							{:else}
								<form method="POST" action="?/toggleBought" use:enhance>
									<input type="hidden" name="id" value={item.id} />
									<button
										type="submit"
										class="flex h-5 w-5 items-center justify-center border border-gray-300 bg-white shadow-sm hover:bg-gray-50 {item.bought
											? 'bg-gray-100'
											: ''}"
									>
										{#if item.bought}
											<span class="text-xs text-gray-600">&#10003;</span>
										{/if}
									</button>
								</form>
								<div class="min-w-0 flex-1">
									<span
										class="text-sm {item.bought ? 'text-gray-400 line-through' : 'text-gray-900'}"
									>
										{item.name}
									</span>
									{#if item.notes}
										<span class="ml-2 text-xs text-gray-400">{item.notes}</span>
									{/if}
								</div>
								{#if !item.bought}
									<form method="POST" action="?/toggleSnoozed" use:enhance>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
											class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 shadow-sm hover:bg-gray-50"
										>
											Not now
										</button>
									</form>
								{/if}
							{/if}
							<button
								onclick={() => startEdit(item)}
								class="text-xs text-gray-400 hover:text-gray-700"
							>
								edit
							</button>
							{#if confirmingDelete === item.id}
								<form
									method="POST"
									action="?/delete"
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											confirmingDelete = null;
										};
									}}
								>
									<input type="hidden" name="id" value={item.id} />
									<button
										type="submit"
										class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
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
										confirmingDelete = item.id;
									}}
									class="text-xs text-gray-400 hover:text-red-500"
								>
									&times;
								</button>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if filteredItems.length === 0}
		<div class="py-12 text-center text-sm text-gray-400">
			{#if data.items.length === 0}
				No items yet. Add something to buy.
			{:else}
				No items match the current filter.
			{/if}
		</div>
	{/if}
</div>
