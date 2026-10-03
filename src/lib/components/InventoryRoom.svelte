<script lang="ts">
	import { pillStyle } from '$lib/pill-ink';
	import { openFromUrl } from '$lib/open-from-url.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import { enhance } from '$lib/enhance';
	import OneLine from '$lib/components/OneLine.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import BuyFields from '$lib/components/fields/BuyFields.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import Picker from '$lib/components/Picker.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import StripVerb from '$lib/components/StripVerb.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import TabStrip from '$lib/components/TabStrip.svelte';
	import TickBox from '$lib/components/TickBox.svelte';
	import ColorWell from '$lib/components/ColorWell.svelte';
	import {
		ITEM_DIRECTION_KEY,
		ITEM_ORDER_KEY,
		ITEM_ORDER_LABELS,
		ITEM_ORDERS,
		DEFAULT_ITEM_ORDER,
		compareItems,
		isItemOrder,
		itemDirectionFor,
		type ItemDirection,
		type ItemOrder
	} from '$lib/item-order';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	/*
	 * Typed from the room's own load, which both tabs share.
	 *
	 * A type-only import: nothing from the server module reaches the browser,
	 * and the alternative is restating a dozen service return types here and
	 * having them drift from the query that produces them.
	 */
	import type { load as inventoryLoad } from '../../routes/inventory/+layout.server';

	type RoomData = Awaited<ReturnType<typeof inventoryLoad>>;
	import type { ActionData } from '../../routes/inventory/stock/$types';
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
	import SplitColumns from '$lib/components/SplitColumns.svelte';
	import ItemRow, { itemRowWash } from '$lib/components/ItemRow.svelte';
	import PicturePicker from '$lib/components/PicturePicker.svelte';
	import { ITEM_ROOM_ACTIONS } from '$lib/item-action-names';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		/**
		 * Which of the two lists this tab is: the cupboard, or the wishlist.
		 *
		 * It used to be a segment above the rows — All, Restock, Wishlist — and
		 * they are two different questions, not one list with a filter over it:
		 * what you keep and how much of it, against what you might get one day.
		 * So each is a tab with its own address, and what remains a filter is
		 * "short", which is a question asked of the cupboard.
		 */
		list,
		data,
		form
	}: {
		list: 'replenish' | 'someday';
		data: RoomData;
		form: ActionData;
	} = $props();

	/*
	 * How wide the house is, and the handle that says so.
	 *
	 * The drag lives in `SplitColumns`, which Notebooks uses too; what stays
	 * here is where the width is written down — once, when the handle is let
	 * go, rather than on every pixel of it.
	 */
	// The seed, read once; from here the handle owns it and the load only
	// supplies where it was last left.
	// svelte-ignore state_referenced_locally
	let panelRem = $state(data.locationPanelRem);
	let panelForm = $state<HTMLFormElement>();

	let showForm = $state(false);
	let selectedIndex = $state(-1);
	let editingId: number | null = $state(null);
	let editName = $state('');
	let editInventoryCategoryId: number | null = $state(null);
	let editNotes = $state('');
	let editPrice = $state('');
	/** Only asked when writing something down; an edit leaves it where it is. */
	let newLocationId = $state<number | null>(null);
	/** A count that changed, kept on screen until the page catches up. */
	/** The thing's own fields, while it is being edited. */
	let editFields = $state<[string, string][]>([]);
	/** The subject it is filed under, so an edit does not take it out of one. */
	let editNotebookId = $state<number | null>(null);
	let editIdealQty = $state('1');

	/** Which row is asking "really delete?" — Escape cancels it from anywhere. */
	let confirmingDelete = $state<number | null>(null);

	/**
	 * Which list, plus the one question this page exists to answer.
	 *
	 * "Short" is not a third list — it is a question asked of the things you
	 * restock: which of them do I have fewer of than I keep. That question had
	 * no button, so answering it meant reading every row's numbers.
	 */
	/** Whether the cupboard is narrowed to what has run low. */
	let onlyShort = $state(false);
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
	/** How far each level of the house steps in: one rem, on the spacing scale. */
	const PLACE_INDENT_REM = 1;
	/** Whether the house is unfolded on a phone, where it sits above the things. */
	let treeOpen = $state(false);
	let addingLocation = $state(false);
	let editingLocation = $state<{ id: number; name: string; parentId: number | null } | null>(null);
	let confirmDeleteLocation = $state<number | null>(null);
	/** The item being dragged, and the location it is over. */
	let dragging = $state<number | null>(null);
	let dragOver = $state<number | null>(null);
	/** The attribute, or `key\u0000value`, being edited or asking to be removed. */
	let editingVocab = $state<string | null>(null);
	let confirmRemoveVocab = $state<string | null>(null);
	/** What a colour well shows before anything was chosen: the neutral grey. */
	const NEUTRAL_WELL = '#6b7280';
	/** A category row's buttons: up, down, edit, delete — the header keeps their room. */
	const ORGANISE_ACTION_SLOTS = ['up', 'down', 'edit', 'delete'] as const;
	/** Which attribute value the list is narrowed to, as `key\u0000value`. */
	let attributeFilter = $state<string | null>(null);
	/** Counts the list is narrowed by: empty means no ceiling and no floor. */
	let atLeast = $state('');
	let atMost = $state('');

	/** Whether anything is narrowing the list, the find box included. */
	const narrowing = $derived(
		onlyShort ||
			showBought ||
			showSnoozed ||
			find.trim() !== '' ||
			attributeFilter !== null ||
			atLeast !== '' ||
			atMost !== ''
	);

	/** What is narrowing it, in words, for the phone's filter button. */
	function narrowingSaid(): string {
		const said: string[] = [];
		if (onlyShort) said.push(t('inventory.short'));
		if (showBought) said.push(t('inventory.boughtWord'));
		if (showSnoozed) said.push(t('inventory.archivedWord'));
		if (attributeFilter !== null) said.push(attributeFilter.replace('\u0000', ': '));
		if (atLeast !== '') said.push(`≥ ${atLeast}`);
		if (atMost !== '') said.push(`≤ ${atMost}`);
		return said.join(', ');
	}

	function clearFilters() {
		onlyShort = false;
		showBought = false;
		showSnoozed = false;
		find = '';
		attributeFilter = null;
		atLeast = '';
		atMost = '';
		selectedIndex = -1;
	}

	/**
	 * The attribute filter's choices: each attribute, then its values under it.
	 *
	 * The attribute on its own is the first choice in its group — "has a
	 * length at all" is the commonest question, and a list of values cannot
	 * ask it.
	 */
	const attributeChoices = $derived([
		{ value: '', label: t('inventory.anyAttribute') },
		...data.attributes.flatMap((attribute) => [
			{
				value: attribute.key,
				label: t('inventory.anyValueCount', { count: attribute.count }),
				path: [attribute.key],
				face: attribute.key
			},
			...attribute.values.map((one) => ({
				value: `${attribute.key}\u0000${one.value}`,
				label: `${one.value || t('inventory.noValue')} (${one.count})`,
				path: [attribute.key],
				face: `${attribute.key}: ${one.value || t('inventory.noValue')}`
			}))
		])
	]);

	/** Which attribute a chip should be drawn in, by name and by value. */
	const attributeColors = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built, returned and thrown away on each run; nothing mutates it afterwards.
		const byName = new Map<string, string>();
		for (const attribute of data.attributes) {
			if (attribute.color) byName.set(`${attribute.key}\u0000`, attribute.color);
			for (const value of attribute.values) {
				if (value.color) byName.set(`${attribute.key}\u0000${value.value}`, value.color);
			}
		}
		return byName;
	});

	/** A value's own colour, else the attribute's, else none. */
	function chipColor(key: string, value: string): string | undefined {
		return attributeColors.get(`${key}\u0000${value}`) ?? attributeColors.get(`${key}\u0000`);
	}
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
		(action: Exclude<Tick['action'], 'setQty'>): SubmitFunction =>
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

			let { bought, snoozed, qty } = item;
			for (const t of waiting) {
				if (t.action === 'toggleBought') bought = !bought;
				if (t.action === 'toggleSnoozed') snoozed = !snoozed;
				if (t.action === 'restock') bought = false;
				if (t.action === 'setQty') qty = t.qty;
			}
			return { ...item, bought, snoozed, qty };
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

	/*
	 * The order of the rows inside each card. Kept in the browser: it is a way
	 * of looking at the list, not a fact about the account. See `$lib/item-order`.
	 */
	let order = $state<ItemOrder>(DEFAULT_ITEM_ORDER);
	let direction = $state<ItemDirection>(itemDirectionFor(DEFAULT_ITEM_ORDER));

	onMount(() => {
		try {
			const kept = localStorage.getItem(ITEM_ORDER_KEY);
			if (isItemOrder(kept)) order = kept;
			const way = localStorage.getItem(ITEM_DIRECTION_KEY);
			if (way === 'asc' || way === 'desc') direction = way;
		} catch {
			// A private window, or storage refused: the defaults stand.
		}
	});

	function rememberOrder() {
		try {
			localStorage.setItem(ITEM_ORDER_KEY, order);
			localStorage.setItem(ITEM_DIRECTION_KEY, direction);
		} catch {
			// It still holds for this visit.
		}
	}

	/** Which of the room's two managing screens is up, and on which tab. */
	let organising = $state(false);
	let organiseTab = $state<'categories' | 'attributes'>('categories');

	/*
	 * The trip, as a list you tick in the shop.
	 *
	 * The lines are the ones there were when the list was opened, and a line
	 * that is ticked stays where it is, struck through, rather than leaving:
	 * a list that closes up under the thumb is a list where the next press
	 * lands on the wrong thing. Ticking a line fills the cupboard back up to
	 * what you keep; unticking puts back the count it had.
	 */
	let shopping = $state(false);
	let tripLines = $state<RoomData['run']['lines']>([]);
	let tripWishes = $state<RoomData['run']['wishlist']>([]);
	/** What each ticked line's count was before the tick, to untick it. */
	let basket = $state<Record<number, number>>({});

	function openShopping() {
		tripLines = data.run.lines;
		tripWishes = data.run.wishlist;
		basket = {};
		shopping = true;
	}

	/** A wish is in the basket when it is bought, by what the page now knows. */
	function wishInBasket(id: number): boolean {
		return items.find((one) => one.id === id)?.bought ?? false;
	}

	/**
	 * Ticking a line of the trip: the count goes up to what is kept, and back
	 * to what it was when it is unticked. Offline, it waits with the others.
	 */
	const tripTick =
		(id: number, qty: number, was: number): SubmitFunction =>
		({ cancel }) => {
			if (id in basket) delete basket[id];
			else basket[id] = was;
			if (!online) {
				cancel();
				remember({ id, action: 'setQty', qty });
				return;
			}
			return async ({ update }) => update({ reset: false });
		};

	let defaultInventoryCategoryId = $derived.by(() => {
		const otherCategory = data.inventoryCategories.find((category) => category.name === 'Other');
		return otherCategory?.id ?? data.inventoryCategories[0]?.id ?? null;
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

			/*
			 * The filters modal: how many there are, and what the thing says
			 * about itself.
			 *
			 * Both are about the thing rather than about which list it is on,
			 * which is why they live behind a button and not in the row of
			 * segments — "the cables" is a question you ask once, not a view you
			 * keep switching between.
			 */
			if (atLeast !== '' && item.qty < Number(atLeast)) return false;
			if (atMost !== '' && item.qty > Number(atMost)) return false;
			/*
			 * An attribute on its own means "has this at all", whatever it says.
			 *
			 * That is the commonest question — everything with a length, every
			 * cable — and a list of values cannot ask it: you would have to press
			 * every value of it and hope none was missed.
			 */
			if (attributeFilter !== null) {
				const fields = fieldsOf(item.attributes);
				if (attributeFilter.includes('\u0000')) {
					const [key, value] = attributeFilter.split('\u0000');
					if (!fields.some(([k, v]) => k === key && v === value)) return false;
				} else if (!fields.some(([k]) => k === attributeFilter)) {
					return false;
				}
			}

			// The tab decides which list this is; short narrows the cupboard to
			// what there is less of than you keep.
			if (item.type !== list) return false;
			return !onlyShort || item.qty < item.idealQty;
		})
	);

	/** Does this thing belong to the location on screen? */
	function inChosenLocation(item: { locationId: number | null }): boolean {
		if (location === 0) return item.locationId == null;
		if (inLocation) return item.locationId != null && inLocation.has(item.locationId);
		return true;
	}

	let filteredItems = $derived(allowedItems.filter(inChosenLocation));
	/** Any picture on show keeps a picture's room on every row — see `ItemRow`. */
	const anyPictured = $derived(filteredItems.some((one) => one.pictureId));
	/** The thing whose dialog is open, for its picture, which is set apart from the form. */
	const editingItem = $derived(data.items.find((one) => one.id === editingId) ?? null);

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
		if (count.total === 0) return t('inventory.placeEmpty', { name });
		if (count.total === count.here) return t('inventory.placeHolds', { count: count.total, name });
		return t('inventory.placeHoldsSplit', {
			count: count.total,
			name,
			here: count.here,
			inside: count.total - count.here
		});
	}
	/** The place that is open, in words, for the folded panel on a phone. */
	const placeName = $derived(
		location === null
			? t('inventory.everything')
			: location === 0
				? t('app.notFiledAnywhere')
				: (locationPaths.get(location) ?? t('inventory.everything'))
	);
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
	const onThisTab = $derived(items.filter((item) => item.type === list));
	const notShowing = $derived(onThisTab.filter(inChosenLocation).length - filteredItems.length);
	/** How many the two toggles would bring back, so nothing is hidden unsaid. */
	const boughtHere = $derived(onThisTab.filter((item) => item.bought).length);
	const archivedHere = $derived(onThisTab.filter((item) => item.snoozed).length);

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

	/** Every row on screen is on this tab's list, so the two lists group alike. */
	let replenishItems = $derived(
		[...filteredItems].sort((a, b) => compareItems(a, b, order, direction))
	);
	/** Items grouped into category cards, in the order the categories are kept. */
	function byCategory(rows: typeof replenishItems) {
		const catOrder = new Map(data.inventoryCategories.map((c) => [c.name, c.sortOrder]));
		const grouped: Record<string, typeof replenishItems> = {};
		for (const item of rows) {
			const catName = item.inventoryCategoryName ?? 'Other';
			if (!(catName in grouped)) grouped[catName] = [];
			grouped[catName].push(item);
		}
		return Object.entries(grouped)
			.sort((a, b) => (catOrder.get(a[0]) ?? 999) - (catOrder.get(b[0]) ?? 999))
			.map(([name, items]) => {
				const cat = data.inventoryCategories.find((c) => c.name === name);
				return { name, id: cat?.id ?? null, color: cat?.color ?? null, items };
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

		/*
		 * Depth-first through the tree, so the groups arrive in the order the
		 * panel shows them rather than in whatever order the rows came back.
		 *
		 * A folded place takes what is inside it with it — its own things and
		 * everything under it — which is the same fold the panel's chevron
		 * makes, on the half that lists them. Folding the kitchen on either
		 * side puts away the kitchen, the drawers in it and what is in those.
		 * The heading stays, with a count, so a fold never loses a place.
		 */
		const order: { id: number; under: number | null }[] = [];
		const walk = (nodes: RoomData['locationTree'], under: number | null) => {
			for (const node of nodes) {
				order.push({ id: node.id, under });
				walk(node.children, node.id);
			}
		};
		walk(data.locationTree, null);

		const parentOf = new Map(order.map((node) => [node.id, node.under]));
		const insideAFold = (id: number) => {
			for (let at = parentOf.get(id) ?? null; at !== null; at = parentOf.get(at) ?? null)
				if (folded.has(at)) return true;
			return false;
		};

		/** What a folded place is holding, counting everything under it too. */
		const held = (id: number) => {
			let total = byLocation.get(id)?.length ?? 0;
			for (const node of order) if (node.under === id) total += held(node.id);
			return total;
		};

		const groups = order
			.map((node) => node.id)
			.filter((id) => !insideAFold(id))
			.filter((id) => byLocation.has(id) || (folded.has(id) && held(id) > 0))
			.map(
				(
					id
				): {
					id: number;
					label: string | null;
					folded: boolean;
					held: number;
					categories: ReturnType<typeof byCategory>;
				} => ({
					id,
					label: locationPaths.get(id) ?? null,
					folded: folded.has(id),
					held: held(id),
					categories: folded.has(id) ? [] : byCategory(byLocation.get(id) ?? [])
				})
			);

		if (byLocation.has(0)) {
			groups.push({
				id: 0,
				// The one group the app names itself; the rest are the person's
				// own locations, which are never translated.
				label: null,
				folded: false,
				held: byLocation.get(0)?.length ?? 0,
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

	/**
	 * How many columns a place's cards are worth.
	 *
	 * Columns only pay when the cards are of comparable length: one card
	 * holding most of the rows beside a short one leaves the short one's
	 * column empty for the whole of the long one, which is the stretched-cell
	 * waste in another shape. So the cards stack, full width, unless no card
	 * holds more than `COLUMN_SHARE` of the rows.
	 */
	const COLUMN_SHARE = 2 / 3;
	const MAX_COLUMNS = 3;
	function columnsFor(categories: { items: unknown[] }[]): number {
		if (categories.length < 2) return 1;
		const total = categories.reduce((sum, one) => sum + one.items.length, 0);
		const largest = Math.max(...categories.map((one) => one.items.length));
		return largest > total * COLUMN_SHARE ? 1 : Math.min(categories.length, MAX_COLUMNS);
	}

	/** The rows in the order they are drawn, which is the order j and k walk. */
	const shownItems = $derived(
		replenishByPlace.flatMap((place) => place.categories.flatMap((category) => category.items))
	);

	const locationChoices = $derived(
		data.locations.map((one) => ({ ...one, path: locationPaths.get(one.id) ?? one.name }))
	);

	function openCreateForm() {
		cancelEdit();
		editIdealQty = '1';
		// One blank pair, so a thing can be described as it is written down
		// rather than added and then opened again to say what it is.
		editFields = [['', '']];
		// Standing in a drawer and adding something puts it in that drawer.
		newLocationId = location !== null && location !== 0 ? location : null;
		// Written down on the tab you are standing on.
		newItemType = list;
		editInventoryCategoryId = defaultInventoryCategoryId;
		editNotebookId = null;
		showForm = true;
	}

	function startEdit(item: (typeof data.items)[0]) {
		editingId = item.id;
		editName = item.name;
		newItemType = item.type;
		editInventoryCategoryId = item.inventoryCategoryId;
		editNotes = item.notes ?? '';
		editPrice = item.priceCents === null ? '' : (item.priceCents / 100).toFixed(2);
		// One blank pair at the end, so adding a field is typing rather than
		// finding the button that lets you type.
		editFields = [...fieldsOf(item.attributes), ['', '']];
		// Where it lives, on the edit form too: a drag is the quick way and not
		// everybody's way, and on a phone it is not always the possible one.
		newLocationId = item.locationId;
		editIdealQty = String(item.idealQty ?? 1);
		editNotebookId = item.notebookId;
		showForm = true;
	}

	/*
	 * And the address can ask for one, which is how the receipt after a quick
	 * capture offers a way straight into the thing it just wrote. See
	 * `$lib/open-from-url`.
	 */
	openFromUrl((id) => {
		const item = data.items.find((one) => one.id === id);
		if (item) startEdit(item);
	});

	/** An item's attributes, as pairs, from the JSON they are stored as. */
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
		editInventoryCategoryId = null;
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

		const items = shownItems;
		const action = getAction('/inventory/stock', e.key);
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
			case 'toggle-show-bought':
				showBought = !showBought;
				break;
			case 'toggle-show-snoozed':
				showSnoozed = !showSnoozed;
				break;
		}
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('inventory.addItem'),
		open: showForm,
		tour: 'inventory-new',
		kbd: keyFor('/inventory/stock', 'new'),
		run: () => (showForm ? (showForm = false) : openCreateForm())
	}));
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
	What this usually costs, beside the thing it costs.

	It was summed into the total at the top and rendered on no row, so editing
	an item's price looked exactly like an edit that had not saved — including
	after a reload, because there was nothing there to change.
-->
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
{#snippet locationRow(id: number | null, label: string, count: number)}
	<li>
		{@render placeRow({
			id,
			label,
			count,
			title: undefined,
			depth: 0,
			fold: null,
			actions: false
		})}
	</li>
{/snippet}

<!--
	One row of the house: `indent · chevron · name ——— count · actions`.

	Every row has every column, so the names step in by one rem a level and the
	counts stand in one column whatever the row can do. Where a pointer can
	hover, the actions lie over the end of the name and take no room; on a
	touch screen they have room of their own, kept on every row.
-->
{#snippet placeRow(row: {
	id: number | null;
	label: string;
	count: number;
	title: string | undefined;
	depth: number;
	/** The node this row folds, or null for a row that cannot. */
	fold: RoomData['locationTree'][number] | null;
	actions: boolean;
})}
	{@const target = row.id ?? -1}
	<div
		class="edge-to-edge group relative flex items-center pr-4 {location === row.id
			? 'bg-gray-100'
			: 'hover:bg-gray-50'} {dragOver === target ? 'kb-cursor' : ''}"
		style="padding-left: {row.depth * PLACE_INDENT_REM}rem"
	>
		{#if row.fold && row.fold.children.length > 0}
			{@const node = row.fold}
			{@const said = folded.has(node.id)
				? t('inventory.showWhatIsIn', { place: node.name })
				: t('inventory.fold', { place: node.name })}
			<button
				onclick={() => toggleFold(node.id)}
				class="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center text-gray-500 transition hover:text-gray-900"
				aria-expanded={!folded.has(node.id)}
				title={said}
				aria-label={said}
			>
				<Icon
					name="chevron-down"
					class="size-4 transition-transform {folded.has(node.id) ? '-rotate-90' : ''}"
				/>
			</button>
		{:else}
			<span class="w-9 shrink-0" aria-hidden="true"></span>
		{/if}
		<button
			onclick={() => {
				location = row.id;
				treeOpen = false;
			}}
			ondragover={(e) => {
				if (dragging === null) return;
				e.preventDefault();
				dragOver = target;
			}}
			ondragleave={() => (dragOver = null)}
			ondrop={(e) => {
				e.preventDefault();
				dragOver = null;
				if (dragging !== null) void drop(dragging, row.id === 0 ? null : row.id);
				dragging = null;
			}}
			aria-current={location === row.id ? 'true' : undefined}
			class="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm transition {location ===
			row.id
				? 'font-medium text-gray-900'
				: 'text-gray-700'}"
		>
			<!-- Its own name as the tooltip: the column is as wide as the reader
			     left it and a name can always be longer than that. -->
			<span class="min-w-0 flex-1 truncate" title={row.label}>{row.label}</span>
			<span
				class="tabular w-8 shrink-0 text-right text-xs font-normal text-gray-500"
				title={row.title}>{row.count}</span
			>
		</button>
		<!--
			Out of the way until the row is pointed at, where a pointer can point:
			there they lie over the end of the name, on the row's own fill, so the
			names keep the width. A finger has no hover, so on a touch screen they
			are always there, in room of their own.

			Invisible is not absent, though: a hidden button still took the press,
			so a click on the right half of a place renamed it. They take the
			pointer only while they can be seen.

			And out of the way altogether while something is being dragged: the
			row under the pointer is hovered, so they lay over the place a thing
			was being dropped on and took the drop — nothing moved.
		-->
		{#if row.actions && row.fold}
			{@const node = row.fold}
			<div
				class="place-actions relative z-10 flex shrink-0 items-center gap-1 transition-opacity [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:absolute [@media(hover:hover)]:right-12 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:pointer-events-auto [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100 {location ===
				row.id
					? 'bg-gray-100'
					: 'bg-gray-50'} {dragging === null ? '' : '!pointer-events-none !opacity-0'}"
			>
				<button
					onclick={() =>
						(editingLocation = { id: node.id, name: node.name, parentId: node.parentId })}
					class="icon-btn"
					title={t('inventory.renameOrMove')}
					aria-label={t('inventory.renameOrMove2', { name: node.name })}
					><Icon name="edit" /></button
				>
				<button
					onclick={() => (confirmDeleteLocation = node.id)}
					class="icon-btn icon-btn-danger"
					title={t('ui.remove')}
					aria-label={t('inventory.remove', { name: node.name })}><Icon name="trash" /></button
				>
			</div>
		{:else}
			<!-- The room a place's buttons take on a touch screen, kept on the
			     rows that have none so every count stands in one column. -->
			<div class="invisible flex shrink-0 gap-1 [@media(hover:hover)]:hidden" aria-hidden="true">
				<span class="icon-btn"></span><span class="icon-btn"></span>
			</div>
		{/if}
	</div>
{/snippet}

