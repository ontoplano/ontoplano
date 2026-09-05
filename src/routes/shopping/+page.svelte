<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import BuyFields from '$lib/components/fields/BuyFields.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import { autofocus } from '$lib/actions/autofocus';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { getAction, keyFor } from '$lib/shortcuts';
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
	/** The item whose "what did you pay" box is open. */
	let pricing: number | null = $state(null);
	/** That box's own failure, so it cannot outlive the box. */
	let priceError: string | null = $state(null);

	function closePricing() {
		pricing = null;
		priceError = null;
	}
	let showCategories = $state(false);
	let addingCategory = $state(false);
	/** The category being renamed in place, and the one waiting on its delete. */
	let editingCategory = $state<number | null>(null);
	let confirmDeleteCategory = $state<number | null>(null);

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
			// A `<dialog>` closes itself on Escape; `preventDefault()` here cancels
			// that. Nothing on this page needs the key while one is open.
			if (document.querySelector('dialog[open]')) return;

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

<!--
	What you paid, asked afterwards.

	Never part of the tick: that happens in an aisle, one press, often offline.
	Prices are for when you are home with the bought list in front of you.
-->
<!--
	Why this is on the list.

	A recipe has always listed its ingredients; the ingredient had no idea it was
	one, so the shopping list could not answer "what do I need the olive oil for"
	— which is the question you have while deciding whether to buy more.
