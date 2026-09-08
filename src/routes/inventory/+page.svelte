<script lang="ts">
	import { enhance } from '$app/forms';
	import OneLine from '$lib/components/OneLine.svelte';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import BuyFields from '$lib/components/fields/BuyFields.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import Field from '$lib/components/Field.svelte';
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
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { SvelteSet } from 'svelte/reactivity';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let selectedIndex = $state(-1);
	let editingId: number | null = $state(null);
	let editName = $state('');
	let editShoppingCategoryId: number | null = $state(null);
	let editNotes = $state('');
	let editPrice = $state('');
	/** Only asked when writing something down; an edit leaves it where it is. */
	let newLocationId = $state<number | null>(null);
	/** A count that changed, kept on screen until the page catches up. */
	const requantify =
		() =>
		async ({ update }: { update: (o?: object) => Promise<void> }) =>
			await update({ reset: false });

	/** The thing's own fields, while it is being edited. */
	let editFields = $state<[string, string][]>([]);
	let editIdealQty = $state('1');

	/**
	 * Which list, plus the one question this page exists to answer.
	 *
	 * "Short" is not a third list — it is a question asked of the things you
	 * restock: which of them do I have fewer of than I keep. That question had
	 * no button, so answering it meant reading every row's numbers.
	 */
	let filterType = $state<'all' | 'someday' | 'replenish' | 'short'>('all');
	let newItemType = $state<'replenish' | 'someday'>('replenish');
	let showBought = $state(false);
	let showSnoozed = $state(false);
	/** Which location is open. `null` is everything; `0` is the unfiled pile. */
	let location = $state<number | null>(null);
	/** A find box, because an inventory gets long in a way a list never did. */
	let find = $state('');
	/**
	 * Locations whose contents are folded away, kept between visits.
	 *
	 * A house with a room per drawer makes the panel taller than the things it
	 * is meant to help you find, and the branch you are not in is the one you
	 * want out of the way. Folded, not hidden: the row itself stays, with its
	 * number, so a fold never loses a location.
	 */
	const folded = new SvelteSet<number>();

	function toggleFold(id: number) {
		if (!folded.delete(id)) folded.add(id);
		if (browser) localStorage.setItem(FOLD_KEY, JSON.stringify([...folded]));
	}

	const FOLD_KEY = 'ontoplano:inventory-folded';

	onMount(() => {
		try {
			const stored = localStorage.getItem(FOLD_KEY);
			if (stored)
				for (const id of JSON.parse(stored) as number[]) {
					if (Number.isInteger(id)) folded.add(id);
				}
		} catch {
			// A browser that will not keep it is not a reason to fail to draw.
		}
	});
	let addingLocation = $state(false);
	let editingLocation = $state<{ id: number; name: string; parentId: number | null } | null>(null);
	let confirmDeleteLocation = $state<number | null>(null);
	/** The item being dragged, and the location it is over. */
	let dragging = $state<number | null>(null);
	let dragOver = $state<number | null>(null);
	let confirmingDelete: number | null = $state(null);
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

	/** Every location as "Living room › White chest", root down. */
	const locationPaths = $derived.by(() => {
		const byId = new Map(data.locations.map((l) => [l.id, l]));
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new Map<number, string>();
		for (const one of data.locations) {
			const chain: string[] = [];
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const seen = new Set<number>();
			let cur: number | null = one.id;
			while (cur != null && !seen.has(cur)) {
				seen.add(cur);
				const node = byId.get(cur);
				if (!node) break;
				chain.unshift(node.name);
				cur = node.parentId;
			}
			out.set(one.id, chain.join(' › '));
		}
		return out;
	});

	/** A location and everything under it: opening a room shows its drawers. */
	function subtreeOf(id: number): Set<number> {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const kids = new Map<number, number[]>();
		for (const l of data.locations) {
			if (l.parentId == null) continue;
			kids.set(l.parentId, [...(kids.get(l.parentId) ?? []), l.id]);
		}
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new Set<number>();
		const walk = (at: number) => {
			if (out.has(at)) return;
			out.add(at);
			for (const kid of kids.get(at) ?? []) walk(kid);
		};
		walk(id);
		return out;
	}

	const inLocation = $derived.by(() => {
		if (location === null) return null;
		if (location === 0) return null;
		return subtreeOf(location);
	});

	/**
	 * What the filters allow, wherever it happens to live.
	 *
	 * Split out from `filteredItems` because the panel's numbers must answer
	 * the filters but not the chosen location — counting each location against
	 * the chosen one would zero every location except it. This is also what the
	 * "not showing" line is measured against.
	 */
	let allowedItems = $derived(
		items.filter((item) => {
			if (isLeaving(`item:${item.id}`)) return false;
			if (!showSnoozed && item.snoozed) return false;
			if (!showBought && item.bought && item.type === 'someday') return false;
			const wanted = find.trim().toLowerCase();
			if (wanted && !`${item.name} ${item.notes ?? ''}`.toLowerCase().includes(wanted))
				return false;
			if (filterType === 'all') return true;
			// Short of it: fewer than you keep, and something you restock at all.
			if (filterType === 'short') return item.type === 'replenish' && item.qty < item.idealQty;
			return item.type === filterType;
		})
	);

	/** Does this thing belong to the location on screen? */
	function inChosenLocation(item: { locationId: number | null }): boolean {
		if (location === 0) return item.locationId == null;
		if (inLocation) return item.locationId != null && inLocation.has(item.locationId);
		return true;
	}

	let filteredItems = $derived(allowedItems.filter(inChosenLocation));

	/** How many things sit in each location's own subtree, for the panel. */
	/**
	 * How many things are in this location and everything inside it.
	 *
	 * A kitchen whose cabinet holds a thing has a thing in it — you would not
	 * say the kitchen is empty — so the number counts the subtree, which is
	 * also what opening the location shows. It is briefly confusing on the way
	 * down a branch, because a parent's number is larger than what is directly
	 * on its own shelf, so each row says which in its title rather than
	 * leaving somebody to work it out from the arithmetic.
	 */
	const countsByLocation = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const direct = new Map<number, number>();
		// What the filters allow, not everything there is: a drawer that said
		// "2" and then showed one thing when you opened it was answering a
		// different question from the one the click asked.
		for (const item of allowedItems) {
			if (item.locationId == null) continue;
			direct.set(item.locationId, (direct.get(item.locationId) ?? 0) + 1);
		}
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new Map<number, { here: number; total: number }>();
		for (const one of data.locations) {
			let total = 0;
			for (const id of subtreeOf(one.id)) total += direct.get(id) ?? 0;
			out.set(one.id, { here: direct.get(one.id) ?? 0, total });
		}
		return out;
	});

	/** "4 things, 1 here and 3 in what is inside it" — said, not inferred. */
	function countTitle(name: string, count: { here: number; total: number }): string {
		const things = (n: number) => `${n} ${n === 1 ? 'thing' : 'things'}`;
		if (count.total === 0) return `Nothing in ${name} yet`;
		if (count.total === count.here) return `${things(count.total)} in ${name}`;
		return `${things(count.total)} in ${name}: ${count.here} here and ${
			count.total - count.here
		} in what is inside it`;
	}
	const unfiledCount = $derived(allowedItems.filter((i) => i.locationId == null).length);

	/**
	 * How much of what is here the filters are keeping off the screen.
	 *
	 * Said once, under the filter buttons, rather than only when a list came
	 * out empty — a page showing three of eleven things is exactly as much of a
	 * half-truth as one showing none of two. The line is always in the layout
	 * and goes invisible rather than away, so switching a filter never moves
	 * what is under it.
	 */
	const notShowing = $derived(items.filter(inChosenLocation).length - filteredItems.length);

	/**
	 * The page follows a drag towards an edge.
	 *
	 * The panel is at the top and the lists run past the bottom of the screen,
	 * so on a phone a thing four screens down could be picked up and had
	 * nowhere to go: the browser scrolls a drag for you only in a few of them,
	 * and never far enough. While something is held, being within a band of
	 * either edge scrolls that way, faster the closer to it — which is the
	 * behaviour every file manager has and nobody has to be told about.
	 */
	const SCROLL_BAND = 90;
	let scrollTimer: ReturnType<typeof setInterval> | null = null;

	function scroller(): HTMLElement | Window {
		// The app's main area scrolls on a phone and the window scrolls on a
		// desktop, so the one that can move is the one that is asked to.
		const main = document.querySelector('main');
		if (main && main.scrollHeight > main.clientHeight + 4) return main;
		return window;
	}

	function followEdge(y: number) {
		const top = y;
		const bottom = window.innerHeight - y;
		let by = 0;
		if (top < SCROLL_BAND) by = -Math.ceil(((SCROLL_BAND - top) / SCROLL_BAND) * 24);
		else if (bottom < SCROLL_BAND) by = Math.ceil(((SCROLL_BAND - bottom) / SCROLL_BAND) * 24);

		if (by === 0) {
			stopFollowing();
			return;
		}
		if (scrollTimer) return;
		scrollTimer = setInterval(() => {
			const target = scroller();
			if (target instanceof Window) target.scrollBy(0, by);
			else target.scrollTop += by;
		}, 16);
	}

	function stopFollowing() {
		if (scrollTimer) clearInterval(scrollTimer);
		scrollTimer = null;
	}

	/**
	 * Dropping a thing on a location.
	 *
	 * Posted rather than held in state: the page is server-rendered and every
	 * other change here goes through a form action, so a drag that only moved
	 * a row on screen would be the one change that vanished on reload.
	 */
	async function drop(itemId: number, locationId: number | null) {
		const body = new FormData();
		body.set('id', String(itemId));
		body.set('locationId', locationId === null ? '' : String(locationId));
		await fetch('?/putItem', { method: 'POST', body });
		await invalidateAll();
	}

	let somedayItems = $derived(filteredItems.filter((i) => i.type === 'someday'));
	let replenishItems = $derived(filteredItems.filter((i) => i.type === 'replenish'));
	/** Items grouped into category cards, in the order the categories are kept. */
	function byCategory(list: typeof replenishItems) {
		const catOrder = new Map(data.shoppingCategories.map((c) => [c.name, c.sortOrder]));
		const grouped: Record<string, typeof replenishItems> = {};
		for (const item of list) {
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
	}

	/**
	 * Where first, then what kind.
	 *
	 * Standing in the kitchen and reading "4" told you there were four things
	 * under it and nothing about which was on the shelf, which was in the
	 * cabinet and which was in the drawer — and "Everything" was a wall of
	 * category cards with no idea of place in it at all. The location is the
	 * outer grouping now and the categories sit inside it, in the same order
	 * the panel lists them so the two read as one thing.
	 */
	const replenishByPlace = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const byLocation = new Map<number, typeof replenishItems>();
		for (const item of replenishItems) {
			const key = item.locationId ?? 0;
			byLocation.set(key, [...(byLocation.get(key) ?? []), item]);
		}

		// Depth-first through the tree, so the groups arrive in the order the
		// panel shows them rather than in whatever order the rows came back.
		const order: number[] = [];
		const walk = (nodes: PageServerData['locationTree']) => {
			for (const node of nodes) {
				order.push(node.id);
				walk(node.children);
			}
		};
		walk(data.locationTree);

		const groups = order
			.filter((id) => byLocation.has(id))
			.map((id) => ({
				id,
				label: locationPaths.get(id) ?? 'Somewhere',
				categories: byCategory(byLocation.get(id) ?? [])
			}));

		if (byLocation.has(0)) {
			groups.push({
				id: 0,
				label: 'Not filed anywhere',
				categories: byCategory(byLocation.get(0) ?? [])
			});
		}
		return groups;
	});

	/**
	 * Whether the place headings are worth drawing.
	 *
	 * Standing inside one drawer, every card is in that drawer and a heading
	 * saying so above each is a line repeating the panel.
	 */
	const showPlaces = $derived(replenishByPlace.length > 1);

	const locationChoices = $derived(
		data.locations.map((one) => ({ ...one, path: locationPaths.get(one.id) ?? one.name }))
	);

	function openCreateForm() {
		cancelEdit();
		editIdealQty = '1';
		// Standing in a drawer and adding something puts it in that drawer.
		newLocationId = location !== null && location !== 0 ? location : null;
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
		// One blank pair at the end, so adding a field is typing rather than
		// finding the button that lets you type.
		editFields = [...fieldsOf(item.attributes), ['', '']];
		// Where it lives, on the edit form too: a drag is the quick way and not
		// everybody's way, and on a phone it is not always the possible one.
		newLocationId = item.locationId;
		editIdealQty = String(item.idealQty ?? 1);
		showForm = true;
	}

	/** An item's own fields, as pairs, from the JSON they are stored as. */
	function fieldsOf(raw: string | null | undefined): [string, string][] {
		try {
			return Object.entries(JSON.parse(raw || '{}') as Record<string, string>);
		} catch {
			return [];
		}
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
		const action = getAction('/inventory', e.key);
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

<svelte:window
	onkeydown={handleKeydown}
	ondragover={(e) => dragging !== null && followEdge(e.clientY)}
	ondrop={stopFollowing}
	ondragend={stopFollowing}
/>

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
					href="{resolve('/health/recipes')}/{recipe.id}"
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

<!--
	The line under the name, and why it has a floor and no ceiling.
	
	Its height is reserved — `min-h` — so a thing gaining its first field or its
	first recipe does not make the card taller and push every row under it down
	the screen. It is not CLIPPED, which is what the first attempt at this did:
	one line of room for content that needed two cut the letters in half, and
	the control offered to un-cut them moved everything below when pressed,
	which is the thing the reservation exists to prevent. A row with a great
	deal on it is simply taller, once, when the data changes — not when
	somebody presses something.
	
	Nothing appears here on a press. The one thing that used to — a box for what
	you paid — is a field on the item's own form, where the rest of the item is:
	a price is not special enough to have earned a button of its own.
-->
{#snippet meta(item: { id: number; attributes?: string | null })}
	<span class="mt-0.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
		{@render usedIn(item)}
		{@render ownFields(item)}
	</span>
{/snippet}

<!--
	Recording what you paid, without the row moving to offer it.

	It used to appear beside the name the moment a count went above none, which
	made the card taller and pushed everything under it down — a press somewhere
	else moving the thing you were about to press. It is an icon in the row's
	own actions now, drawn on every row and only visible where it means
	something, so the space it needs is space the row always had.
-->
<!--
	One row of the house, and the drop target it doubles as.

	`dragover` has to be cancelled for a drop to be allowed at all, which is the
	one piece of HTML drag-and-drop nobody remembers. Touch has no equivalent —
	the row's own "where does it live" is the path there, and it is also the
	path for anybody not using a mouse.
-->
{#snippet locationRow(id: number | null, label: string, count: number, depth: number)}
	<li>
		<button
			onclick={() => (location = id)}
			ondragover={(e) => {
				if (dragging === null) return;
				e.preventDefault();
				dragOver = id ?? -1;
			}}
			ondragleave={() => (dragOver = null)}
			ondrop={(e) => {
				e.preventDefault();
				dragOver = null;
				if (dragging !== null) void drop(dragging, id === 0 ? null : id);
				dragging = null;
			}}
			class="flex w-full items-center gap-2 py-2 pr-3 text-left text-sm transition {location === id
				? 'bg-gray-100 font-medium text-gray-900'
				: 'text-gray-700 hover:bg-gray-50'} {dragOver === (id ?? -1)
				? 'ring-2 ring-gray-900 ring-inset'
				: ''}"
			style="padding-left: {0.25 + depth * 0.9}rem"
		>
			<!-- Where a foldable row keeps its chevron. Drawn on every row, so a
			     location gaining children never shifts any name sideways, and the
			     rows that can never fold still line up with the ones that can. -->
			<span class="invisible size-4 shrink-0"><Icon name="chevron-down" /></span>
			<span class="truncate">{label}</span>
			<span class="tabular ml-auto shrink-0 text-xs text-gray-500">{count}</span>
		</button>
	</li>
{/snippet}

<!--
	A location and everything under it.

	Foldable, because a house with a row per drawer makes the panel taller than
	the things it is meant to help you find. Folding hides what is inside a
	location, never the location itself, and its number still counts the whole
	subtree — so a folded branch says how much is in there without listing it.
-->
{#snippet branch(node: PageServerData['locationTree'][number], depth: number)}
	<li>
		<div
			class="group flex items-center {location === node.id ? 'bg-gray-100' : 'hover:bg-gray-50'}"
		>
			<!-- Its own control, outside the row button: pressing it must fold the
			     branch, not open the location. -->
			{#if node.children.length > 0}
				<button
					onclick={() => toggleFold(node.id)}
					class="shrink-0 py-2 pl-1 text-gray-400 transition hover:text-gray-700"
					style="margin-left: {depth * 0.9}rem"
					aria-expanded={!folded.has(node.id)}
					title={folded.has(node.id) ? `Show what is in ${node.name}` : `Fold ${node.name}`}
					aria-label={folded.has(node.id) ? `Show what is in ${node.name}` : `Fold ${node.name}`}
				>
					<Icon
						name="chevron-down"
						class="size-4 transition-transform {folded.has(node.id) ? '-rotate-90' : ''}"
					/>
				</button>
			{:else}
				<span class="invisible size-4 shrink-0 py-2 pl-1" style="margin-left: {depth * 0.9}rem"
				></span>
			{/if}
			<button
				onclick={() => (location = node.id)}
				ondragover={(e) => {
					if (dragging === null) return;
					e.preventDefault();
					dragOver = node.id;
				}}
				ondragleave={() => (dragOver = null)}
				ondrop={(e) => {
					e.preventDefault();
					dragOver = null;
					if (dragging !== null) void drop(dragging, node.id);
					dragging = null;
				}}
				class="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 pl-2 text-left text-sm transition {location ===
				node.id
					? 'font-medium text-gray-900'
					: 'text-gray-700'} {dragOver === node.id ? 'ring-2 ring-gray-900 ring-inset' : ''}"
			>
				<span class="truncate">{node.name}</span>
				<span
					class="tabular ml-auto shrink-0 text-xs text-gray-500"
					title={countTitle(node.name, countsByLocation.get(node.id) ?? { here: 0, total: 0 })}
				>
					{countsByLocation.get(node.id)?.total ?? 0}
				</span>
			</button>
			<div class="flex shrink-0 items-center gap-1 pr-2">
				<button
					onclick={() =>
						(editingLocation = { id: node.id, name: node.name, parentId: node.parentId })}
					class="icon-btn"
					title="Rename or move"
					aria-label="Rename or move {node.name}"><Icon name="edit" /></button
				>
				<button
					onclick={() => (confirmDeleteLocation = node.id)}
					class="icon-btn icon-btn-danger"
					title="Remove"
					aria-label="Remove {node.name}"><Icon name="trash" /></button
				>
			</div>
		</div>
		{#if node.children.length > 0 && !folded.has(node.id)}
			<ul>
				{#each node.children as child (child.id)}
					{@render branch(child, depth + 1)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<!--
	How many there are, where the checkbox was.

	A tick answered "do I have it", which is the right question for a shopping
	list and the wrong one for a cupboard: two tins of tomatoes and none are
	both unticked the moment you open the last one. Down cannot go below none;
	up has no ceiling, because having four of something you keep two of is a
	fact and not an error.

	Two plain forms rather than a number field: this is pressed with a thumb in
	a cupboard, and it works with no JavaScript at all.
-->
{#snippet quantity(item: { id: number; name: string; qty: number; idealQty: number })}
	<div class="flex w-9 shrink-0 flex-col items-center leading-none">
		<form method="POST" action="?/setQty" use:enhance={requantify} class="contents">
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="qty" value={item.qty + 1} />
			<button
				type="submit"
				class="icon-btn h-5 w-9 text-base"
				title="One more"
				aria-label="One more {item.name}">+</button
			>
		</form>
		<!--
			"2" alone does not answer the question the list is for. Where you keep
			more than one, the count you are measured against is written beside
			it, so "two of four" is a glance rather than an arithmetic.
		-->
		<span
			class="tabular py-0.5 text-center text-sm whitespace-nowrap {item.qty >=
			Math.max(item.idealQty, 1)
				? 'text-blue-700'
				: 'text-gray-900'}"
			title="{item.name}: {item.qty} here, and you keep {item.idealQty}"
		>
			{item.qty}{#if item.idealQty > 1}<span class="text-xs text-gray-500">/{item.idealQty}</span
				>{/if}
		</span>
		<form method="POST" action="?/setQty" use:enhance={requantify} class="contents">
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="qty" value={Math.max(0, item.qty - 1)} />
			<button
				type="submit"
				disabled={item.qty <= 0}
				class="icon-btn h-5 w-9 text-base disabled:opacity-25"
				title="One fewer"
				aria-label="One fewer {item.name}">−</button
			>
		</form>
	</div>
{/snippet}

<!--
	What this particular thing is, in its own words.

	A tape is 3m or 5m and a cable is USB-C or not; nothing else in the app has
	either field, so they are the thing's rather than a column. Shown on the row
	because a fact you have to open a form to see is a fact nobody reads.
-->
{#snippet ownFields(item: { attributes?: string | null })}
	{@const pairs = fieldsOf(item.attributes)}
	{#if pairs.length > 0}
		<span class="mt-0.5 flex flex-wrap items-center gap-1">
			{#each pairs as [key, value] (key)}
				<span class="chip">{key}: {value}</span>
			{/each}
		</span>
	{/if}
{/snippet}

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="shrink-0 text-lg font-bold text-gray-900">Inventory</h1>
		<!--
			Six buttons of identical weight said everything here was equally worth
			pressing. They are three different kinds of thing, so they now look like
			three: which list you are in (one setting, one track), what it hides (two
			quiet toggles), and the one thing you came to do.
		-->
		<div class="flex flex-wrap items-center gap-2">
			<div class="seg" role="group" aria-label="Which list">
				<button
					onclick={() => (filterType = 'all')}
					aria-pressed={filterType === 'all'}
					title="Everything, both lists">All</button
				>
				<button
					onclick={() => (filterType = filterType === 'replenish' ? 'all' : 'replenish')}
					aria-pressed={filterType === 'replenish'}
					title="Restock ({keyFor('/inventory', 'filter-replenish')})">Restock</button
				>
				<button
					onclick={() => (filterType = filterType === 'someday' ? 'all' : 'someday')}
					aria-pressed={filterType === 'someday'}
					title="Wishlist ({keyFor('/inventory', 'filter-someday')})">Wishlist</button
				>
				<button
					onclick={() => (filterType = filterType === 'short' ? 'all' : 'short')}
					aria-pressed={filterType === 'short'}
					class="seg-alarm"
					title="Only what you have fewer of than you keep">Short</button
				>
			</div>

			<button
				onclick={() => (showBought = !showBought)}
				aria-pressed={showBought}
				class="btn btn-sm btn-quiet"
				title="Show what you already have ({keyFor('/inventory', 'toggle-show-bought')})"
			>
				{showBought ? 'Hide' : 'Show'} bought
			</button>
			<button
				onclick={() => (showSnoozed = !showSnoozed)}
				aria-pressed={showSnoozed}
				class="btn btn-sm btn-quiet"
				title="Show what you put away ({keyFor('/inventory', 'toggle-show-snoozed')})"
			>
				{showSnoozed ? 'Hide' : 'Show'} archived
			</button>
			<label class="sr-only" for="inventory-find">Find</label>
			<OneLine
				id="inventory-find"
				name="find"
				bind:value={find}
				placeholder="Find…"
				class="input w-36 py-1 text-sm"
			/>
			<button onclick={() => (showCategories = true)} class="btn btn-sm btn-quiet"
				>Categories</button
			>
			<button
				onclick={() => (showForm ? (showForm = false) : openCreateForm())}
				class="btn btn-sm btn-primary"
				data-tour="shopping-new"
			>
				{showForm ? 'Cancel' : 'Add item'}
				<kbd class="border border-white/30 px-1">{keyFor('/inventory', 'new')}</kbd>
			</button>
		</div>
	</div>

	<!--
		What the filters are keeping off the screen, in the layout whether or not
		there is anything to say. Rendered invisible rather than removed: a line
		that appears and disappears as filters are switched would move every card
		under it each time.
	-->
	<p
		class="-mt-2 text-xs text-gray-500 {notShowing > 0 ? '' : 'invisible'}"
		aria-hidden={notShowing > 0 ? undefined : 'true'}
	>
		Not showing {notShowing}
		{notShowing === 1 ? 'item' : 'items'}
	</p>

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
					bind:locationId={newLocationId}
					bind:fields={editFields}
					bind:idealQty={editIdealQty}
					categories={data.shoppingCategories}
					locations={locationChoices}
					askLocation={true}
					showFields={editingId !== null}
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

	<!--
		The house down the left, the things down the right.

		The same rows, read on a second axis. Opening a location narrows the
		lists beside it to what is in that location and everything under it, so
		"what is in the kitchen" and "what do I need to buy" are one screen
		rather than two.
	-->
	<div class="grid gap-4 lg:grid-cols-[minmax(13rem,17rem)_1fr]">
		<section class="self-start border border-gray-200 bg-white shadow-card">
			<header
				class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2"
			>
				<h2 class="eyebrow text-gray-600">Where things live</h2>
				<button
					onclick={() => (addingLocation = true)}
					class="icon-btn"
					title="New location"
					aria-label="New location"><Icon name="plus" /></button
				>
			</header>

			<!-- Capped on a phone, where the panel sits above the list rather than
			     beside it: a house with twenty drawers would otherwise push the
			     things themselves off the bottom of the screen. -->
			<ul
				class="max-h-64 divide-y divide-gray-200 overflow-y-auto lg:max-h-none lg:overflow-visible"
			>
				{@render locationRow(null, 'Everything', allowedItems.length, 0)}
				{#each data.locationTree as root (root.id)}
					{@render branch(root, 0)}
				{/each}
				{#if unfiledCount > 0}
					{@render locationRow(0, 'Not filed anywhere', unfiledCount, 0)}
				{/if}
			</ul>

			<p class="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
				Drag a thing onto a location to say where it lives.
			</p>
		</section>

		<div class="min-w-0 space-y-4">
			{#if replenishItems.length > 0}
				<div data-tour="shopping-list">
					<!-- "Inventory" was this heading's name before the room took it. These
			     are the things you restock; the room is both halves. -->
					<h2 class="mb-2 text-sm font-bold text-gray-500">To restock</h2>
					<!--
				One category per card, flowing into columns.

				As one tall list this was a metre of scrolling with a name at the left
				edge and its buttons a screen-width away at the right. Columns rather
				than a grid because the categories are of wildly different lengths and
				a grid would leave a row as tall as its longest cell.
			-->
					{#each replenishByPlace as place (place.id)}
						{#if showPlaces}
							<!-- The address, root down, the same string the panel shows. -->
							<h3 class="mt-4 mb-2 flex items-center gap-2 text-sm text-gray-700 first:mt-0">
								<Icon name="shopping" class="size-4 shrink-0 text-gray-400" />
								<span class="font-medium">{place.label}</span>
							</h3>
						{/if}
						<!-- A grid rather than newspaper columns: each place is its own
						     block now, so a place with one category was a quarter-width
						     strip beside three quarters of nothing. -->
						<div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
							{#each place.categories as category (category.name)}
								<section
									class="mb-4 break-inside-avoid border border-gray-200 bg-white shadow-card"
								>
									<h4 class="eyebrow border-b border-gray-200 px-4 py-2 text-gray-500">
										{category.name}
									</h4>
									<div class="divide-y divide-gray-200">
										{#each category.items as item (item.id)}
											{@const globalIdx = filteredItems.indexOf(item)}
											<!--
									Still to buy is the normal state of a shopping list, and a wash of
									alarm colour behind every row spends the one signal that should
									mean something is wrong. The unticked box already says it. Only
									what you have — blue — and what you put away — dimmed — are marked.
								-->
											<div
												use:keepInView={globalIdx === selectedIndex}
												draggable="true"
												ondragstart={(e) => {
													dragging = item.id;
													// Firefox refuses to start a drag with no payload set.
													e.dataTransfer?.setData('text/plain', String(item.id));
												}}
												ondragend={() => {
													dragging = null;
													dragOver = null;
													stopFollowing();
												}}
												class="flex cursor-grab items-center gap-x-3 px-4 py-2 {item.snoozed
													? 'bg-gray-50 opacity-50'
													: item.bought
														? 'bg-blue-50'
														: ''} {globalIdx === selectedIndex
													? 'ring-2 ring-gray-400 ring-inset'
													: ''}"
											>
												<!--
										The count down the left edge, where the thumb already is
										and where the tick used to be. Stacked rather than in a
										line: three controls across the front of a row is forty
										pixels of width on a phone that the name then does not
										have, and a name that has run out of width breaks one
										letter per line.
									-->
												{@render quantity(item)}

												<div class="min-w-0 flex-1">
													<span class="text-sm break-words text-gray-900">{item.name}</span>
													{#if item.notes}
														<span class="ml-2 text-xs text-gray-500">{item.notes}</span>
													{/if}
													{@render expectedPrice(item)}
													{@render meta(item)}
												</div>

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
															title={item.snoozed ? 'Put it back on the list' : 'Put it away'}
															aria-label="{item.snoozed ? 'Unarchive' : 'Archive'}: {item.name}"
														>
															<Icon name={item.snoozed ? 'undo' : 'archive'} />
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
					{/each}
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
								draggable="true"
								ondragstart={(e) => {
									dragging = item.id;
									// Firefox refuses to start a drag with no payload set.
									e.dataTransfer?.setData('text/plain', String(item.id));
								}}
								ondragend={() => {
									dragging = null;
									dragOver = null;
									stopFollowing();
								}}
								class="flex cursor-grab items-center gap-x-3 px-4 py-2 {globalIdx === selectedIndex
									? 'bg-gray-50'
									: ''} {item.snoozed ? 'opacity-50' : ''}"
							>
								<!--
									A tick here and a count over there, deliberately.

									A wishlist item is a chair or a pair of headphones — you own
									it or you do not, and "how many armchairs" is not a question
									anybody is asking. The things you restock are the ones a
									number is about.
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
									<span
										class="text-sm {item.bought ? 'text-gray-500 line-through' : 'text-gray-900'}"
									>
										{item.name}
									</span>
									{#if item.notes}
										<span class="ml-2 text-xs text-gray-500">{item.notes}</span>
									{/if}
									{@render expectedPrice(item)}
									{@render usedIn(item)}
								</div>

								<div class="row-actions">
									<form method="POST" action="?/toggleSnoozed" use:enhance={tick('toggleSnoozed')}>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
											class="icon-btn"
											aria-pressed={item.snoozed}
											title={item.snoozed ? 'Put it back on the list' : 'Put it away'}
											aria-label="{item.snoozed ? 'Unarchive' : 'Archive'}: {item.name}"
										>
											<Icon name={item.snoozed ? 'undo' : 'archive'} />
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
					{:else if notShowing > 0}
						Nothing here matches the current filter.
					{:else}
						No items match the current filter.
					{/if}
				</div>
			{/if}
		</div>
	</div>
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
						<OneLine name="name" value={category.name} class="input flex-1" required autofocus />
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
					     switches belong to whoever owns it. The chip sits where the
					     buttons sit on your own rows, so the columns line up. -->
					<span class="flex-1">{category.name}</span>
					<span class="eyebrow shrink-0 text-gray-500">family</span>
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
							<!-- The name is for tests and tools that find the tick by what
							     it means; the value rides the hidden field beside it. -->
							<input
								type="checkbox"
								name="food"
								value={category.id}
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
				<OneLine name="label" placeholder="Frozen" class="input mt-1" required />
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

<!-- A location, new or being changed. -->
<Modal
	open={addingLocation || editingLocation !== null}
	onclose={() => {
		addingLocation = false;
		editingLocation = null;
	}}
	error={form?.message}
	title={editingLocation ? 'Rename or move' : 'New location'}
	description="A room, a cupboard, a drawer. One can sit inside another."
	size="sm"
>
	<form
		id="location-form"
		method="post"
		action="?/{editingLocation ? 'updateLocation' : 'createLocation'}"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') {
					addingLocation = false;
					editingLocation = null;
				}
			}}
	>
		{#if editingLocation}
			<input type="hidden" name="id" value={editingLocation.id} />
		{/if}
		<FormGrid>
			<Field label="Name" span={12} required>
				<OneLine
					name="heading"
					required
					value={editingLocation?.name ?? ''}
					placeholder="White chest"
				/>
			</Field>
			<Field label="Inside" span={12} hint="Leave empty for a room or a building.">
				<select name="parentId" class="select">
					<option value="">— nothing, it is top level —</option>
					{#each data.locations as one (one.id)}
						{#if one.id !== editingLocation?.id}
							<option value={one.id} selected={editingLocation?.parentId === one.id}>
								{locationPaths.get(one.id)}
							</option>
						{/if}
					{/each}
				</select>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button
			type="button"
			class="btn"
			onclick={() => {
				addingLocation = false;
				editingLocation = null;
			}}>Cancel</button
		>
		<button type="submit" form="location-form" class="btn btn-primary">
			{editingLocation ? 'Save' : 'Add'}
		</button>
	{/snippet}
</Modal>

<!--
	Removing one, in its own dialog.

	Nothing is destroyed: what was inside rises to where it was and the things
	keep existing without an address. The sentence says so, because a delete
	that reads as destructive gets avoided even when it is not.
-->
<Modal
	open={confirmDeleteLocation !== null}
	onclose={() => (confirmDeleteLocation = null)}
	title="Remove this location?"
	description="Whatever is inside it moves up a level, and the things filed here keep existing — they just lose their address."
	size="sm"
>
	<p class="text-sm text-gray-500">
		Nothing is thrown away. This only takes the shelf out of the tree.
	</p>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmDeleteLocation = null)}>Cancel</button>
		<form
			method="post"
			action="?/deleteLocation"
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					confirmDeleteLocation = null;
				}}
		>
			<input type="hidden" name="id" value={confirmDeleteLocation} />
			<button class="btn btn-danger" use:armed>Yes, remove it</button>
		</form>
	{/snippet}
</Modal>