<!--
	A location and everything under it.

	Foldable, because a house with a row per drawer makes the panel taller than
	the things it is meant to help you find. Folding hides what is inside a
	location, never the location itself, and its number still counts the whole
	subtree — so a folded branch says how much is in there without listing it.
-->
{#snippet branch(node: RoomData['locationTree'][number], depth: number)}
	{@const count = countsByLocation.get(node.id) ?? { here: 0, total: 0 }}
	<li>
		{@render placeRow({
			id: node.id,
			label: node.name,
			count: count.total,
			title: countTitle(node.name, count),
			depth,
			fold: node,
			actions: true
		})}
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
<div class="space-y-4">
	{#if !online || ticks.pending.length > 0}
		<Banner kind="warning">
			{#if !online}
				{t('inventory.noConnectionThisIsThe')}
			{/if}
			{#if ticks.pending.length > 0}
				{ticks.pending.length}
				{ticks.pending.length === 1 ? t('inventory.changeIs') : t('inventory.changesAre')}
				{t('inventory.waitingToBeSent')}
			{:else}
				{t('inventory.whatYouTickWillBe')}
			{/if}
		</Banner>
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
		title={editingId ? t('inventory.editItem') : t('inventory.newItem')}
		onclose={cancelEdit}
		size="sm"
	>
		<!-- Its own form beside the item's, since a file goes up the moment it
		     is chosen. Only on a thing of your own: a shared one's picture is
		     its owner's to choose. -->
		{#if editingItem?.mine}
			<div class="mb-3 flex items-center gap-3">
				<PicturePicker
					id={editingItem.id}
					pictureId={editingItem.pictureId}
					icon="box"
					kilobytes={data.pictureKilobytes}
					setAction={ITEM_ROOM_ACTIONS.setPicture}
					removeAction={ITEM_ROOM_ACTIONS.removePicture}
					fields={{ title: editingItem.name }}
					chooseLabel={t('inventory.aPictureOf', { name: editingItem.name })}
					changeLabel={t('inventory.changeThePicture')}
					removeLabel={t('inventory.removeThePicture')}
					size="size-16"
					removable
				/>
				<p class="text-xs text-gray-500">
					{editingItem.pictureId
						? t('inventory.pressToChangeIt')
						: t('inventory.pressToChooseAPicture')}
				</p>
			</div>
		{/if}
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
					bind:inventoryCategoryId={editInventoryCategoryId}
					bind:locationId={newLocationId}
					bind:fields={editFields}
					bind:idealQty={editIdealQty}
					bind:notebookId={editNotebookId}
					categories={data.inventoryCategories}
					locations={locationChoices}
					notebooks={data.notebooks}
					askLocation={true}
					showFields
				/>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
			<button type="submit" form="item-form" class="btn btn-primary">
				{editingId ? 'Save' : t('inventory.addItem')}
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
	<!--
		One surface under both halves.

		The panel and the list used to be two cards on the page's own
		background, which reads as two things that happen to be near each other
		rather than as two views of the same rows. The divider between them is
		also the handle: the house is as wide as its names need, and the space
		comes off the list, which is the only place it can come from.
	-->
	<!--
		And the filters are part of that surface rather than a row above it.

		Which list you are in and what it hides describe exactly what the panel
		underneath is showing, so they sit on it: a toolbar along the top of the
		same white, above the line that separates it from the rows it filters.
		Loose on the page they were three controls of three shapes floating over
		the thing they act on.
	-->
	<!--
		`overflow-anchor: none` because a fold must not move the page.

		Folding a place takes a run of cards out of a two-column grid, so the
		cards below it reflow upwards by about half of what was removed. The
		browser's scroll anchoring sees one of those cards shift, decides the
		page moved under the reader and scrolls to put it back — which moves
		everything the reader *was* looking at, the heading they just pressed
		included, by a few hundred pixels. Excluding this subtree from anchoring
		leaves the scroll where the reader left it; the cards reflow under the
		heading, which is what a fold is supposed to look like.
	-->
	<RoomSurface>
		<!--
			The strip every list in the app has: search, how many are showing,
			the toggles and filters, the way back to everything — then the room's
			two other screens and the order. What the trip will cost is on the
			shopping list itself, where it is read.
		-->
		{#snippet tools()}
			<FilterBar name="inventory" on={narrowing} summary={narrowingSaid()} onclear={clearFilters}>
				{#snippet lead()}
					<SearchField
						name="find"
						bind:value={find}
						placeholder={t('inventory.searchTheseThings')}
						label={t('inventory.searchTheseThings')}
					/>
				{/snippet}
				{#snippet count()}
					<!-- Held open by the sentence at the whole tab's count, so
					     narrowing the list never moves the controls after it.
					     See `.count-slot`. -->
					<ShowingCount
						total={onThisTab.length}
						shown={filteredItems.length}
						said={(count) => t('inventory.showingCount', { count })}
						title={notShowing > 0
							? t('inventory.hiddenByTheFilters', { count: notShowing })
							: undefined}
					/>
				{/snippet}
				<!--
					The same slots on both tabs, so changing tab moves nothing: the
					first toggle is the tab's own question — "short" of the cupboard,
					"bought" of the wishlist. The count range is the cupboard's alone;
					it is last, so nothing moves up to fill where it would be.
				-->
				{#if list === 'replenish'}
					<button
						onclick={() => (onlyShort = !onlyShort)}
						aria-pressed={onlyShort}
						class="btn btn-sm shrink-0"
						title={t('inventory.onlyWhatYouHaveFewer')}>{t('inventory.short')}</button
					>
				{:else}
					<button
						onclick={() => (showBought = !showBought)}
						aria-pressed={showBought}
						class="btn btn-sm shrink-0"
						title={t('inventory.showWhatYouAlreadyHave', {
							bought: keyFor('/inventory/stock', 'toggle-show-bought')
						})}>{t('inventory.boughtCount', { count: boughtHere })}</button
					>
				{/if}
				<!-- Named with its number, so a thing put away is never quietly gone. -->
				<button
					onclick={() => (showSnoozed = !showSnoozed)}
					aria-pressed={showSnoozed}
					class="btn btn-sm shrink-0"
					disabled={archivedHere === 0 && !showSnoozed}
					title={t('inventory.showWhatYouPutAway', {
						snoozed: keyFor('/inventory/stock', 'toggle-show-snoozed')
					})}>{t('inventory.archivedCount', { count: archivedHere })}</button
				>
				{#if data.attributes.length > 0 || attributeFilter !== null}
					<Picker
						value={attributeFilter ?? ''}
						options={attributeChoices}
						onpick={(next) => (attributeFilter = next === '' ? null : next)}
						label={t('inventory.attributes')}
						class="min-w-36 flex-1 sm:flex-none"
					/>
				{/if}
				<!-- How many, as a range: either end may be left open. The pair is
				     named as one question, and each box says which end it is.
				     The cupboard's alone: held open on the wishlist, it was the
				     thing that pushed that tab's toolbar onto a second line. -->
				{#if list === 'replenish'}
					<div
						role="group"
						aria-labelledby="inventory-how-many"
						class="flex shrink-0 items-center gap-1.5"
					>
						<span id="inventory-how-many" class="text-sm text-gray-600"
							>{t('inventory.howMany')}</span
						>
						<input
							type="number"
							min="0"
							inputmode="numeric"
							placeholder={t('inventory.atLeastShort')}
							aria-label={t('inventory.atLeastLabel')}
							title={t('inventory.atLeastLabel')}
							value={atLeast}
							oninput={(e) => (atLeast = e.currentTarget.value)}
							class="input input-sm w-16"
						/>
						<span class="text-gray-500" aria-hidden="true">–</span>
						<input
							type="number"
							min="0"
							inputmode="numeric"
							placeholder={t('inventory.atMostShort')}
							aria-label={t('inventory.atMostLabel')}
							title={t('inventory.atMostLabel')}
							value={atMost}
							oninput={(e) => (atMost = e.currentTarget.value)}
							class="input input-sm w-16"
						/>
					</div>
				{/if}
				{#snippet verb()}
					<!-- Named for the half most visits want; the dialog's second tab is
					     the attributes. A phone's strip has room for one verb beside
					     the order, and that is the shopping list: there this one
					     stands on the house's line instead. -->
					<StripVerb
						icon="sliders"
						label={t('inventory.categories')}
						title={t('inventory.categoriesAndAttributes')}
						class="btn btn-sm shrink-0 max-sm:hidden"
						onclick={() => (organising = true)}
					/>
					<StripVerb
						icon="shopping"
						label={data.run.lines.length > 0
							? t('inventory.shoppingListCount', { count: data.run.lines.length })
							: t('inventory.shoppingList')}
						data-tour="inventory-shopping"
						onclick={openShopping}
					/>
				{/snippet}
				{#snippet trailing()}
					<SortControl
						value={order}
						options={ITEM_ORDERS}
						labels={ITEM_ORDER_LABELS}
						{direction}
						onpick={(next) => {
							order = next;
							direction = itemDirectionFor(next);
							rememberOrder();
							selectedIndex = -1;
						}}
						onflip={() => {
							direction = direction === 'asc' ? 'desc' : 'asc';
							rememberOrder();
						}}
						label={t('inventory.orderThingsBy')}
					/>
				{/snippet}
			</FilterBar>
		{/snippet}

		<div class="[overflow-anchor:none]">
			<SplitColumns
				bind:rem={panelRem}
				label={t('inventory.widenOrNarrowTheLocations')}
				onsettle={() => panelForm?.requestSubmit()}
			>
				{#snippet left()}
					<section class="place-panel self-start max-lg:border-b max-lg:border-gray-200">
						<header
							class="flex items-center justify-between gap-2 border-gray-200 px-4 lg:border-b"
						>
							<h2 class="eyebrow py-3 text-gray-600 max-lg:hidden">
								{t('inventory.whereThingsLive')}
							</h2>
							<!--
								On a phone the house folds away under one line saying which
								place is open, so the things come first: a panel of twenty
								drawers above them put the first thing a screen and a half
								down, in a box that scrolled on its own.
							-->
							<button
								type="button"
								class="flex min-w-0 flex-1 items-center gap-2 py-3 text-left lg:hidden"
								aria-expanded={treeOpen}
								aria-controls="inventory-places"
								onclick={() => (treeOpen = !treeOpen)}
							>
								<Icon
									name="chevron-down"
									class="size-4 shrink-0 text-gray-500 transition-transform {treeOpen
										? ''
										: '-rotate-90'}"
								/>
								<span class="eyebrow shrink-0 text-gray-600">{t('inventory.whereThingsLive')}</span>
								<span class="truncate text-sm text-gray-900">{placeName}</span>
							</button>
							<button
								onclick={() => (organising = true)}
								class="icon-btn shrink-0 sm:hidden"
								title={t('inventory.categoriesAndAttributes')}
								aria-label={t('inventory.categories')}><Icon name="sliders" /></button
							>
							<button
								onclick={() => (addingLocation = true)}
								class="icon-btn shrink-0"
								title={t('inventory.newLocation')}
								aria-label={t('inventory.newLocation')}><Icon name="plus" /></button
							>
						</header>

						<div id="inventory-places" class={treeOpen ? '' : 'max-lg:hidden'}>
							<ul class="py-1">
								{@render locationRow(null, t('inventory.everything'), allowedItems.length)}
								{#each data.locationTree as root (root.id)}
									{@render branch(root, 0)}
								{/each}
								{#if unfiledCount > 0}
									{@render locationRow(0, t('app.notFiledAnywhere'), unfiledCount)}
								{/if}
							</ul>

							<p class="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
								{t('inventory.dragAThingOntoA')}
							</p>
						</div>
					</section>
				{/snippet}

				{#snippet right()}
					<div class="min-w-0 space-y-4 py-4 sm:px-4">
						{#if replenishItems.length > 0}
							<!-- No heading of its own: the tab above says which list this is,
							     and saying it twice is the room repeating itself. -->
							<div data-tour="inventory-list">
								{#each replenishByPlace as place (place.id)}
									{#if showPlaces}
										<!--
											The address, root down, the same string the panel shows —
											and the same fold. Pressing it puts the place away with
											everything under it, which is what the panel's chevron does
											to the tree; one state, so the two halves cannot disagree
											about what is open. "Not filed anywhere" is not a place and
											has nothing to fold.
										-->
										<h3
											class="mt-4 mb-2 flex items-center gap-2 text-sm text-gray-700 first:mt-0 max-sm:px-4"
										>
											{#if place.id === 0}
												<Icon name="shopping" class="size-4 shrink-0 text-gray-500" />
												<span class="font-medium">{place.label ?? t('app.notFiledAnywhere')}</span>
											{:else}
												<button
													type="button"
													class="flex min-h-8 items-center gap-2 text-left transition hover:text-gray-900"
													aria-expanded={!place.folded}
													title={place.folded
														? t('inventory.showWhatIsIn', {
																place: place.label ?? t('app.notFiledAnywhere')
															})
														: t('inventory.fold', {
																place: place.label ?? t('app.notFiledAnywhere')
															})}
													onclick={() => toggleFold(place.id)}
												>
													<Icon
														name="chevron-down"
														class="size-4 shrink-0 text-gray-500 transition-transform {place.folded
															? '-rotate-90'
															: ''}"
													/>
													<span class="font-medium">{place.label ?? t('app.notFiledAnywhere')}</span
													>
													{#if place.folded}
														<span class="tabular text-xs text-gray-500">{place.held}</span>
													{/if}
												</button>
											{/if}
										</h3>
									{/if}
									<!--
										Cards flow down columns rather than across a grid: a grid row is
										as tall as its tallest card, which left a short category holding
										hundreds of pixels of empty body beside a long one. A place with
										one category takes the whole width, rather than half of it beside
										nothing, and the columns only appear once there are cards to
										fill them.
									-->
									<div
										class="item-cards {columnsFor(place.categories) > 1
											? 'md:columns-2'
											: ''} {columnsFor(place.categories) > 2 ? '2xl:columns-3' : ''}"
									>
										{#each place.categories as category (category.name)}
											<section
												class="item-card mb-4 break-inside-avoid border border-gray-300 bg-white max-sm:border-x-0 sm:shadow-card"
											>
												<h4 class="border-b border-gray-200 px-4 py-2">
													{#if category.color}
														<span class="pill" style={pillStyle(category.color) ?? ''}
															>{category.name}</span
														>
													{:else}
														<span class="eyebrow text-gray-500">{category.name}</span>
													{/if}
												</h4>
												<div class="divide-y divide-gray-200">
													{#each category.items as item (item.id)}
														{@const globalIdx = shownItems.indexOf(item)}
														<!--
															What you have is washed blue and what you put away
															dimmed — see `itemRowWash`. Neither moves the row.
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
															class="row-card cursor-grab {itemRowWash(item)} {globalIdx ===
															selectedIndex
																? 'kb-cursor'
																: ''}"
														>
															<!--
																The row is a component, so a thing filed under a notebook is the
																same thing this room shows — its count, its price, its own fields
																and the recipes that use it. See `ItemRow`.
															-->
															<ItemRow
																{item}
																currency={data.currency}
																actions={ITEM_ROOM_ACTIONS}
																usedIn={data.usedIn[item.id] ?? []}
																{chipColor}
																onedit={() => startEdit(item)}
																onsubmit={tick(
																	item.type === 'someday' ? 'toggleBought' : 'toggleSnoozed'
																)}
																ondeletesubmit={(one) => deferDelete(one.id, one.name)}
																confirming={confirmingDelete === item.id}
																onconfirm={(id) => (confirmingDelete = id)}
																thumb={anyPictured}
															/>
														</div>
													{/each}
												</div>
											</section>
										{/each}
									</div>
								{/each}
							</div>
						{/if}

						{#if filteredItems.length === 0}
							<!-- Empty because there is nothing, or because the filters hid it:
							     saying the first when the second is true reads as a list
							     that lost things. -->
							{#if onThisTab.length === 0}
								<EmptyState
									icon="shopping"
									title={t('inventory.theListIsEmpty')}
									description={t('inventory.inventoryIsWhatYouKeep')}
								>
									{#snippet action()}
										<button onclick={openCreateForm} class="btn btn-primary">
											<Icon name="plus" />
											{t('inventory.newItem')}
										</button>
									{/snippet}
								</EmptyState>
							{:else}
								<EmptyState
									filtered
									onclear={narrowing ? clearFilters : undefined}
									description={t('inventory.nothingHereMatchesTheCurrent')}
								/>
							{/if}
						{/if}
					</div>
				{/snippet}
			</SplitColumns>

			<form
				method="POST"
				action="?/setLocationPanelWidth"
				class="hidden"
				bind:this={panelForm}
				use:enhance={() => async () => {}}
			>
				<input type="hidden" name="rem" value={panelRem} />
			</form>
		</div>
	</RoomSurface>
</div>

<!--
	A thing's attribute, drawn the way the rows draw it: a soft wash of the
	colour it was given, so a row of three reads as three facts rather than as
	three alarms, and the grey chip where it was given none.
-->
{#snippet attributeChip(text: string, color: string | null | undefined)}
	<span class="chip {color ? 'pill-soft' : ''} max-w-full" style={color ? `--pill:${color}` : ''}
		><span class="truncate">{text}</span></span
	>
{/snippet}

<!--
	The room's two managing screens, as two tabs of one dialog: the categories
	its things are filed under, and the attributes they describe themselves
	with. Both are vocabulary of the whole room, so one verb reaches both.

	Everything saves as it lands and every row manages itself, so there is no
	Save — the dialog's own × is the one way out.
-->
<Modal
	bind:open={organising}
	error={form?.message}
	title={t('inventory.categoriesAndAttributes')}
	size="md"
>
	<TabStrip
		nested
		label={t('inventory.categoriesAndAttributes')}
		tabs={[
			{
				label: t('inventory.categories'),
				icon: 'blocks',
				count: String(data.inventoryCategories.length)
			},
			{ label: t('inventory.attributes'), icon: 'sliders', count: String(data.attributes.length) }
		]}
		current={organiseTab === 'categories' ? 0 : 1}
		onpick={(index) => (organiseTab = index === 0 ? 'categories' : 'attributes')}
	/>

	{#if organiseTab === 'categories'}
		<!--
			Which categories hold food — the category decides what can be an
			ingredient, so this is the switch that makes recipes work — and the
			order and colour the cards are drawn in.
		-->
		<p class="mt-3 text-sm text-gray-500">{t('inventory.tickTheOnesThatHold')}</p>

		<div
			class="mt-3 flex items-center gap-3 border-b border-gray-200 pb-1 text-xs text-gray-500"
			aria-hidden="true"
		>
			<span class="flex-1">{t('ui.name')}</span>
			<span class="w-10 text-center">{t('inventory.foodColumn')}</span>
			{#if data.onFamilyPlan}<span class="w-10 text-center">{t('inventory.family2')}</span>{/if}
			<span class="invisible flex gap-1">
				{#each ORGANISE_ACTION_SLOTS as slot (slot)}<span class="icon-btn"></span>{/each}
			</span>
		</div>
		<ul class="divide-y divide-gray-200">
			{#each data.inventoryCategories as category, index (category.id)}
				<li class="flex min-h-12 items-center gap-3 py-2 text-sm text-gray-900">
					{#if editingCategory === category.id}
						<!-- The colour saves as it is let go of; the name with its tick. -->
						<form method="post" action="?/setCategoryColor" use:enhance class="flex gap-1">
							<input type="hidden" name="id" value={category.id} />
							<ColorWell
								name="color"
								value={category.color ?? NEUTRAL_WELL}
								label={t('inventory.aColourForThisCategory')}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>
							<button
								name="color"
								value=""
								class="icon-btn"
								disabled={!category.color}
								title={t('inventory.noColour')}
								aria-label={t('inventory.noColour')}><Icon name="close" /></button
							>
						</form>
						<form
							method="post"
							action="?/renameCategory"
							use:enhance={() =>
								async ({ update, result }) => {
									await update({ reset: false });
									if (result.type === 'success') editingCategory = null;
								}}
							class="flex min-w-0 flex-1 items-center gap-1"
						>
							<input type="hidden" name="id" value={category.id} />
							<OneLine
								name="name"
								value={category.name}
								ariaLabel={t('ui.name')}
								class="input input-sm min-w-0 flex-1"
								required
								autofocus
							/>
							<button
								class="icon-btn"
								title={t('inventory.saveTheName')}
								aria-label={t('inventory.saveTheName')}
							>
								<Icon name="check" />
							</button>
							<button
								type="button"
								class="icon-btn"
								title={t('inventory.keepTheOldName')}
								aria-label={t('inventory.keepTheOldName')}
								onclick={() => (editingCategory = null)}
							>
								<Icon name="undo" />
							</button>
						</form>
					{:else}
						<span class="min-w-0 flex-1">
							{#if category.color}
								<span class="pill max-w-full" style={pillStyle(category.color) ?? ''}
									><span class="truncate">{category.name}</span></span
								>
							{:else}
								<span class="break-words">{category.name}</span>
							{/if}
						</span>
						{#if category.mine}
							<form
								method="post"
								action="?/setCategoryFood"
								use:enhance={() =>
									async ({ update }) => {
										await update({ reset: false });
									}}
								class="flex w-10 justify-center"
							>
								<input type="hidden" name="id" value={category.id} />
								<input type="hidden" name="isFood" value={category.isFood ? 'false' : 'true'} />
								<!-- The name is for tests and tools that find the switch by what
								     it means; the value rides the hidden field beside it. -->
								<input
									type="checkbox"
									class="toggle"
									name="food"
									value={category.id}
									checked={category.isFood}
									aria-label={t('inventory.holdsFood', { name: category.name })}
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								/>
							</form>
							{#if data.onFamilyPlan}
								<form
									method="post"
									action="?/setCategoryShared"
									use:enhance={() =>
										async ({ update }) => {
											await update({ reset: false });
										}}
									class="flex w-10 justify-center"
								>
									<input type="hidden" name="id" value={category.id} />
									<input
										type="hidden"
										name="shared"
										value={category.sharedWithFamily ? 'false' : 'true'}
									/>
									<input
										type="checkbox"
										class="toggle"
										checked={category.sharedWithFamily}
										title={t('inventory.everybodyOnYourFamilyPlan')}
										aria-label={t('inventory.sharedWithFamily', { name: category.name })}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									/>
								</form>
							{/if}
							<!-- The buttons and the question that replaces them share one
							     cell, so asking moves nothing beside it. -->
							<div class="grid shrink-0 justify-items-end">
								{#if confirmDeleteCategory === category.id}
									<form
										method="post"
										action="?/deleteCategory"
										use:enhance={() =>
											async ({ update }) => {
												confirmDeleteCategory = null;
												await update({ reset: false });
											}}
										class="flex items-center justify-end gap-1 [grid-area:1/1]"
									>
										<input type="hidden" name="id" value={category.id} />
										<button
											type="button"
											class="btn btn-sm"
											onclick={() => (confirmDeleteCategory = null)}
										>
											{t('inventory.keep')}
										</button>
										<!-- Its items stay, unfiled — the shelf label goes, not the shelf. -->
										<button class="btn btn-danger btn-sm" use:armed>{t('ui.delete')}</button>
									</form>
								{/if}
								<div
									class="flex items-center justify-end gap-1 [grid-area:1/1] {confirmDeleteCategory ===
									category.id
										? 'invisible'
										: ''}"
									inert={confirmDeleteCategory === category.id}
								>
									{#each [-1, 1] as const as delta (delta)}
										<form method="post" action="?/moveCategory" use:enhance>
											<input type="hidden" name="id" value={category.id} />
											<input type="hidden" name="delta" value={delta} />
											<button
												class="icon-btn"
												disabled={delta < 0
													? index === 0
													: index === data.inventoryCategories.length - 1}
												title={delta < 0 ? t('inventory.moveUp') : t('inventory.moveDown')}
												aria-label={delta < 0
													? t('inventory.moveUpNamed', { name: category.name })
													: t('inventory.moveDownNamed', { name: category.name })}
											>
												<Icon name={delta < 0 ? 'chevron-up' : 'chevron-down'} />
											</button>
										</form>
									{/each}
									<button
										type="button"
										class="icon-btn"
										title={t('ui.edit')}
										aria-label={t('inventory.rename', { name: category.name })}
										onclick={() => (editingCategory = category.id)}
									>
										<Icon name="edit" />
									</button>
									<button
										type="button"
										class="icon-btn icon-btn-danger"
										title={t('ui.delete')}
										aria-label={t('inventory.delete', { name: category.name })}
										onclick={() => (confirmDeleteCategory = category.id)}
									>
										<Icon name="trash" />
									</button>
								</div>
							</div>
						{:else}
							<!-- A shelf shared into this list: fill it, but its switches
							     belong to whoever owns it. -->
							<span class="eyebrow shrink-0 text-gray-500">{t('inventory.family')}</span>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>

		<!-- Its own form and its own button: making a category and saying which
		     categories hold food are two acts, and one Save cannot mean both. -->
		<div class="mt-3 border-t border-gray-200 pt-3">
			{#if addingCategory}
				<form
					method="post"
					action="?/createCategory"
					use:enhance={() =>
						async ({ update, result }) => {
							await update({ reset: result.type === 'success' });
							if (result.type === 'success') addingCategory = false;
						}}
					class="flex flex-wrap items-center gap-2"
				>
					<OneLine
						name="label"
						placeholder={t('inventory.frozen')}
						ariaLabel={t('inventory.newCategory')}
						class="input input-sm min-w-40 flex-1"
						required
						autofocus
					/>
					<label class="flex items-center gap-2 text-sm text-gray-600">
						<input type="checkbox" class="toggle" name="isFood" value="true" />
						{t('inventory.itHoldsFood')}
					</label>
					<button type="button" class="btn btn-sm" onclick={() => (addingCategory = false)}>
						{t('ui.cancel')}
					</button>
					<button class="btn btn-primary btn-sm">{t('inventory.addTheCategory')}</button>
				</form>
			{:else}
				<button onclick={() => (addingCategory = true)} class="btn btn-sm">
					<Icon name="plus" />
					{t('inventory.newCategory')}
				</button>
			{/if}
		</div>
	{:else}
		<!--
			Everything the things say about themselves, in one place.

			An attribute is not a row — it is a name somebody typed into an item —
			which is the point, and also why this screen has to exist: nothing else
			can merge "Colour" with "colour", say what values `length` actually
			takes, or give one of them a colour to read a list by.
		-->
		<p class="mt-3 text-sm text-gray-500">{t('inventory.whatYourThingsSayAbout')}</p>
		{#if data.attributes.length === 0}
			<EmptyState icon="tag" title={t('inventory.nothingSaysAnythingYet')} compact />
		{:else}
			<ul class="mt-3 divide-y divide-gray-200 border-t border-gray-200">
				{#each data.attributes as attribute (attribute.key)}
					<li class="py-2">
						{@render vocabRow({
							key: attribute.key,
							value: null,
							text: attribute.key,
							color: attribute.color,
							count: attribute.count
						})}
						<!-- What it is actually set to, which is the half a list of names
						     cannot answer. -->
						<ul class="mt-1 ml-3 border-l border-gray-200 pl-3">
							{#each attribute.values as one (one.value)}
								<li>
									{@render vocabRow({
										key: attribute.key,
										value: one.value,
										text: one.value || t('inventory.noValue'),
										color: one.color ?? attribute.color,
										count: one.count
									})}
								</li>
							{/each}
						</ul>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</Modal>

<!--
	One attribute, or one of its values: `chip ——— count · edit · delete`, the
	same columns at both levels so the buttons stand in one line down the list.
	Editing it is its name and its colour in place.
-->
{#snippet vocabRow(row: {
	key: string;
	value: string | null;
	text: string;
	color: string | null;
	count: number;
})}
	{@const id = row.value === null ? row.key : `${row.key}\u0000${row.value}`}
	<div class="relative flex min-h-10 items-center gap-2 text-sm">
		{#if editingVocab === id}
			<form method="post" action="?/setAttributeColor" use:enhance class="flex gap-1">
				<input type="hidden" name="key" value={row.key} />
				<input type="hidden" name="value" value={row.value ?? ''} />
				<ColorWell
					name="color"
					value={row.color ?? NEUTRAL_WELL}
					label={row.value === null
						? t('inventory.aColourForThisAttribute')
						: t('inventory.aColourForThisValue')}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				/>
				<button
					name="color"
					value=""
					class="icon-btn"
					disabled={!row.color}
					title={t('inventory.noColour')}
					aria-label={t('inventory.noColour')}><Icon name="close" /></button
				>
			</form>
			<form
				method="post"
				action={row.value === null ? '?/renameAttribute' : '?/renameAttributeValue'}
				use:enhance={() =>
					async ({ update, result }) => {
						await update({ reset: false });
						if (result.type === 'success') editingVocab = null;
					}}
				class="flex min-w-0 flex-1 items-center gap-1"
			>
				{#if row.value === null}
					<input type="hidden" name="from" value={row.key} />
				{:else}
					<input type="hidden" name="key" value={row.key} />
					<input type="hidden" name="from" value={row.value} />
				{/if}
				<OneLine
					name="to"
					value={row.value ?? row.key}
					ariaLabel={t('ui.name')}
					class="input input-sm min-w-0 flex-1"
					required={row.value === null}
					autofocus
				/>
				<button class="icon-btn" title={t('ui.save')} aria-label={t('ui.save')}>
					<Icon name="check" />
				</button>
				<button
					type="button"
					class="icon-btn"
					title={t('ui.cancel')}
					aria-label={t('ui.cancel')}
					onclick={() => (editingVocab = null)}><Icon name="undo" /></button
				>
			</form>
		{:else}
			<span class="min-w-0 flex-1">{@render attributeChip(row.text, row.color)}</span>
			<span class="tabular w-8 shrink-0 text-right text-xs text-gray-500">{row.count}</span>
			<!-- The question lies over the count and the buttons rather than
			     taking room of its own, so asking moves nothing on the row. -->
			{#if confirmRemoveVocab === id}
				<form
					method="post"
					action={row.value === null ? '?/removeAttribute' : '?/removeAttributeValue'}
					use:enhance={() =>
						async ({ update }) => {
							confirmRemoveVocab = null;
							await update({ reset: false });
						}}
					class="absolute inset-y-0 right-0 flex items-center gap-1 bg-white pl-2"
				>
					<input type="hidden" name="key" value={row.key} />
					{#if row.value !== null}<input type="hidden" name="value" value={row.value} />{/if}
					<button type="button" class="btn btn-sm" onclick={() => (confirmRemoveVocab = null)}
						>{t('inventory.keep')}</button
					>
					<button class="btn btn-danger btn-sm" use:armed>{t('ui.remove')}</button>
				</form>
			{/if}
			<div class="flex shrink-0 items-center gap-1" inert={confirmRemoveVocab === id}>
				<button
					class="icon-btn"
					title={row.value === null
						? t('inventory.renameThisAttribute')
						: t('inventory.renameThisValue')}
					aria-label={row.value === null
						? t('inventory.renameThisAttribute')
						: t('inventory.renameThisValue')}
					onclick={() => (editingVocab = id)}><Icon name="edit" /></button
				>
				<button
					class="icon-btn icon-btn-danger"
					title={row.value === null
						? t('inventory.takeThisAttributeOffEverything')
						: t('inventory.takeThisValueOffEverything')}
					aria-label={row.value === null
						? t('inventory.takeThisAttributeOffEverything')
						: t('inventory.takeThisValueOffEverything')}
					onclick={() => (confirmRemoveVocab = id)}><Icon name="trash" /></button
				>
			</div>
		{/if}
	</div>
{/snippet}

<!--
	The trip, as a list you tick in the shop: what has run low and how much of
	it, then the someday list under the total rather than in it — what you would
	buy if the trip went well, not what you came for. One row drawing for both.

	A modal on a desktop and the app's own sheet on a phone, which is what
	`Modal` already is down there — this is a thing you hold up in a shop, so
	it takes the whole screen where the screen is small.
-->
{#snippet tripRow(row: {
	id: number;
	name: string;
	detail: string | null;
	needed: number | null;
	cents: number | null;
	ticked: boolean;
	action: string;
	qty: number | null;
	enhanced: SubmitFunction;
})}
	<li class="list-row">
		<form method="POST" action={row.action} use:enhance={row.enhanced} class="row-rail">
			<input type="hidden" name="id" value={row.id} />
			{#if row.qty !== null}<input type="hidden" name="qty" value={row.qty} />{/if}
			<button
				type="submit"
				aria-pressed={row.ticked}
				class="-m-1 flex p-1 pointer-coarse:w-11 pointer-coarse:justify-center"
				title={row.ticked ? t('inventory.putBackOnTheList') : t('tasks.plan.gotIt')}
				aria-label="{row.ticked
					? t('inventory.putBackOnTheList')
					: t('tasks.plan.gotIt')}: {row.name}"
			>
				<TickBox done={row.ticked} />
			</button>
		</form>
		<p class="list-row-main text-sm {row.ticked ? 'text-gray-500 line-through' : 'text-gray-900'}">
			{#if row.needed !== null}<span class="tabular text-gray-500">{row.needed}×</span>{/if}
			<span class="font-medium">{row.name}</span>
			{#if row.detail}<span class="ml-1 text-xs text-gray-500">{row.detail}</span>{/if}
		</p>
		<!-- "about", because a last known price is not a price. -->
		<span class="tabular shrink-0 text-right text-sm text-gray-600">
			{#if row.cents === null}
				<span class="text-xs text-gray-500">{t('inventory.noPriceYet')}</span>
			{:else}
				{formatMoney(row.cents, data.currency)}
			{/if}
		</span>
	</li>
{/snippet}

<Modal bind:open={shopping} title={t('inventory.shoppingList')} size="md">
	{#if tripLines.length === 0 && tripWishes.length === 0}
		<EmptyState
			icon="shopping"
			title={t('inventory.nothingHasRunLow')}
			description={t('inventory.anItemJoinsThisList')}
			compact
		/>
	{:else}
		{#if tripLines.length > 0}
			<ul class="-mx-4 -mt-4 divide-y divide-gray-200 border-b border-gray-200 sm:-mx-5">
				{#each tripLines as line (line.id)}
					{@const item = items.find((one) => one.id === line.id)}
					{@const ticked = line.id in basket}
					{@const was = item?.qty ?? 0}
					{@render tripRow({
						id: line.id,
						name: line.name,
						detail: line.category,
						needed: line.needed,
						cents: line.lineCents,
						ticked,
						action: '?/setQty',
						qty: ticked ? basket[line.id] : Math.max(item?.idealQty ?? 0, was),
						enhanced: tripTick(
							line.id,
							ticked ? basket[line.id] : Math.max(item?.idealQty ?? 0, was),
							was
						)
					})}
				{/each}
			</ul>

			<p class="mt-3 flex items-baseline justify-between gap-3 text-sm">
				<span class="font-semibold text-gray-900">{t('inventory.about')}</span>
				<span class="tabular text-lg font-bold text-gray-900"
					>{formatMoney(data.run.totalCents, data.currency)}</span
				>
			</p>
			{#if data.run.unpriced > 0}
				<p class="text-xs text-gray-500">
					{t('inventory.noPriceYetSo', {
						unpriced: data.run.unpriced,
						have: data.run.unpriced === 1 ? t('inventory.lineHas') : t('inventory.linesHave')
					})}
				</p>
			{/if}
		{/if}

		{#if tripWishes.length > 0}
			<h3 class="eyebrow mt-6 mb-2 text-gray-500">{t('inventory.ifTheTripGoesWell')}</h3>
			<ul class="-mx-4 divide-y divide-gray-200 border-y border-gray-200 sm:-mx-5">
				{#each tripWishes as want (want.id)}
					{@render tripRow({
						id: want.id,
						name: want.name,
						detail: want.notes || null,
						needed: null,
						cents: want.priceCents,
						ticked: wishInBasket(want.id),
						action: '?/toggleBought',
						qty: null,
						enhanced: tick('toggleBought')
					})}
				{/each}
			</ul>
		{/if}
	{/if}
</Modal>

<!-- A location, new or being changed. -->
<Modal
	open={addingLocation || editingLocation !== null}
	onclose={() => {
		addingLocation = false;
		editingLocation = null;
	}}
	error={form?.message}
	title={editingLocation ? t('inventory.renameOrMove') : t('inventory.newLocation')}
	description={t('inventory.aRoomACupboardA')}
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
			<Field label={t('ui.name')} span={12} required>
				<OneLine
					name="heading"
					required
					value={editingLocation?.name ?? ''}
					placeholder={t('inventory.whiteChest')}
				/>
			</Field>
			<Field label={t('inventory.inside')} span={12} hint={t('inventory.leaveEmptyForARoom')}>
				<select name="parentId" class="select">
					<option value="">{t('inventory.nothingItIsTop')}</option>
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
			}}>{t('ui.cancel')}</button
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
	title={t('inventory.removeThisLocation')}
	description={t('inventory.whateverIsInsideItMoves')}
	size="sm"
>
	<p class="text-sm text-gray-500">
		{t('inventory.nothingIsThrownAwayThis')}
	</p>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmDeleteLocation = null)}
			>{t('ui.cancel')}</button
		>
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
			<button class="btn btn-danger" use:armed>{t('inventory.yesRemoveIt')}</button>
		</form>
	{/snippet}
</Modal>

<style>
	/*
	 * On a phone a card runs edge to edge, as the task list's rows do, and a
	 * corner needs somewhere to be a corner: the playful style's rounding of
	 * every section is taken back there.
	 */
	@media (max-width: 639.98px) {
		:global(html[data-style='playful']) .item-card {
			border-radius: 0;
		}
	}

	/* The house is one of the surface's panes, never a card of its own. */
	:global(html[data-style='playful']) .place-panel {
		border-radius: 0;
	}
</style>