-->
{#snippet usedIn(item: { id: number })}
	{#if (data.usedIn[item.id] ?? []).length > 0}
		<span class="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
			<Icon name="utensils" size={12} class="text-gray-500" />
			{#each data.usedIn[item.id] as recipe, i (recipe.id)}
				<a
					href="{resolve('/kitchen/recipes')}/{recipe.id}"
					class="text-xs text-gray-500 hover:text-gray-900 hover:underline"
				>
					{recipe.title}{#if i < data.usedIn[item.id].length - 1}<span aria-hidden="true">,</span
						>{/if}
				</a>
			{/each}
		</span>
	{/if}
{/snippet}

<!--
	What this usually costs, beside the thing it costs.

	It was summed into the total at the top and rendered on no row, so editing
	an item's price looked exactly like an edit that had not saved — including
	after a reload, because there was nothing there to change.
-->
{#snippet expectedPrice(item: { priceCents: number | null })}
	{#if item.priceCents !== null}
		<span class="tabular ml-2 text-xs text-gray-500">
			{formatMoney(item.priceCents, data.currency)}
		</span>
	{/if}
{/snippet}

{#snippet paidPrompt(item: { id: number; name: string; bought: boolean })}
	{#if item.bought}
		{#if pricing === item.id}
			<!--
				Its own error, not the page's.

				`form.message` is whatever the last action said, and it outlives the
				thing that said it: a rejected price was still on screen when you next
				opened the edit dialog, attached to an item it had nothing to do with.
				A small form that can fail keeps its own failure.
			-->
			<form
				method="POST"
				action="?/paid"
				use:enhance={() => {
					return async ({ update, result }) => {
						// A failure stops here. Calling `update()` would also hand it to the
						// page's `form` prop, and the banner at the top of the list would
						// say the same thing a second time, next to a form it is not about.
						if (result.type === 'failure') {
							priceError = String(result.data?.message ?? 'Invalid price');
							return;
						}

						priceError = null;
						// It closes on success and is destroyed; resetting only makes the
						// fields blank for a frame first. On a failure it keeps what was typed.
						await update({ reset: false });
						if (result.type === 'success') pricing = null;
					};
				}}
				class="flex items-center gap-1"
			>
				<input type="hidden" name="id" value={item.id} />
				<input
					autocomplete="off"
					name="paid"
					inputmode="decimal"
					use:autofocus
					onkeydown={(e) => {
						// Escape closes it. There was no way out of this box at all.
						if (e.key === 'Escape') {
							e.preventDefault();
							closePricing();
						}
					}}
					placeholder="1.60"
					aria-label="What you paid for {item.name}"
					class="input w-20 px-2 py-1 text-xs"
				/>
				<button class="btn btn-sm" title="Save" aria-label="Save what you paid">
					<Icon name="check" size={14} />
				</button>
				<button
					type="button"
					class="btn btn-sm"
					onclick={closePricing}
					title="Cancel"
					aria-label="Cancel"
				>
					<Icon name="close" size={14} />
				</button>
				{#if priceError}
					<span class="text-xs text-red-600">{priceError}</span>
				{/if}
			</form>
		{:else}
			<button
				type="button"
				onclick={() => (pricing = item.id)}
				class="text-xs text-gray-500 hover:text-gray-900"
				title="Record what you paid"
			>
				Set price
			</button>
		{/if}
	{/if}
{/snippet}

<div class="space-y-4">
	<!-- The title does not shrink. A row of buttons that can wrap will squeeze a
	     heading into one word per line before it wraps itself, which is how
	     "Shopping List" became three lines on a phone. -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="shrink-0 text-lg font-bold text-gray-900">Shopping List</h1>
		<!--
			Six buttons of identical weight said everything here was equally worth
			pressing. They are three different kinds of thing, so they now look like
			three: which list you are in (one setting, one track), what it hides (two
			quiet toggles), and the one thing you came to do.
		-->
		<div class="flex flex-wrap items-center gap-2">
			<div class="seg" role="group" aria-label="Which list">
				<button onclick={() => (filterType = 'all')} aria-pressed={filterType === 'all'}>All</button
				>
				<button
					onclick={() => (filterType = filterType === 'replenish' ? 'all' : 'replenish')}
					aria-pressed={filterType === 'replenish'}
					title="Inventory ({keyFor('/shopping', 'filter-replenish')})">Inventory</button
				>
				<button
					onclick={() => (filterType = filterType === 'someday' ? 'all' : 'someday')}
					aria-pressed={filterType === 'someday'}
					title="Wishlist ({keyFor('/shopping', 'filter-someday')})">Wishlist</button
				>
			</div>

			<button
				onclick={() => (showBought = !showBought)}
				aria-pressed={showBought}
				class="btn btn-sm btn-quiet"
				title="Show what you already have ({keyFor('/shopping', 'toggle-show-bought')})"
			>
				{showBought ? 'Hide' : 'Show'} bought
			</button>
			<button
				onclick={() => (showSnoozed = !showSnoozed)}
				aria-pressed={showSnoozed}
				class="btn btn-sm btn-quiet"
				title="Show what you put off ({keyFor('/shopping', 'toggle-show-snoozed')})"
			>
				{showSnoozed ? 'Hide' : 'Show'} snoozed
			</button>
			<button onclick={() => (showCategories = true)} class="btn btn-sm btn-quiet"
				>Categories</button
			>
			<button
				onclick={() => (showForm ? (showForm = false) : openCreateForm())}
				class="btn btn-sm btn-primary"
				data-tour="shopping-new"
			>
				{showForm ? 'Cancel' : 'Add item'}
				<kbd class="border border-white/30 px-1">{keyFor('/shopping', 'new')}</kbd>
			</button>
		</div>
	</div>

	{#if !online || ticks.pending.length > 0}
		<Banner kind="warning">
			{#if !online}
				No connection. This is the list as it was when you last had one —
			{/if}
			{#if ticks.pending.length > 0}
				{ticks.pending.length}
				{ticks.pending.length === 1 ? 'change is' : 'changes are'} waiting to be sent.
			{:else}
				what you tick will be sent when you are back.
			{/if}
		</Banner>
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
		<Banner kind="info" message={form.notice} />
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
				<BuyFields
					bind:label={editName}
					bind:notes={editNotes}
					bind:price={editPrice}
					bind:type={newItemType}
					bind:shoppingCategoryId={editShoppingCategoryId}
					categories={data.shoppingCategories}
				/>
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
		<div data-tour="shopping-list">
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
								<!--
									Still to buy is the normal state of a shopping list, and a wash of
									alarm colour behind every row spends the one signal that should
									mean something is wrong. The unticked box already says it. Only
									what you have — blue — and what you put off — dimmed — are marked.
								-->
								<div
									use:keepInView={globalIdx === selectedIndex}
									class="flex items-center gap-x-3 px-4 py-2 {item.snoozed
										? 'bg-gray-50 opacity-50'
										: item.bought
											? 'bg-blue-50'
											: ''} {globalIdx === selectedIndex ? 'ring-2 ring-gray-400 ring-inset' : ''}"
								>
									<!--
										Whether you have it is a checkbox.

										It used to be two bordered buttons per row — "Got it" and
										"Not now" — sitting after the name in a wrapping flex, so
										their position moved with the length of whatever the item
										was called and a long note pushed them onto a second line.
										A checkbox is what "do you have this" already looks like
										everywhere else in this app and every list anybody has
										used, it is one control instead of two, and it puts the
										one thing you do forty times down the left edge where the
										thumb already is.
									-->
									<form method="POST" action="?/toggleBought" use:enhance={tick('toggleBought')}>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
											aria-pressed={item.bought}
											class="flex size-5 items-center justify-center border transition {item.bought
												? 'border-blue-600 bg-blue-600 text-white'
												: 'border-gray-400 bg-white text-transparent hover:border-gray-600'}"
											title={item.bought ? 'Put it back on the list' : 'Got it'}
											aria-label="{item.bought ? 'Put back on the list' : 'Got it'}: {item.name}"
										>
											<Icon name="check" size={14} />
										</button>
									</form>

									<div class="min-w-0 flex-1">
										<span class="text-sm text-gray-900">{item.name}</span>
										{#if item.notes}
											<span class="ml-2 text-xs text-gray-500">{item.notes}</span>
										{/if}
										{@render expectedPrice(item)}
										{@render usedIn(item)}
									</div>
									{@render paidPrompt(item)}

									<!-- Everything else at the right edge, same order, same x, every row. -->
									<div class="row-actions">
										<form
											method="POST"
											action="?/toggleSnoozed"
											use:enhance={tick('toggleSnoozed')}
										>
											<input type="hidden" name="id" value={item.id} />
											<button
												type="submit"
												class="icon-btn"
												aria-pressed={item.snoozed}
												title={item.snoozed ? 'Put it back on the list' : 'Not now'}
												aria-label="{item.snoozed ? 'Unshelve' : 'Snooze'}: {item.name}"
											>
												<Icon name={item.snoozed ? 'undo' : 'clock'} />
											</button>
										</form>
										<button
											onclick={() => startEdit(item)}
											class="icon-btn"
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
												<button type="submit" class="btn btn-sm btn-danger" use:armed>
													Confirm?
												</button>
											</form>
											<button
												type="button"
												onclick={() => {
													confirmingDelete = null;
												}}
												class="btn btn-sm"
											>
												Cancel
											</button>
										{:else}
											<button
												type="button"
												onclick={() => {
													confirmingDelete = item.id;
												}}
												class="icon-btn icon-btn-danger"
												title="Delete"
												aria-label="Delete {item.name}"><Icon name="trash" /></button
											>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		</div>
	{/if}

	{#if somedayItems.length > 0}
		<div data-tour="shopping-list">
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
						class="flex items-center gap-x-3 px-4 py-2 {globalIdx === selectedIndex
							? 'bg-gray-50'
							: ''} {item.snoozed ? 'opacity-50' : ''}"
					>
						<!-- The same checkbox as the inventory rows, so one list does not
						     have a different idea of what "have it" looks like. -->
						<form method="POST" action="?/toggleBought" use:enhance={tick('toggleBought')}>
							<input type="hidden" name="id" value={item.id} />
							<button
								type="submit"
								aria-pressed={item.bought}
								class="flex size-5 items-center justify-center border transition {item.bought
									? 'border-blue-600 bg-blue-600 text-white'
									: 'border-gray-400 bg-white text-transparent hover:border-gray-600'}"
								title={item.bought ? 'Put it back on the list' : 'Got it'}
								aria-label="{item.bought ? 'Put back on the list' : 'Got it'}: {item.name}"
							>
								<Icon name="check" size={14} />
							</button>
						</form>

						<div class="min-w-0 flex-1">
							<span class="text-sm {item.bought ? 'text-gray-500 line-through' : 'text-gray-900'}">
								{item.name}
							</span>
							{#if item.notes}
								<span class="ml-2 text-xs text-gray-500">{item.notes}</span>
							{/if}
							{@render expectedPrice(item)}
							{@render usedIn(item)}
						</div>
						{@render paidPrompt(item)}

						<div class="row-actions">
							<form method="POST" action="?/toggleSnoozed" use:enhance={tick('toggleSnoozed')}>
								<input type="hidden" name="id" value={item.id} />
								<button
									type="submit"
									class="icon-btn"
									aria-pressed={item.snoozed}
									title={item.snoozed ? 'Put it back on the list' : 'Not now'}
									aria-label="{item.snoozed ? 'Unshelve' : 'Snooze'}: {item.name}"
								>
									<Icon name={item.snoozed ? 'undo' : 'clock'} />
								</button>
							</form>
							<button
								onclick={() => startEdit(item)}
								class="icon-btn"
								title="Edit"
								aria-label="Edit {item.name}"><Icon name="edit" /></button
							>
							{#if confirmingDelete === item.id}
								<form method="POST" action="?/delete" use:enhance={deferDelete(item.id, item.name)}>
									<input type="hidden" name="id" value={item.id} />
									<button type="submit" class="btn btn-sm btn-danger" use:armed> Confirm? </button>
								</form>
								<button
									type="button"
									onclick={() => {
										confirmingDelete = null;
									}}
									class="btn btn-sm"
								>
									Cancel
								</button>
							{:else}
								<button
									type="button"
									onclick={() => {
										confirmingDelete = item.id;
									}}
									class="icon-btn icon-btn-danger"
									title="Delete"
									aria-label="Delete {item.name}"><Icon name="trash" /></button
								>
							{/if}
						</div>
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
	<!-- Every tick saves as it lands and every row manages itself — there is
	     nothing here a Save button would add, so Close only closes. -->
	<ul class="space-y-1">
		{#each data.shoppingCategories as category (category.id)}
			<li class="flex items-center gap-2 text-sm text-gray-900">
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
						<!-- svelte-ignore a11y_autofocus -->
						<input
							name="name"
							value={category.name}
							required
							autocomplete="off"
							autofocus
							class="input flex-1"
						/>
						<button class="btn btn-sm" title="Save the name" aria-label="Save the name">
							<Icon name="check" size={14} />
						</button>
						<button
							type="button"
							class="btn btn-sm"
							title="Keep the old name"
							aria-label="Keep the old name"
							onclick={() => (editingCategory = null)}
						>
							<Icon name="close" size={14} />
						</button>
					</form>
				{:else if !category.mine}
					<!-- A shelf shared into this list: fill it, tick it, but its
					     switches belong to whoever owns it. -->
					<span class="flex flex-1 items-center gap-2">
						{category.name}
						<span class="eyebrow text-gray-500">family</span>
					</span>
				{:else}
					<form
						method="post"
						action="?/setCategoryFood"
						use:enhance={() =>
							async ({ update }) => {
								await update({ reset: false });
							}}
						class="contents"
					>
						<input type="hidden" name="id" value={category.id} />
						<input type="hidden" name="isFood" value={category.isFood ? 'false' : 'true'} />
						<label class="flex flex-1 items-center gap-2">
							<input
								type="checkbox"
								checked={category.isFood}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>
							{category.name}
						</label>
					</form>
					{#if data.onFamilyPlan}
						<form
							method="post"
							action="?/setCategoryShared"
							use:enhance={() =>
								async ({ update }) => {
									await update({ reset: false });
								}}
							class="contents"
						>
							<input type="hidden" name="id" value={category.id} />
							<input
								type="hidden"
								name="shared"
								value={category.sharedWithFamily ? 'false' : 'true'}
							/>
							<label
								class="flex shrink-0 items-center gap-1 text-xs text-gray-500"
								title="Everybody on your family plan sees this section and can fill it"
							>
								<input
									type="checkbox"
									checked={category.sharedWithFamily}
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								/>
								Family
							</label>
						</form>
					{/if}
					{#if confirmDeleteCategory === category.id}
						<form
							method="post"
							action="?/deleteCategory"
							use:enhance={() =>
								async ({ update }) => {
									confirmDeleteCategory = null;
									await update({ reset: false });
								}}
							class="flex shrink-0 items-center gap-1"
						>
							<input type="hidden" name="id" value={category.id} />
							<button
								type="button"
								class="btn btn-sm"
								onclick={() => (confirmDeleteCategory = null)}
							>
								Keep
							</button>
							<!-- Its items stay, unfiled — the shelf label goes, not the shelf. -->
							<button class="btn btn-danger btn-sm" use:armed>Delete</button>
						</form>
					{:else}
						<button
							type="button"
							class="btn btn-sm shrink-0"
							title="Rename"
							aria-label="Rename {category.name}"
							onclick={() => (editingCategory = category.id)}
						>
							<Icon name="edit" size={14} />
						</button>
						<button
							type="button"
							class="btn btn-sm shrink-0"
							title="Delete"
							aria-label="Delete {category.name}"
							onclick={() => (confirmDeleteCategory = category.id)}
						>
							<Icon name="trash" size={14} />
						</button>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>

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
				<input name="label" required autocomplete="off" placeholder="Frozen" class="input mt-1" />
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
