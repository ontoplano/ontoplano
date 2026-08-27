<script lang="ts">
	import { enhance } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { getAction } from '$lib/shortcuts';
	import { keepInView } from '$lib/actions/keep-in-view';
	import { formatMoney } from '$lib/money';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { flush, remember, restore, ticks, type Tick } from '$lib/offline-ticks.svelte';
	import { deleteLater, isLeaving } from '$lib/undo.svelte';
	import { untrack } from 'svelte';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let selectedIndex = $state(-1);
	let editingId: number | null = $state(null);
	let editName = $state('');
	let editShoppingCategoryId: number | null = $state(null);
	let editNotes = $state('');
	let editPrice = $state('');
	let filterType = $state<'all' | 'someday' | 'replenish'>('all');
	let newItemType = $state<'replenish' | 'someday'>('replenish');
	let showBought = $state(false);
	let showSnoozed = $state(false);
	let confirmingDelete: number | null = $state(null);
	let showCategories = $state(false);
	let addingCategory = $state(false);

	/**
	 * Confirm, then five seconds to change your mind.
	 *
	 * The dialog still asks — that is the deliberate half. This is the accident
	 * half: the row leaves the screen at once and the request waits, so Undo
	 * costs nothing because nothing has happened yet.
	 */
	const deferDelete =
		(id: number, name: string): SubmitFunction =>
		({ action, formData, cancel }) => {
			cancel();
			confirmingDelete = null;
			deleteLater(`item:${id}`, name, () => {
				// The header asks for the action's result rather than a redirect,
				// which is what `enhance` would have done had it submitted.
				void fetch(action, {
					method: 'POST',
					body: formData,
					headers: { 'x-sveltekit-action': 'true' }
				}).then(() => invalidateAll());
			});
		};

	/**
	 * Ticking things off in a shop, where there is no signal.
	 *
	 * The list is the one screen people use with no bars — a basement, a queue,
	 * a train — so it is cached, and what you tick while offline is remembered
	 * and sent when the phone finds a signal again. See `offline-ticks`.
	 */
	let online = $state(true);

	const tick =
		(action: Tick['action']): SubmitFunction =>
		({ formData, cancel }) => {
			if (online) return;

			const id = Number(formData.get('id'));
			cancel();
			remember({ id, action });
		};

	/** What the rows should look like once the pending ticks are applied. */
	const items = $derived(
		data.items.map((item) => {
			const waiting = ticks.pending.filter((t) => t.id === item.id);
			if (waiting.length === 0) return item;

			let { bought, snoozed } = item;
			for (const t of waiting) {
				if (t.action === 'toggleBought') bought = !bought;
				if (t.action === 'toggleSnoozed') snoozed = !snoozed;
				if (t.action === 'restock') bought = false;
			}
			return { ...item, bought, snoozed };
		})
	);

	$effect(() => {
		const send = async () => {
			if (ticks.pending.length > 0 && (await flush()) > 0) await invalidateAll();
		};
		const wentOnline = async () => {
			online = true;
			await send();
		};
		const wentOffline = () => (online = false);

		// `untrack`, because this reads and writes the very state the effect would
		// otherwise depend on: reading `ticks.pending` made it re-run after every
		// flush, re-register the listeners and send the queue again.
		untrack(() => {
			restore();
			online = navigator.onLine;
			// Anything waiting from a previous session goes now — but only if there
			// is something to send it over. Announcing "online" here is how a page
			// loaded in a basement decided it had a signal.
			if (online) void send();
		});

		window.addEventListener('online', wentOnline);
		window.addEventListener('offline', wentOffline);

		return () => {
			window.removeEventListener('online', wentOnline);
			window.removeEventListener('offline', wentOffline);
		};
	});

	/**
	 * What the list will cost, near enough.
	 *
	 * Only what is still to buy, only what has a price, and said as "about" —
	 * a total assembled from remembered prices is an estimate and pretending
	 * otherwise is how somebody gets a surprise at the till.
	 */
	const needed = $derived(items.filter((i) => !i.bought && !i.snoozed));
	const totalCents = $derived(needed.reduce((sum, i) => sum + (i.priceCents ?? 0), 0));
	const pricedCount = $derived(needed.filter((i) => i.priceCents !== null).length);

	let defaultShoppingCategoryId = $derived.by(() => {
		const otherCategory = data.shoppingCategories.find((category) => category.name === 'Other');
		return otherCategory?.id ?? data.shoppingCategories[0]?.id ?? null;
	});

	let filteredItems = $derived(
		items.filter((item) => {
			if (isLeaving(`item:${item.id}`)) return false;
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
		cancelEdit();
		newItemType = filterType === 'someday' ? 'someday' : 'replenish';
		editShoppingCategoryId = defaultShoppingCategoryId;
		showForm = true;
	}

	function startEdit(item: (typeof data.items)[0]) {
		editingId = item.id;
		editName = item.name;
		newItemType = item.type;
		editShoppingCategoryId = item.shoppingCategoryId;
		editNotes = item.notes ?? '';
		editPrice = item.priceCents === null ? '' : (item.priceCents / 100).toFixed(2);
		showForm = true;
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
		editShoppingCategoryId = null;
		editNotes = '';
		editPrice = '';
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
				Wishlist <kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">1</kbd>
			</button>
			<button
				onclick={() => (filterType = filterType === 'replenish' ? 'all' : 'replenish')}
				class="px-2 py-1 text-xs shadow-sm {filterType === 'replenish'
					? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
					: 'border border-gray-300 bg-white text-gray-700'}"
			>
				Inventory <kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">2</kbd>
			</button>
			<button
				onclick={() => (showBought = !showBought)}
				class="px-2 py-1 text-xs shadow-sm {showBought
					? 'border border-gray-400 bg-gray-100 text-gray-700'
					: 'border border-gray-300 bg-white text-gray-500'}"
			>
				{showBought ? 'Hide' : 'Show'} bought
				<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">b</kbd>
			</button>
			<button
				onclick={() => (showSnoozed = !showSnoozed)}
				class="px-2 py-1 text-xs shadow-sm {showSnoozed
					? 'border border-gray-400 bg-gray-100 text-gray-700'
					: 'border border-gray-300 bg-white text-gray-500'}"
			>
				{showSnoozed ? 'Hide' : 'Show'} snoozed
				<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">s</kbd>
			</button>
			<button onclick={() => (showCategories = true)} class="btn btn-sm">Categories</button>
			<button onclick={() => (showForm ? (showForm = false) : openCreateForm())} class="btn btn-sm">
				{showForm ? 'Cancel' : 'Add item'}
				<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">n</kbd>
			</button>
		</div>
	</div>

	{#if !online || ticks.pending.length > 0}
		<div class="border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
			{#if !online}
				No connection. This is the list as it was when you last had one —
			{/if}
			{#if ticks.pending.length > 0}
				{ticks.pending.length}
				{ticks.pending.length === 1 ? 'change is' : 'changes are'} waiting to be sent.
			{:else}
				what you tick will be sent when you are back.
			{/if}
		</div>
	{/if}

	{#if totalCents > 0}
		<p class="text-sm text-gray-500">
			About <span class="tabular font-medium text-gray-900"
				>{formatMoney(totalCents, data.currency)}</span
			>
			for what is still to buy
			{#if pricedCount < needed.length}
				<span class="text-xs text-gray-500">
					· {needed.length - pricedCount} of them have no price yet
				</span>
			{/if}
		</p>
	{/if}

	<FormError message={form?.message} />

	<!-- Adding something already on the list puts it back on it; say so, or the
	     row it changed is somewhere off screen and nothing appears to happen. -->
	{#if form?.notice}
		<div class="border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
			{form.notice}
		</div>
	{/if}

	<!-- Editing happens here too. It used to happen in the row: six controls
	     squeezed into a column a quarter of the screen wide, which is what a
	     modal is for. -->
	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? 'Edit item' : 'New item'}
		onclose={cancelEdit}
		size="sm"
	>
		<form
			id="item-form"
			method="POST"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				return async ({ update, result }) => {
					await update({ reset: result.type === 'success' });
					if (result.type === 'success') {
						showForm = false;
						cancelEdit();
					}
				};
			}}
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}
			<FormGrid>
				<Field label="Item" span={8} required>
					<input
						name="name"
						type="text"
						autocomplete="off"
						required
						bind:value={editName}
						class="input"
					/>
				</Field>

				<Field label="List" span={4}>
					<select name="type" required bind:value={newItemType} class="select">
						<option value="replenish">Inventory</option>
						<option value="someday">Wishlist</option>
					</select>
				</Field>

				{#if newItemType === 'replenish'}
					<Field label="Category" span={12}>
						<select name="shoppingCategoryId" bind:value={editShoppingCategoryId} class="select">
							{#each data.shoppingCategories as category (category.id)}
								<option value={category.id}>{category.name}</option>
							{/each}
						</select>
					</Field>
				{/if}

				<Field label="Notes" span={8}>
					<input name="notes" type="text" autocomplete="off" bind:value={editNotes} class="input" />
				</Field>

				<!-- What it costs, roughly. Prices move and shops disagree, which is
				     why the list says "about" and never claims a receipt. -->
				<Field label="About" span={4} hint="What it usually costs.">
					<input
						name="price"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						bind:value={editPrice}
						class="input"
					/>
				</Field>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
			<button type="submit" form="item-form" class="btn btn-primary">
				{editingId ? 'Save' : 'Add item'}
			</button>
		{/snippet}
	</Modal>

	{#if replenishItems.length > 0}
		<div>
			<h2 class="mb-2 text-sm font-bold text-gray-500">Inventory</h2>
			<!--
				One category per card, flowing into columns.

				As one tall list this was a metre of scrolling with a name at the left
				edge and its buttons a screen-width away at the right. Columns rather
				than a grid because the categories are of wildly different lengths and
				a grid would leave a row as tall as its longest cell.
			-->
			<div class="gap-4 lg:columns-2 xl:columns-3 2xl:columns-4">
				{#each replenishByCategory as category (category.name)}
					<section class="mb-4 break-inside-avoid border border-gray-200 bg-white shadow-card">
						<h3 class="eyebrow border-b border-gray-200 px-4 py-2 text-gray-500">
							{category.name}
						</h3>
						<div class="divide-y divide-gray-200">
							{#each category.items as item (item.id)}
								{@const globalIdx = filteredItems.indexOf(item)}
								<div
									use:keepInView={globalIdx === selectedIndex}
									class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 {item.snoozed
										? 'bg-gray-50 opacity-50'
										: item.bought
											? 'bg-blue-50'
											: 'bg-red-50'} {globalIdx === selectedIndex
										? 'ring-2 ring-gray-400 ring-inset'
										: ''}"
								>
									<div class="min-w-0 flex-1">
										<span class="text-sm text-gray-900">{item.name}</span>
										{#if item.notes}
											<span class="ml-2 text-xs text-gray-500">{item.notes}</span>
										{/if}
									</div>
									{#if item.snoozed}
										<form
											method="POST"
											action="?/toggleSnoozed"
											use:enhance={tick('toggleSnoozed')}
										>
											<input type="hidden" name="id" value={item.id} />
											<button
												type="submit"
												class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm hover:bg-gray-50"
											>
												Unshelve
											</button>
										</form>
									{:else if item.bought}
										<form method="POST" action="?/restock" use:enhance={tick('restock')}>
											<input type="hidden" name="id" value={item.id} />
											<button
												type="submit"
												class="border border-orange-200 bg-white px-2 py-1 text-xs text-orange-600 shadow-sm hover:bg-orange-50"
											>
												Need to buy
											</button>
										</form>
									{:else}
										<form method="POST" action="?/toggleBought" use:enhance={tick('toggleBought')}>
											<input type="hidden" name="id" value={item.id} />
											<button
												type="submit"
												class="border border-blue-200 bg-white px-2 py-1 text-xs text-blue-600 shadow-sm hover:bg-blue-50"
											>
												Got it
											</button>
										</form>
										<form
											method="POST"
											action="?/toggleSnoozed"
											use:enhance={tick('toggleSnoozed')}
										>
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
										class="text-gray-500 hover:text-gray-700"
										title="Edit"
										aria-label="Edit {item.name}"><Icon name="edit" /></button
									>
									{#if confirmingDelete === item.id}
										<form
											method="POST"
											action="?/delete"
											use:enhance={deferDelete(item.id, item.name)}
										>
											<input type="hidden" name="id" value={item.id} />
											<button
												type="submit"
												class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
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
												confirmingDelete = item.id;
											}}
											class="text-gray-500 hover:text-red-500"
											title="Delete"
											aria-label="Delete {item.name}"><Icon name="trash" /></button
										>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		</div>
	{/if}

	{#if somedayItems.length > 0}
		<div>
			<h2 class="mb-2 text-sm font-bold text-gray-500">Wishlist</h2>
			<!-- The same column width as a category, so the two halves of the page
			     line up instead of one running the full width of the screen. -->
			<div
				class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card lg:w-1/2 xl:w-1/3 2xl:w-1/4"
			>
				{#each somedayItems as item (item.id)}
					{@const globalIdx = filteredItems.indexOf(item)}
					<div
						use:keepInView={globalIdx === selectedIndex}
						class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 {globalIdx ===
						selectedIndex
							? 'bg-gray-50'
							: ''} {item.snoozed ? 'opacity-50' : ''}"
					>
						{#if item.snoozed}
							<div class="min-w-0 flex-1">
								<span class="text-sm text-gray-900">{item.name}</span>
								{#if item.notes}
									<span class="ml-2 text-xs text-gray-500">{item.notes}</span>
								{/if}
							</div>
							<form method="POST" action="?/toggleSnoozed" use:enhance={tick('toggleSnoozed')}>
								<input type="hidden" name="id" value={item.id} />
								<button
									type="submit"
									class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm hover:bg-gray-50"
								>
									Unshelve
								</button>
							</form>
						{:else}
							<form method="POST" action="?/toggleBought" use:enhance={tick('toggleBought')}>
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
									class="text-sm {item.bought ? 'text-gray-500 line-through' : 'text-gray-900'}"
								>
									{item.name}
								</span>
								{#if item.notes}
									<span class="ml-2 text-xs text-gray-500">{item.notes}</span>
								{/if}
							</div>
							{#if !item.bought}
								<form method="POST" action="?/toggleSnoozed" use:enhance={tick('toggleSnoozed')}>
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
							class="text-gray-500 hover:text-gray-700"
							title="Edit"
							aria-label="Edit {item.name}"><Icon name="edit" /></button
						>
						{#if confirmingDelete === item.id}
							<form method="POST" action="?/delete" use:enhance={deferDelete(item.id, item.name)}>
								<input type="hidden" name="id" value={item.id} />
								<button
									type="submit"
									class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
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
									confirmingDelete = item.id;
								}}
								class="text-gray-500 hover:text-red-500"
								title="Delete"
								aria-label="Delete {item.name}"><Icon name="trash" /></button
							>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if filteredItems.length === 0}
		<div class="py-12 text-center text-sm text-gray-500">
			{#if items.length === 0}
				<EmptyState
					icon="shopping"
					title="The list is empty"
					description="Inventory is what you keep stocked; the wishlist is what you might buy one day."
				>
					{#snippet action()}
						<button onclick={() => (showForm = true)} class="btn btn-primary">
							<Icon name="plus" /> New item
						</button>
					{/snippet}
				</EmptyState>
			{:else}
				No items match the current filter.
			{/if}
		</div>
	{/if}
</div>

<!--
	Which categories hold food.

	The category decides what can be an ingredient, so this is the one screen
	that makes recipes work — and it is one tick per category, done once, not a
	label on every tin of tomatoes.
-->
<Modal
	bind:open={showCategories}
	error={form?.message}
	title="Categories"
	description="Tick the ones that hold food. Only those can be ingredients in a recipe."
	size="sm"
>
	<form
		id="categories-form"
		method="post"
		action="?/saveCategories"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') showCategories = false;
			}}
		class="space-y-3"
	>
		<ul class="space-y-1">
			{#each data.shoppingCategories as category (category.id)}
				<li>
					<label class="flex items-center gap-2 text-sm text-gray-900">
						<input type="checkbox" name="food" value={category.id} checked={category.isFood} />
						{category.name}
					</label>
				</li>
			{/each}
		</ul>
		<div class="mt-3 flex justify-end">
			<button
				type="submit"
				form="categories-form"
				class="btn btn-primary btn-sm"
				title="Save"
				aria-label="Save which categories hold food"><Icon name="check" /></button
			>
		</div>
	</form>

	<!-- Its own form and its own button, behind a disclosure: making a category
	     and saying which categories hold food are two acts, and one Save cannot
	     mean both. -->
	<div class="mt-4 border-t border-gray-200 pt-4">
		{#if !addingCategory}
			<button onclick={() => (addingCategory = true)} class="btn btn-sm">
				<Icon name="plus" /> New category
			</button>
		{/if}
	</div>

	{#if addingCategory}
		<form
			method="post"
			action="?/createCategory"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: result.type === 'success' });
					if (result.type === 'success') addingCategory = false;
				}}
			class="mt-2"
		>
			<label class="block">
				<span class="eyebrow text-gray-600">New category</span>
				<input name="name" required autocomplete="off" placeholder="Frozen" class="input mt-1" />
			</label>
			<div class="mt-2 flex flex-wrap items-center justify-between gap-2">
				<label class="flex items-center gap-2 text-sm text-gray-600">
					<input type="checkbox" name="isFood" value="true" />
					It holds food
				</label>
				<div class="flex items-center gap-2">
					<button type="button" class="btn btn-sm" onclick={() => (addingCategory = false)}>
						Cancel
					</button>
					<button class="btn btn-primary btn-sm" title="Add" aria-label="Add the category">
						<Icon name="plus" />
					</button>
				</div>
			</div>
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showCategories = false)}>Close</button>
	{/snippet}
</Modal>
