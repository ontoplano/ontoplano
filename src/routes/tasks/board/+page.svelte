<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import TodoFields from '$lib/components/fields/TodoFields.svelte';
	import PeriodNav from '$lib/components/PeriodNav.svelte';
	import PickOne from '$lib/components/PickOne.svelte';
	import Swatch from '$lib/components/Swatch.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { resolve } from '$app/paths';
	import OneLine from '$lib/components/OneLine.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import Written from '$lib/components/Written.svelte';
	import { enhance } from '$app/forms';
	import { armed } from '$lib/actions/armed';
	import { submitLock } from '$lib/submitting.svelte';
	import { focusHere } from '$lib/actions/autofocus';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';
	import RatingBadges from '$lib/components/RatingBadges.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Backlinks from '$lib/components/Backlinks.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import { formatDuration } from '$lib/duration';
	import RatingPicker from '$lib/components/RatingPicker.svelte';
	import { RATINGS, type Rating } from '$lib/ratings.js';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { CLOSED_STATUSES, STATUSES, STATUS_LABELS, type Status } from '$lib/task-status.js';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { cancelFor, changeNow, isPending } from '$lib/undo.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Card = PageServerData['todayCards'][number];

	let tab: 'today' | 'general' = $state('today');
	let maxEnergy: number | null = $state(null);
	let sortBy: 'default' | Rating = $state('default');
	let showDone = $state(false);

	// Keyboard focus is a (column, row) pair rather than a flat index, because
	// the board is two-dimensional and hjkl has to mean the same thing here as
	// it does everywhere else in the app.
	let focusCol = $state(0);
	let focusRow = $state(0);
	let showForm = $state(false);
	let formRatings: Record<string, number | null> = $state({
		urgency: null,
		interest: null,
		energy: null
	});

	/** How many of the folded-away ratings currently carry a value. */

	/**
	 * The card being edited.
	 *
	 * This is what Track was: an occurrence's time, its length, what it actually
	 * turned out to be, and what to call this one. Same object as the card on the
	 * board, so it is the same card's editor rather than a second page.
	 */
	let editing: Card | null = $state(null);
	let editRatings: Record<string, number | null> = $state({
		urgency: null,
		interest: null,
		energy: null
	});
	const editRatingsSet = $derived(Object.values(editRatings).filter((v) => v !== null).length);

	/*
	 * Opened once the press that asked for it has finished.
	 *
	 * A modal put over the board mid-press made the browser deliver that same
	 * press again, to whatever was under it afterwards — which is the card,
	 * whose own handler opens it in place. So Edit opened the editor and the
	 * card at once, and the next press went to the wrong one of the two. See
	 * `$lib/after-press`.
	 */
	function openEditor(card: Card) {
		editing = card;
		editRatings = { ...card.ratings };
	}

	/** A finished block that only ever named a category still owes an answer. */
	function needsResolution(card: Card): boolean {
		return (
			card.kind === 'instance' &&
			card.mode === 'category' &&
			card.status === 'done' &&
			!card.activityId
		);
	}

	/**
	 * How the day adds up, by category.
	 *
	 * The one thing the tracker showed that a column of cards does not: where
	 * the hours went.
	 */
	const dayTotals = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built, read once and thrown away inside this function; nothing tracks it.
		const totals = new Map<string, { color: string; minutes: number }>();

		for (const card of data.todayCards) {
			const name = card.categoryName;
			if (!name) continue;
			const current = totals.get(name) ?? {
				color: card.categoryColor ?? CATEGORY_FALLBACK_COLOR,
				minutes: 0
			};
			current.minutes += card.durationMinutes;
			totals.set(name, current);
		}

		return [...totals.entries()].map(([name, v]) => ({ name, ...v }));
	});
	let confirmingDelete: string | null = $state(null);
	/* One press, one card — see `$lib/submitting`. */
	const sending = submitLock();
	let dragging: Card | null = $state(null);
	let dragOverColumn: Status | null = $state(null);
	let railOver = $state(false);

	const cards = $derived(tab === 'today' ? data.todayCards : data.generalCards);
	/**
	 * The rail beside Today always shows the todo list, whatever the tab.
	 *
	 * Open ones only. The General tab sorts every undated todo into its status
	 * column, where a finished one belongs under Done; the rail is a single
	 * list with no column to put it in, so everything ever ticked off sat in it
	 * forever — a todo list that only grows is not a todo list.
	 */
	const railCards = $derived(data.generalCards.filter((c) => !CLOSED_STATUSES.includes(c.status)));

	/** Folded until asked for, at every width. */
	let filtersOpen = $state(false);

	/**
	 * Which column a card is drawn in right now.
	 *
	 * A tick is held for the undo window rather than sent, so between the tap and
	 * the write there is nothing on the server to read. Derived rather than
	 * written onto the card, because Undo has to put it back where it was and a
	 * mutation would have already lost that.
	 */
	function shownStatus(card: Card): Status {
		return isPending(card.uid) ? 'done' : card.status;
	}

	function visible(status: Status): Card[] {
		let out = cards.filter((c) => shownStatus(c) === status);

		// An unrated card is never hidden: the filter is for choosing among what
		// you have described, not for burying what you have not.
		if (maxEnergy !== null) {
			out = out.filter((c) => c.ratings.energy === null || c.ratings.energy <= maxEnergy!);
		}

		if (sortBy === 'default') {
			return [...out].sort((a, b) => {
				// Scheduled work keeps clock order; loose todos follow in their own.
				if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
				if (a.startTime) return -1;
				if (b.startTime) return 1;
				return a.sortOrder - b.sortOrder;
			});
		}

		const key: Rating = sortBy;
		const ascending = key === 'energy';
		return [...out].sort((a, b) => {
			const av = a.ratings[key];
			const bv = b.ratings[key];
			if (av === null && bv === null) return a.sortOrder - b.sortOrder;
			if (av === null) return 1;
			if (bv === null) return -1;
			return ascending ? av - bv : bv - av;
		});
	}

	const columns = $derived(
		STATUSES.filter((s) => showDone || s !== 'skipped').map((status) => ({
			status,
			cards: visible(status)
		}))
	);

	/**
	 * On a phone the board slides sideways.
	 *
	 * A board is columns; one column at a time is a list with a tab strip, and
	 * moving a card between two things you cannot see at once is a gesture
	 * nobody can aim. The columns are side by side now and the strip snaps, so
	 * a drag can carry a card to the edge and the strip follows it.
	 *
	 * Each column is most of the screen wide rather than all of it: the sliver
	 * of the next one is what says there is a next one.
	 */
	let strip: HTMLElement | undefined = $state();

	/** Which column the strip is showing, for the names above it. */
	let phoneColumn: Status = $state('todo');

	// Hiding Skipped while it is the one on screen would leave a blank board.
	$effect(() => {
		if (!columns.some((c) => c.status === phoneColumn)) phoneColumn = 'todo';
	});

	/** Bring a column into view, from the names above or after a drop. */
	function showColumn(status: Status) {
		phoneColumn = status;
		const at = columns.findIndex((c) => c.status === status);
		const child = strip?.children[at] as HTMLElement | undefined;
		child?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
	}

	/**
	 * …and the other direction: the strip tells the names where it got to.
	 *
	 * Pressing a name scrolled the strip, and that was the only thing that ever
	 * moved `phoneColumn` — so swiping the board, which is how anybody actually
	 * changes column on a phone, left the strip showing Done while "Pending"
	 * was still lit above it. A control that lies about what is on screen is
	 * worse than no control.
	 *
	 * Whichever column's left edge is nearest the scroll position wins, rather
	 * than arithmetic on a column width: the columns are a percentage of the
	 * screen with a gap between them, and the last one stops short because the
	 * strip runs out. Measuring where they actually are cannot drift from that.
	 */
	function followScroll() {
		if (!strip) return;
		const children = [...strip.children] as HTMLElement[];
		if (children.length === 0) return;

		const from = strip.getBoundingClientRect().left;
		let closest = 0;
		let best = Infinity;
		children.forEach((child, i) => {
			const off = Math.abs(child.getBoundingClientRect().left - from);
			if (off < best) {
				best = off;
				closest = i;
			}
		});

		const status = columns[closest]?.status;
		if (status && status !== phoneColumn) phoneColumn = status;
	}

	/**
	 * A card carried to the edge takes the board with it.
	 *
	 * Without this the only way to reach the far column mid-drag is to let go,
	 * scroll, and pick the card up again — which is not a gesture, it is three.
	 * The zone is a thumb's width and the step is one frame's worth.
	 */
	const EDGE_ZONE = 56;
	const EDGE_STEP = 18;
	function scrollAtEdge(event: DragEvent) {
		if (!strip) return;
		const box = strip.getBoundingClientRect();
		if (event.clientX < box.left + EDGE_ZONE) strip.scrollLeft -= EDGE_STEP;
		else if (event.clientX > box.right - EDGE_ZONE) strip.scrollLeft += EDGE_STEP;
	}

	const focusedCard = $derived(columns[focusCol]?.cards[focusRow] ?? null);

	function post(action: string, fields: Record<string, string | string[]>) {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) {
			if (Array.isArray(v)) v.forEach((one) => body.append(k, one));
			else body.set(k, v);
		}
		// SvelteKit names an action with `?/name`, or `&/name` when the URL already
		// carries query parameters — the board always does once you page to
		// another day.
		const query = location.search ? `${location.search}&/${action}` : `?/${action}`;
		return fetch(`${location.pathname}${query}`, {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
	}

	/**
	 * The same thing as a drag, for a finger.
	 *
	 * HTML5 drag-and-drop does not exist on a touch screen, so a phone had no
	 * way at all to move a card between columns — the one thing this room is
	 * for. Pressing a card's grip arms it and the next press on a column places
	 * it, which is the gesture the planner's todo rail already uses. It works
	 * with a mouse too, which is one behaviour fewer to explain.
	 */
	let movingUid: string | null = $state(null);
	const moving = $derived(
		columns.flatMap((c) => c.cards).find((card) => card.uid === movingUid) ??
			railCards.find((card) => card.uid === movingUid) ??
			null
	);

	function placeIn(status: Status) {
		const card = moving;
		movingUid = null;
		if (card) void move(card, status);
	}

	/**
	 * Which cards are unfolded to show what is written on them.
	 *
	 * A card says its title and nothing else, and the only way to read the
	 * notes under it was to open the form that edits it — on a phone and on a
	 * desktop alike. Pressing the card reads it; the pencil beside it edits it.
	 */
	let openCards = $state(new SvelteSet<string>());

	function readCard(card: Card) {
		console.log('READ CARD', card.title);
		if (openCards.has(card.uid)) openCards.delete(card.uid);
		else openCards.add(card.uid);
	}

	async function move(card: Card, status: Status) {
		// A second tick inside the window is the same gesture as pressing Undo.
		if (isPending(card.uid)) {
			cancelFor(card.uid);
			return;
		}
		if (card.status === status) return;

		const send = async () => {
			await post('setStatus', { kind: card.kind, id: String(card.id), status });
			await refresh();
		};

		/*
		 * Answering for a thing is the move worth a few seconds to take back.
		 *
		 * Both answers, not only the good one. Skipping was the one without a net
		 * and it is the more expensive mistake: "done" pressed by accident is a
		 * tick you can untick, and "skipped" pressed by accident is a week that
		 * now says you did not do something you did.
		 */
		if (status === 'done' || status === 'skipped') {
			const said = status === 'done' ? 'Completed' : 'Skipped';
			// Written now; Undo writes it back to todo. Held requests made the
			// card and the rest of the board disagree for the length of a toast.
			changeNow(
				card.uid,
				`${said} ${card.title}`,
				() => send(),
				async () => {
					await post('setStatus', { kind: card.kind, id: String(card.id), status: 'todo' });
					await refresh();
				}
			);
			return;
		}

		// Optimistic: the card jumps immediately and the load re-runs behind it.
		card.status = status;
		await send();
	}

	/**
	 * A todo dragged onto a day stops being a todo: it becomes a real block with
	 * a time, which is what puts it on the grid, in the tracker, and against a
	 * goal. Dragging a one-off back undoes exactly that.
	 */
	async function promote(card: Card, date: string, status: Status) {
		if (card.kind !== 'todo') return;
		await post('promote', { id: String(card.id), date, status });
		await refresh();
	}

	async function demote(card: Card) {
		if (card.kind !== 'instance') return;
		await post('demote', { id: String(card.id) });
		await refresh();
	}

	async function reorder(status: Status, orderedIds: number[]) {
		if (orderedIds.length === 0) return;
		await post('reorder', { todoId: orderedIds.map(String) });
		await refresh();
	}

	function refresh() {
		return goto(resolve(`/tasks/board?date=${data.date}`), {
			invalidateAll: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function onDragStart(card: Card, e: DragEvent) {
		dragging = card;
		e.dataTransfer?.setData('text/plain', card.uid);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onDragEnd() {
		dragging = null;
		dragOverColumn = null;
		railOver = false;
	}

	/** Dropping a scheduled one-off back on the rail turns it into a todo again. */
	async function onDropInRail(e: DragEvent) {
		e.preventDefault();
		const card = dragging;
		railOver = false;
		dragging = null;
		if (card?.kind === 'instance') await demote(card);
	}

	async function onDropInColumn(status: Status, e: DragEvent) {
		e.preventDefault();
		const card = dragging;
		dragOverColumn = null;
		dragging = null;
		if (!card) return;

		// A todo landing in a day column becomes a scheduled task in that column,
		// in one gesture.
		if (card.kind === 'todo') {
			await promote(card, data.date, status);
			return;
		}
		await move(card, status);
	}

	/** Drop onto a specific card: same column means reorder, else it is a move. */
	async function onDropOnCard(target: Card, status: Status, e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		const card = dragging;
		dragging = null;
		dragOverColumn = null;
		if (!card || card.uid === target.uid) return;

		if (card.status !== status) {
			await move(card, status);
			return;
		}

		// Only todos carry a position. An occurrence's place in the column is its
		// time of day, and a drag must not put the board and the calendar into
		// disagreement about the same task.
		if (card.kind !== 'todo') return;

		const todos = visible(status).filter((c) => c.kind === 'todo');
		const ids = todos.map((c) => c.id).filter((id) => id !== card.id);
		const at = todos.findIndex((c) => c.uid === target.uid);
		ids.splice(at === -1 ? ids.length : at, 0, card.id);
		await reorder(status, ids);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			showForm = false;
			editing = null;
			confirmingDelete = null;
			return;
		}

		// While a card is asking whether to delete it, the keyboard belongs to
		// that question. Without this, Enter would answer it *and* open the
		// editor behind it, because both read the same keystroke.
		if (confirmingDelete) return;

		// Every other key answers to the registry in $lib/shortcuts.ts — the
		// binding lives there, only the behaviour lives here.
		const action = getAction('/tasks/board', e.key);
		if (!action) return;

		switch (action) {
			case 'edit': {
				const card = columns[focusCol]?.cards[focusRow];
				if (!card) return;
				e.preventDefault();
				openEditor(card);
				return;
			}
			case 'new':
				e.preventDefault();
				openForm();
				return;
			case 'switch-tab':
				e.preventDefault();
				tab = tab === 'today' ? 'general' : 'today';
				focusRow = 0;
				return;
			case 'prev-column':
			case 'next-column': {
				e.preventDefault();
				const next = action === 'next-column' ? focusCol + 1 : focusCol - 1;
				focusCol = Math.min(Math.max(next, 0), columns.length - 1);
				focusRow = Math.min(focusRow, Math.max(columns[focusCol].cards.length - 1, 0));
				return;
			}
			case 'next-card':
			case 'prev-card': {
				e.preventDefault();
				const len = columns[focusCol]?.cards.length ?? 0;
				if (len === 0) return;
				focusRow = Math.min(Math.max(focusRow + (action === 'next-card' ? 1 : -1), 0), len - 1);
				return;
			}
		}

		const card = focusedCard;
		if (!card) return;

		switch (action) {
			// Carrying the focused card to the neighbouring column is the
			// keyboard's version of a drag.
			case 'carry-left':
			case 'carry-right': {
				e.preventDefault();
				const delta = action === 'carry-right' ? 1 : -1;
				const target = columns[focusCol + delta];
				if (target) {
					move(card, target.status);
					focusCol += delta;
					focusRow = 0;
				}
				return;
			}
			case 'rate': {
				e.preventDefault();
				// Cycles urgency by default; interest and energy sit behind u/i/y.
				const value = Number(e.key);
				post('setRatings', {
					kind: card.kind,
					id: String(card.id),
					[ratingKey]: String(value)
				}).then(refresh);
				return;
			}
			case 'rate-urgency':
			case 'rate-interest':
			case 'rate-energy':
				e.preventDefault();
				ratingKey =
					action === 'rate-urgency'
						? 'urgency'
						: action === 'rate-interest'
							? 'interest'
							: 'energy';
				return;
			case 'toggle-done':
				e.preventDefault();
				move(card, card.status === 'done' ? 'todo' : 'done');
				return;
			case 'toggle-today':
				e.preventDefault();
				if (card.kind === 'todo') promote(card, data.date, card.status);
				else demote(card);
				return;
			case 'delete':
				if (card.kind !== 'todo') return;
				e.preventDefault();
				// Arms the card's confirmation; the delete itself is a click, and that
				// button ignores the first moments after it appears.
				confirmingDelete = card.uid;
				return;
		}
	}

	/** Which rating the number keys write to; switched with u / i / y. */
	let ratingKey: Rating = $state('urgency');

	function openForm() {
		showForm = true;
		formRatings = { urgency: null, interest: null, energy: null };
		tick();
	}

	function shiftDay(days: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built, read once and thrown away inside this function; nothing tracks it.
		const d = new Date(data.date + 'T00:00:00');
		d.setDate(d.getDate() + days);
		const pad = (n: number) => String(n).padStart(2, '0');
		goto(
			resolve(`/tasks/board?date=${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
		);
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('home.newCard'),
		run: openForm,
		kbd: keyFor('/tasks/board', 'new')
	}));
</script>

{#snippet opened(card: Card)}
	<!--
		What a card says when it is opened, wherever it is sitting.

		This was written out twice — once for a column card and once for the
		to-do rail — and the two had already drifted: the rail left out the
		goals, so the same card said different things depending on where you
		found it. Reading a card ought to be the same act either way.

		A wash rather than a rule: a `border-t` across a card with rounded
		corners draws a line stopping short of both edges, which reads as
		something gone wrong. The words take the card's own ink, because its
		ground is its category's colour and no fixed grey is legible on all of
		them.
	-->
	<div class="card-opened mt-1.5 rounded px-2 py-1.5">
		{#if card.notes}
			<Written content={card.notes} compact inheritInk />
		{:else}
			<p class="text-xs italic opacity-75">{t('tasks.board.nothingWrittenOnThisOne')}</p>
		{/if}
		{#each card.goals as goal (goal.id)}
			<p class="mt-1 flex items-center gap-1 text-xs opacity-75">
				<Icon name="goals" size={11} />
				{goal.title}
			</p>
		{/each}
	</div>
{/snippet}

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<FormError message={form?.message} />

	<!--
		The same order the plan has, because it is the same room: where you are
		first, then what shape you are looking at it in.
	-->
	{#if tab === 'today'}
		<PeriodNav
			unit={t('tasks.plan.day')}
			atNow={data.date === data.today}
			onprev={() => shiftDay(-1)}
			onnext={() => shiftDay(1)}
			onnow={() => goto(resolve('/tasks/board'))}
		>
			<span class="tabular text-sm text-gray-600">
				{data.date === data.today ? 'Today' : data.date}
			</span>
		</PeriodNav>
	{/if}

	<RoomToolbar>
		{#snippet tools()}
			<!-- Today against To-do is a choice of shape, exactly as Day/Week/
			     Month is on the plan — so it is the same control, and it sits
			     under the day it is about rather than across the row from it. -->
			<div class="seg" role="group" aria-label={t('tasks.board.whatToShow')} data-tour="board-tabs">
				{#each [{ v: 'today', l: 'Today' }, { v: 'general', l: 'To-do' }] as t (t.v)}
					<button
						onclick={() => {
							tab = t.v as typeof tab;
							focusRow = 0;
						}}
						aria-pressed={tab === t.v}>{t.l}</button
					>
				{/each}
			</div>

			<!--
				Sort, energy and the rest, in a dialog rather than in the page.

				They used to unfold into a row above the columns, which pushed the
				whole board down the moment you pressed the button — and pushed it
				back up when you were done, so the card you were reaching for was
				somewhere else both times. A filter is something you go and
				change; it is not something to look at while you work, and it is
				not worth a board that moves. The button also keeps one word at
				both states, because a control that renames itself is a control
				that changes width under the pointer.
			-->
			<button
				onclick={() => (filtersOpen = true)}
				class="btn btn-sm ml-auto"
				aria-haspopup="dialog"
				aria-expanded={filtersOpen}
				data-tour="board-ratings"
			>
				{t('tasks.board.filters')}
			</button>
		{/snippet}
	</RoomToolbar>

	<Modal bind:open={filtersOpen} title={t('tasks.board.filters')} size="sm">
		<div class="space-y-4 text-sm">
			<div class="flex flex-wrap items-center gap-1">
				<span class="eyebrow mr-1 text-gray-600">{t('tasks.board.sort')}</span>
				{#each [{ v: 'default', l: 'Default' }, { v: 'urgency', l: 'Urgency' }, { v: 'interest', l: 'Interest' }, { v: 'energy', l: 'Energy' }] as opt (opt.v)}
					<button
						onclick={() => (sortBy = opt.v as typeof sortBy)}
						class="border px-2 py-0.5 text-xs {sortBy === opt.v
							? 'on-fill font-semibold'
							: 'border-gray-300 bg-white text-gray-600 hover:text-gray-900'}">{opt.l}</button
					>
				{/each}
			</div>

			<div class="flex flex-wrap items-center gap-1">
				<span class="eyebrow mr-1 text-gray-600">{t('tasks.board.energyUpTo')}</span>
				{#each [1, 2, 3, 4, 5] as n (n)}
					<button
						onclick={() => (maxEnergy = maxEnergy === n ? null : n)}
						class="tabular h-6 w-6 border text-xs {maxEnergy === n
							? 'on-fill font-semibold'
							: 'border-gray-300 bg-white text-gray-500 hover:text-gray-900'}">{n}</button
					>
				{/each}
			</div>

			<label class="flex items-center gap-2 text-gray-600">
				<input type="checkbox" bind:checked={showDone} class="h-3 w-3" />
				{t('tasks.board.showSkipped')}
			</label>

			<p class="kbd-hint text-xs text-gray-500">
				{t('tasks.board.numberKeysSet')}
				<strong class="font-semibold text-gray-600">{ratingKey}</strong>
				{t('tasks.board.uI')}
			</p>
		</div>
	</Modal>

	<Modal bind:open={showForm} error={form?.message} title={t('tasks.board.newCard')} size="sm">
		<form
			id="card-form"
			method="post"
			action="?/createTodo"
			use:enhance={sending.wrap(() => async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') showForm = false;
			})}
		>
			{#if tab === 'today'}
				<input type="hidden" name="scheduledDate" value={data.date} />
			{/if}

			<!--
				The same fields a to-do is made of, because a card is a to-do.

				This form had grown its own smaller version — a title, a category
				and the ratings — so a card made here could not carry notes or
				belong to a notebook, while the identical thing made one tab away
				could. `TodoFields` is the one form; `compact` is what folds the
				rest away until it is wanted.
			-->
			<FormGrid>
				<TodoFields
					categories={data.categories}
					notebooks={data.notebooks}
					bind:ratings={formRatings}
					compact
				/>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
			<button type="submit" form="card-form" class="btn btn-primary" disabled={sending.busy()}
				>{t('tasks.board.addCard')}</button
			>
		{/snippet}
	</Modal>

	<!--
		One card, everything about it.

		A block on the board answers for its own time, length and identity here,
		which is what the Track page used to be for. A todo has no time yet, so it
		gets the fields it does have.
	-->
	<Modal
		open={editing !== null}
		error={form?.message}
		onclose={() => (editing = null)}
		title={editing?.title ?? ''}
		size="sm"
	>
		{#if editing}
			{@const card = editing}
			{#if card.goals.length}
				<div class="mb-3">
					<Backlinks goals={card.goals} />
				</div>
			{/if}

			<!--
				Which column it is in.

				Not part of the form below: moving a card is its own act and takes
				effect on the tap, where saving a name and a length is a form with a
				Save button. It is also the only way to reach Doing on a touch screen,
				where there is no drag.
			-->
			<div class="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
				<span class="eyebrow shrink-0 text-gray-600">{t('ui.status')}</span>
				<div class="seg">
					{#each STATUSES as status (status)}
						<button
							type="button"
							aria-pressed={shownStatus(card) === status}
							onclick={() => {
								move(card, status);
								editing = null;
							}}
						>
							{t(STATUS_LABELS[status])}
						</button>
					{/each}
				</div>
			</div>

			<!--
				A nudge before it starts.

				Its own form, because setting a reminder and editing the block are two
				acts. A lead time rather than a clock reading, because "ten minutes
				before" is how anybody describes a reminder about something already on
				a calendar.
			-->
			{#if card.kind === 'instance' && card.startTime}
				{@const set = data.reminders[card.id] ?? []}
				<div class="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
					<span class="eyebrow shrink-0 text-gray-600">{t('tasks.board.remindMe')}</span>
					{#each [5, 10, 30, 60] as minutes (minutes)}
						<form method="post" action="?/remind" use:enhance>
							<input type="hidden" name="id" value={card.id} />
							<input type="hidden" name="minutes" value={minutes} />
							<button class="btn btn-sm">
								{minutes < 60
									? t('tasks.board.minutesFull', { count: minutes })
									: t('tasks.board.1Hour')}
								{t('tasks.board.before')}
							</button>
						</form>
					{/each}

					{#each set as reminder (reminder.id)}
						<form method="post" action="?/unremind" use:enhance class="flex items-center">
							<input type="hidden" name="reminderId" value={reminder.id} />
							<button
								class="chip flex items-center gap-1 text-gray-700"
								title={t('tasks.board.removeThisReminder')}
								aria-label={t('tasks.board.removeTheReminderAt', {
									slice: reminder.remindAt.slice(11, 16)
								})}
							>
								<Icon name="clock" size={12} />
								<span class="tabular">{reminder.remindAt.slice(11, 16)}</span>
								<Icon name="close" size={12} />
							</button>
						</form>
					{/each}
				</div>
			{/if}
			<form
				id="edit-form"
				method="post"
				action={card.kind === 'instance' ? '?/editInstance' : '?/setRatings'}
				use:enhance={() =>
					async ({ update, result }) => {
						await update({ reset: false });
						if (result.type === 'success') editing = null;
					}}
			>
				<input type="hidden" name="id" value={card.id} />
				<input type="hidden" name="kind" value={card.kind} />
				{#if card.kind === 'instance'}
					<!-- What it was before, so the server can tell a retime from a save
					     that only touched the name. -->
					<input type="hidden" name="slotId" value={card.slotId ?? ''} />
					<input type="hidden" name="date" value={card.scheduledDate ?? data.date} />
					<input type="hidden" name="wasStartTime" value={card.startTime ?? ''} />
					<input type="hidden" name="wasDuration" value={card.durationMinutes} />
				{/if}

				<FormGrid>
					{#if card.kind === 'instance'}
						<Field
							label={t('tasks.board.called')}
							span={12}
							hint={t('tasks.board.thisOccurrenceOnlyEmptyKeeps')}
						>
							<OneLine
								name="label"
								placeholder={card.title}
								value={card.labelOverride ?? ''}
								class="input"
							/>
						</Field>

						<Field label={t('tasks.board.starts')} span={6}>
							<input
								autocomplete="off"
								name="startTime"
								type="time"
								value={card.startTime ?? ''}
								class="input tabular"
							/>
						</Field>

						<Field label={t('tasks.board.minutes')} span={6}>
							<NumberBox
								autocomplete="off"
								name="durationMinutes"
								min="5"
								max="1440"
								step="5"
								value={card.durationMinutes}
							/>
						</Field>

						{#if card.mode === 'category'}
							<Field
								label={t('tasks.board.whatItWas')}
								span={12}
								hint={t('tasks.board.thisBlockNamesACategory')}
							>
								<!-- The same picker the plan's block form has, for the same
								     reason: a list of forty is hunted through, not read. -->
								<PickOne
									name="activityId"
									value={card.activityId === null ? '' : String(card.activityId)}
									ariaLabel={t('tasks.board.whatItWas')}
									placeholder={t('pickOne.typeToNarrow')}
									options={[
										{ value: '', label: t('tasks.board.notSaid') },
										...data.activities.map(
											(activity: { id: number; name: string; categoryName: string }) => ({
												value: String(activity.id),
												label: `${activity.categoryName} \u00b7 ${activity.name}`
											})
										)
									]}
								/>
							</Field>
						{/if}
					{/if}

					<MoreOptions label={t('tasks.board.urgencyInterestEnergy')} count={editRatingsSet}>
						{#each RATINGS as r (r)}
							<div class="col-span-12">
								<RatingPicker rating={r} bind:value={editRatings[r]} />
							</div>
						{/each}
					</MoreOptions>
				</FormGrid>
			</form>
		{/if}

		{#snippet footer()}
			{#if editing}
				{@const card = editing}
				<form
					method="post"
					action={card.kind === 'instance' ? '?/deleteInstance' : '?/deleteTodo'}
					use:enhance={() =>
						async ({ update }) => {
							editing = null;
							await update();
						}}
					class="mr-auto"
				>
					<input type="hidden" name="id" value={card.id} />
					<input type="hidden" name="kind" value={card.kind} />
					<button class="btn btn-danger btn-sm" use:armed>
						<Icon name="trash" />
						{t('ui.delete')}
					</button>
				</form>
			{/if}
			<button type="button" class="btn" onclick={() => (editing = null)}>{t('ui.cancel')}</button>
			<button type="submit" form="edit-form" class="btn btn-primary">{t('ui.save')}</button>
		{/snippet}
	</Modal>

	<!--
		What is in your hand, and the way to put it back.

		A card armed for a move is a state somebody can walk away from, so it
		says so — with its name, because two cards in a column look alike — and
		the way out is a press rather than a guess.
	-->
	{#if moving}
		<div
			class="mb-3 flex items-center gap-3 border border-gray-900 bg-gray-50 px-3 py-2 text-sm"
			role="status"
		>
			<Icon name="drag" size={14} />
			<span class="min-w-0 flex-1 truncate"
				>{t('tasks.board.movingPickAColumn', { title: moving.title })}</span
			>
			<button type="button" class="btn btn-sm shrink-0" onclick={() => (movingUid = null)}>
				{t('ui.cancel')}
			</button>
		</div>
	{/if}

	<div class="flex flex-col gap-3 md:flex-row">
		<div class="min-w-0 flex-1">
			<!-- Which column the phone is looking at. Above md every column is on
			     screen at once and this is not drawn at all. -->
			<!--
				The switcher, which is also where you drop.

				With one column on the screen there is nowhere to drag a card *to* —
				the column it should go in is the one that is not visible. So the
				names above are the target: they light up the moment a drag starts,
				and dropping on one moves the card there and follows it, which is
				the only way the gesture makes sense when you cannot see where it
				landed.
			-->
			<div
				class="seg mb-3 flex w-full md:hidden {dragging || movingUid ? 'ring-2 ring-gray-900' : ''}"
			>
				{#each columns as column (column.status)}
					<button
						type="button"
						onclick={() => {
							// On a phone the column a card should go in is the one that is
							// not on the screen, so these names are where you put it down
							// as well as where you go. It follows the card, because a move
							// you cannot see land is a move you cannot trust.
							if (movingUid) placeIn(column.status);
							showColumn(column.status);
						}}
						aria-pressed={phoneColumn === column.status}
						ondragover={(e) => {
							e.preventDefault();
							dragOverColumn = column.status;
						}}
						ondragleave={() => {
							if (dragOverColumn === column.status) dragOverColumn = null;
						}}
						ondrop={async (e) => {
							const card = dragging;
							await onDropInColumn(column.status, e);
							// Follow it: the card has moved, and the board should be
							// looking at where it went.
							if (card) showColumn(column.status);
						}}
						class="flex-1 gap-1.5 {dragging && dragOverColumn === column.status ? 'on-fill' : ''}"
					>
						{t(STATUS_LABELS[column.status])}
						<span
							class="tabular text-xs {dragging && dragOverColumn === column.status
								? 'text-gray-300'
								: 'text-gray-500'}">{column.cards.length}</span
						>
					</button>
				{/each}
			</div>

			<div
				bind:this={strip}
				ondragover={scrollAtEdge}
				onscroll={followScroll}
				class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:auto-cols-fr md:grid-flow-col md:overflow-visible md:px-0"
				data-tour="board-columns"
			>
				{#each columns as column, ci (column.status)}
					<section
						class="flex min-h-64 w-[86%] shrink-0 snap-start flex-col border bg-gray-50 md:w-auto {dragOverColumn ===
						column.status
							? 'border-gray-900'
							: 'border-gray-200'}"
						ondragover={(e) => {
							e.preventDefault();
							dragOverColumn = column.status;
						}}
						ondragleave={() => {
							if (dragOverColumn === column.status) dragOverColumn = null;
						}}
						ondrop={(e) => onDropInColumn(column.status, e)}
						onclickcapture={(e) => {
							// Placing beats every other reading of a press on a column:
							// capture, so a card or a button inside it does not take the
							// press that was meant to put something down.
							if (!movingUid) return;
							e.preventDefault();
							e.stopPropagation();
							placeIn(column.status);
						}}
						class:is-landing={movingUid !== null}
					>
						<!--
							The switcher above says both of these on a phone.

							It lights up while a card is being dragged, like the switcher
							does: a column is a drop target for its whole height, and the
							header is the part somebody aims at.
						-->
						<header
							class="hidden items-center justify-between border-b px-3 py-2 md:flex {dragging &&
							dragOverColumn === column.status
								? 'on-fill'
								: 'border-gray-200 bg-white'}"
						>
							<span
								class="eyebrow {dragging && dragOverColumn === column.status
									? 'text-white'
									: 'text-gray-600'}">{t(STATUS_LABELS[column.status])}</span
							>
							<span
								class="tabular text-xs {dragging && dragOverColumn === column.status
									? 'text-gray-300'
									: 'text-gray-500'}">{column.cards.length}</span
							>
						</header>

						<div class="flex-1 space-y-2 p-2">
							{#each column.cards as card, ri (card.uid)}
								<!-- Whether the second line has anything on it at all. -->
								{@const badges =
									needsResolution(card) ||
									(card.kind === 'todo' &&
										!!card.scheduledDate &&
										card.scheduledDate < data.date) ||
									card.goals.length > 0 ||
									card.ratings.urgency != null ||
									card.ratings.interest != null ||
									card.ratings.energy != null}
								<!--
									The card is named, because it is a button that contains
									buttons. Without `aria-label` its accessible name is
									everything written inside it — the title, the notes and the
									labels of the two icons — so a screen reader announced a
									single button called "bin this one Nothing written on this
									one Move this to a column Edit bin this one", and anything
									looking for the edit control found the whole card first.
								-->
								<article
									draggable="true"
									ondragstart={(e) => onDragStart(card, e)}
									ondragend={onDragEnd}
									ondrop={(e) => onDropOnCard(card, column.status, e)}
									ondragover={(e) => e.preventDefault()}
									onclick={() => {
										focusCol = ci;
										focusRow = ri;
										readCard(card);
									}}
									onkeydown={() => {}}
									role="button"
									tabindex="0"
									aria-expanded={openCards.has(card.uid)}
									aria-label={t('tasks.board.readThisCard', { title: card.title })}
									class="pill-soft cursor-grab px-2 py-1.5 shadow-card {focusCol === ci &&
									focusRow === ri
										? 'kbd-cursor'
										: ''} {dragging?.uid === card.uid || movingUid === card.uid
										? 'opacity-40'
										: ''}"
									style="--pill: {card.categoryColor ?? CATEGORY_FALLBACK_COLOR}"
									title={card.categoryName ?? t('tasks.board.noCategory')}
								>
									<div class="flex items-start gap-2">
										<!--
											Done, with a thumb.

											Dragging is a mouse gesture: it does not exist on a touch
											screen, which left a phone with no way at all to move a card
											out of a column. This is the one move that matters, it is the
											same box as the todo list's, and it is held for the undo
											window rather than sent — so a mis-tap costs nothing.

											The box is 20px; the thing you tap is 44.
										-->
										<button
											type="button"
											onclick={(e) => {
												e.stopPropagation();
												move(card, shownStatus(card) === 'done' ? 'todo' : 'done');
											}}
											class="-m-1 flex shrink-0 items-center justify-center p-1 pointer-coarse:w-11"
											title={shownStatus(card) === 'done'
												? t('tasks.board.markNotDone')
												: t('tasks.board.markDone')}
											aria-label={shownStatus(card) === 'done'
												? `Mark ${card.title} not done`
												: `Mark ${card.title} done`}
										>
											<span
												class="flex h-4 w-4 items-center justify-center border border-gray-400 {shownStatus(
													card
												) === 'done'
													? 'bg-gray-400 text-white'
													: 'bg-white'}"
											>
												{#if shownStatus(card) === 'done'}
													<Icon name="check" size={11} />
												{/if}
											</span>
										</button>
										<div class="min-w-0 flex-1">
											<!--
												The time belongs beside the title, not under it.
												This card used to spend four lines on a title, a gap, a
												time and a row of badges, so a column held five of them
												on a laptop. A card with nothing to say is one line now.
											-->
											<div class="flex items-baseline gap-1.5">
												<p class="min-w-0 flex-1 truncate text-sm text-gray-900">{card.title}</p>
												<!-- Pick it up. A drag is a mouse gesture and does not
												     exist under a finger, so the move a board is for
												     needs a press: this arms the card and the next
												     press on a column puts it there. -->
												<button
													type="button"
													onclick={(e) => {
														e.stopPropagation();
														movingUid = movingUid === card.uid ? null : card.uid;
													}}
													aria-pressed={movingUid === card.uid}
													class="shrink-0 self-start opacity-70 transition hover:opacity-100"
													title={t('tasks.board.moveThisToAColumn')}
													aria-label={t('tasks.board.moveThisToAColumn')}
												>
													<Icon name="drag" size={14} />
												</button>
												<button
													type="button"
													onclick={(e) => {
														e.stopPropagation();
														openEditor(card);
													}}
													class="shrink-0 self-start opacity-70 transition hover:opacity-100"
													aria-label={t('tasks.board.edit', { title: card.title })}
												>
													<Icon name="edit" size={14} />
												</button>
											</div>
											<!--
												The second line, whether or not there is anything on it.

												The time used to sit in front of the title, which cost
												the title five characters on every card that had one and
												left the ones without a time reading differently from
												the ones with. And the line only existed when a card had
												a badge, so a card wearing one label stood taller than
												its neighbours. It is always here and always the same
												height: the titles start at the same place and the cards
												end at the same place.
											-->
											<div class="mt-0.5 flex min-h-4 flex-wrap items-center gap-2 text-gray-500">
												{#if card.startTime}
													<!-- Full strength: this is ten pixels, and anything held
													     back from a tinted ground at that size stops clearing
													     4.5:1. The size carries the hierarchy. -->
													<span class="tabular shrink-0 font-mono text-[10px] text-gray-900">
														{card.startTime}
													</span>
												{/if}
												{#if badges}
													{#if needsResolution(card)}
														<button
															type="button"
															onclick={(e) => {
																e.stopPropagation();
																openEditor(card);
															}}
															class="border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-700"
														>
															{t('tasks.board.whichActivity')}
														</button>
													{/if}
													{#if card.kind === 'todo' && card.scheduledDate && card.scheduledDate < data.date}
														<span class="text-[10px]">{t('tasks.board.carriedOver')}</span>
													{/if}
													<RatingBadges values={card.ratings} />
													<!--
													Why this card exists, in one glyph. A kanban card is
													scanned rather than read, so the goal's name would cost
													more room than it is worth here — the editor spells it
													out, and so does the todo list.
												-->
													{#if card.goals.length}
														<span
															class="text-gray-500"
															title={card.goals.map((g) => g.title).join(' · ')}
														>
															<Icon name="goals" size={11} />
														</span>
													{/if}
												{/if}
											</div>
										</div>
									</div>

									<!--
										What is written on it, for whoever pressed it.

										Its notes, the pictures and recordings in them, and the goals
										it belongs to by name rather than by the one glyph the folded
										card has room for. Reading a card should not mean opening the
										form that edits it and pressing Cancel.
									-->
									{#if openCards.has(card.uid)}
										<!--
											A wash, not a rule.
											
											This was a `border-t` across a card with rounded
											corners, which drew a straight line stopping short of
											both edges — a single-sided border that reads as a
											mistake rather than as a division. A shade of its own
											says "this part opened" without drawing anything.
										-->
										{@render opened(card)}
									{/if}

									<!--
										What `x` arms. The key does not delete on its own — a keystroke
										that destroys a row is one you make by accident — it opens this,
										and the button ignores its own first moments, so the press that
										armed it cannot also confirm it. Escape backs out, as everywhere
										else here.
									-->
									{#if confirmingDelete === card.uid}
										<form
											method="post"
											action="?/deleteTodo"
											use:enhance={() =>
												async ({ update }) => {
													confirmingDelete = null;
													await update();
												}}
											class="mt-1.5 flex items-center gap-2 border-t border-gray-200 pt-1.5"
										>
											<input type="hidden" name="id" value={card.id} />
											<input type="hidden" name="kind" value={card.kind} />
											<span class="text-[11px] text-gray-600">{t('tasks.board.deleteThis')}</span>
											<button
												class="btn btn-danger btn-sm ml-auto"
												use:armed
												use:focusHere
												onclick={(e) => e.stopPropagation()}
											>
												{t('ui.delete')}
											</button>
											<button
												type="button"
												class="btn btn-sm"
												onclick={(e) => {
													e.stopPropagation();
													confirmingDelete = null;
												}}
											>
												{t('ui.cancel')}
											</button>
										</form>
									{/if}
								</article>
							{/each}

							{#if column.cards.length === 0}
								<p class="px-1 py-4 text-center text-xs text-gray-500">
									{dragOverColumn === column.status
										? t('tasks.board.dropHere')
										: t('tasks.board.nothingHere')}
								</p>
							{/if}
						</div>
					</section>
				{/each}
			</div>
		</div>

		{#if tab === 'today'}
			<!-- The todo list stays visible beside Today so the two can actually
			     interact: drag one across and it becomes a scheduled task. -->
			<aside
				aria-label={t('tasks.board.toDoList')}
				class="w-full shrink-0 border bg-gray-50 md:w-64 lg:w-72 xl:w-80 {railOver
					? 'border-gray-900'
					: 'border-gray-200'}"
				ondragover={(e) => {
					e.preventDefault();
					railOver = true;
				}}
				ondragleave={() => (railOver = false)}
				ondrop={(e) => onDropInRail(e)}
				onclickcapture={(e) => {
					// The rail is a place to put one down too: back onto the list,
					// off the day. Capture, for the same reason a column does.
					if (!movingUid) return;
					e.preventDefault();
					e.stopPropagation();
					placeIn('todo');
				}}
				class:is-landing={movingUid !== null}
			>
				<header
					class="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2"
				>
					<!-- Todo, like the tab and the plan's rail. The status column beside
					     it is "Pending", which is what stops the two reading as one word. -->
					<span class="eyebrow text-gray-600">{t('tasks.board.toDo')}</span>
					<span class="tabular text-xs text-gray-500">{railCards.length}</span>
				</header>
				<div class="space-y-2 p-2">
					{#each railCards as card (card.uid)}
						<article
							draggable="true"
							ondragstart={(e) => onDragStart(card, e)}
							ondragend={onDragEnd}
							ondragover={(e) => e.preventDefault()}
							onclick={() => readCard(card)}
							onkeydown={() => {}}
							role="button"
							tabindex="0"
							aria-expanded={openCards.has(card.uid)}
							class="pill-soft lift cursor-grab p-2 shadow-card {dragging?.uid === card.uid ||
							movingUid === card.uid
								? 'opacity-40'
								: ''}"
							style="--pill: {card.categoryColor ?? CATEGORY_FALLBACK_COLOR}"
							title={card.categoryName ?? t('tasks.board.noCategory')}
						>
							<div class="flex items-start gap-2">
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm">{card.title}</p>
									<RatingBadges values={card.ratings} class="mt-1" />
								</div>
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										movingUid = movingUid === card.uid ? null : card.uid;
									}}
									aria-pressed={movingUid === card.uid}
									class="shrink-0 self-start opacity-70 transition hover:opacity-100"
									title={t('tasks.board.moveThisToAColumn')}
									aria-label={t('tasks.board.moveThisToAColumn')}
								>
									<Icon name="drag" size={14} />
								</button>
							</div>
							{#if openCards.has(card.uid)}
								{@render opened(card)}
							{/if}
						</article>
					{/each}

					{#if railCards.length === 0}
						<p class="px-1 py-6 text-center text-xs text-gray-500">
							{railOver ? t('tasks.board.dropToSendBack') : t('tasks.board.nothingWaiting')}
						</p>
					{/if}
				</div>
			</aside>
		{/if}
	</div>

	{#if tab === 'today' && dayTotals.length > 0}
		<!--
			Where the day went, under the day.

			It sat above the columns, which put a summary of the answer between
			the question and the cards that are the answer — and pushed the first
			row of every column down a line for it. It is something you read after
			looking, so it reads after them.
		-->
		<div
			class="flex flex-wrap items-center gap-x-5 gap-y-2 border border-gray-200 bg-white px-4 py-2"
		>
			{#each dayTotals as total (total.name)}
				<span class="flex items-center gap-2 text-sm">
					<Swatch color={total.color} />
					<span class="text-gray-700">{total.name}</span>
					<span class="tabular text-gray-500">{formatDuration(t, total.minutes)}</span>
				</span>
			{/each}
		</div>
	{/if}

	<p class="kbd-hint text-xs text-gray-500">
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'prev-column')}</kbd
		>
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'next-card')}</kbd
		>
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'prev-card')}</kbd
		>
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'next-column')}</kbd
		>
		{t('tasks.board.move')}
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'carry-left')}</kbd
		>
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'carry-right')}</kbd
		>
		{t('tasks.board.carryCard')}
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'toggle-done')}</kbd
		>
		{t('tasks.board.done')}
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'toggle-today')}</kbd
		>
		{t('tasks.board.today')}
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'switch-tab')}</kbd
		>
		{t('tasks.board.switchTab')}
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">1-5</kbd>
		{t('tasks.board.rate')}
		<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700"
			>{keyFor('/tasks/board', 'delete')}</kbd
		>
		{t('tasks.board.delete')}
	</p>
</div>

<style>
	/*
	 * The part of a card that opened.
	 *
	 * This was a `border-t` across a card with rounded corners, which drew a
	 * straight line stopping short of both edges — a single-sided border that
	 * reads as a mistake rather than as a division. A shade of its own says
	 * "this part opened" and draws nothing.
	 *
	 * `--hover-wash` is the app's own "slightly different from what is under
	 * it", defined per theme, so it reads on a light card and on a dark one
	 * without being written twice.
	 */
	/*
	 * A card's ground is its category's colour — brown, teal, blue, or the
	 * plain one — so no fixed grey is readable on all of them. The wash is a
	 * shade of whatever is under it and the words take the card's own ink,
	 * which is already the colour chosen to be read against that ground.
	 * `text-gray-700` on a pale card was grey on grey.
	 */
	.card-opened {
		background: var(--hover-wash);
		color: inherit;
	}
</style>
