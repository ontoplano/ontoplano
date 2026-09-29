<script lang="ts">
	import Kbd from '$lib/components/Kbd.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import { sliding } from '$lib/actions/sliding';
	import NumberBox from '$lib/components/NumberBox.svelte';
	import TodoFields from '$lib/components/fields/TodoFields.svelte';
	import PeriodNav from '$lib/components/PeriodNav.svelte';
	import PickOne from '$lib/components/PickOne.svelte';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import TodoCard from '$lib/components/TodoCard.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Picker from '$lib/components/Picker.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import TagFilter from '$lib/components/TagFilter.svelte';
	import { NO_TAG_FILTER, isTagFiltering, passesTagFilter } from '$lib/tag-filter';
	import { dayOf, timeOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import type { PlainKey } from '$lib/i18n/keys';
	import { resolve } from '$app/paths';
	import OneLine from '$lib/components/OneLine.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import Written from '$lib/components/Written.svelte';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
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
	import RatingIcon from '$lib/components/RatingIcon.svelte';
	import {
		RATINGS,
		RATING_ICONS,
		RATING_LABELS,
		RATING_ORDER,
		compareByRating,
		type Rating
	} from '$lib/ratings.js';
	import { getAction, keyFor } from '$lib/shortcuts';
	import { CLOSED_STATUSES, STATUSES, STATUS_LABELS, type Status } from '$lib/task-status.js';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors.js';
	import { cancelFor, changeNow, isPending } from '$lib/undo.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Card = PageServerData['todayCards'][number];

	let tab = $state<'today' | 'general'>('today');
	let minEase: number | null = $state(null);
	let showDone = $state(false);
	/** What the search box holds; narrows the columns and the rail by title. */
	let looking = $state('');

	/*
	 * The orders a column can be read in, and which way each one naturally
	 * runs: the clock forwards, a rating best first. The arrow beside the
	 * order flips that. The ratings come in their one order and wear their
	 * icons rather than their names.
	 */
	const ORDERS = ['time', ...RATING_ORDER] as const;
	type Order = (typeof ORDERS)[number];
	const ORDER_LABELS: Record<Order, PlainKey> = { time: 'tasks.board.byTime', ...RATING_LABELS };
	const NATURAL: Record<Order, 'asc' | 'desc'> = {
		time: 'asc',
		urgency: 'desc',
		interest: 'desc',
		ease: 'desc'
	};
	let sortBy: Order = $state('time');
	let direction: 'asc' | 'desc' = $state('asc');

	function pickOrder(next: Order) {
		sortBy = next;
		direction = NATURAL[next];
	}

	/** The lowest ease on offer in the filter; an unrated card always shows. */
	const EASE_STEPS = [1, 2, 3, 4, 5];
	const easeChoices = $derived([
		{
			value: '',
			label: t('tasks.board.anyEase'),
			icon: RATING_ICONS.ease,
			short: t('ui.all')
		},
		...EASE_STEPS.map((n) => ({
			value: String(n),
			label: t('tasks.board.easeAtLeast', { value: n }),
			icon: RATING_ICONS.ease,
			short: `${n}+`
		}))
	]);

	/*
	 * The To-do tab's cards are the task list's todos, so they narrow the way
	 * the list does: by notebook and by label. The Today tab's blocks carry
	 * neither, so the two pickers are the To-do tab's only.
	 */
	let notebookFilter = $state('');
	let tagFilter = $state({ ...NO_TAG_FILTER });

	const notebookChoices = $derived([
		{ value: '', label: t('todoRows.everyNotebook') },
		{ value: 'none', label: t('todoRows.notInOne') },
		...data.notebooks.map((book: { id: number; title: string }) => ({
			value: String(book.id),
			label: book.title
		}))
	]);
	const tagsInUse = $derived(
		[...new Set(data.generalCards.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b))
	);

	function matches(card: Card): boolean {
		const query = looking.trim().toLowerCase();
		return query === '' || card.title.toLowerCase().includes(query);
	}

	/** The To-do tab's two extra narrowings; a Today card always passes them. */
	function inList(card: Card): boolean {
		if (tab !== 'general') return true;
		if (notebookFilter === 'none' && card.notebookId !== null) return false;
		if (
			notebookFilter !== '' &&
			notebookFilter !== 'none' &&
			String(card.notebookId) !== notebookFilter
		)
			return false;
		return passesTagFilter(card.tags, tagFilter);
	}

	const listNarrowed = $derived(
		tab === 'general' && (notebookFilter !== '' || isTagFiltering(tagFilter))
	);
	const narrowed = $derived(looking.trim() !== '' || minEase !== null || listNarrowed);

	/** What is narrowing the board, in words, for the phone's filter button. */
	function narrowing(): string {
		const parts: string[] = [];
		if (looking.trim()) parts.push(`“${looking.trim()}”`);
		if (minEase !== null) parts.push(t('tasks.board.easeAtLeast', { value: minEase }));
		if (showDone) parts.push(t(STATUS_LABELS.skipped));
		if (tab === 'general' && notebookFilter !== '')
			parts.push(notebookChoices.find((one) => one.value === notebookFilter)?.label ?? '');
		if (tab === 'general') for (const one of tagFilter.include) parts.push(`#${one}`);
		return parts.filter(Boolean).join(', ');
	}

	function clearFilters() {
		looking = '';
		minEase = null;
		showDone = false;
		notebookFilter = '';
		tagFilter = { ...NO_TAG_FILTER };
	}

	// Keyboard focus is a (column, row) pair rather than a flat index, because
	// the board is two-dimensional and hjkl has to mean the same thing here as
	// it does everywhere else in the app.
	let focusCol = $state(0);
	let focusRow = $state(0);
	let showForm = $state(false);
	let formRatings: Record<string, number | null> = $state({
		urgency: null,
		interest: null,
		ease: null
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
		ease: null
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
	const railCards = $derived(
		data.generalCards.filter((c) => !CLOSED_STATUSES.includes(c.status) && matches(c))
	);
	/** Whether the search is what emptied the rail, rather than there being nothing. */
	const railHidden = $derived(
		narrowed && data.generalCards.some((c) => !CLOSED_STATUSES.includes(c.status))
	);

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
		let out = cards.filter((c) => shownStatus(c) === status && matches(c) && inList(c));

		// An unrated card is never hidden: the filter is for choosing among what
		// you have described, not for burying what you have not.
		// "At least this easy" — the comparison turned round with the scale. As
		// `energy` it meant "takes no more than this much out of me", which is
		// the same wish expressed from the other end.
		if (minEase !== null) {
			out = out.filter((c) => c.ratings.ease === null || c.ratings.ease >= minEase!);
		}

		const sorted = sortCards(out);
		return direction === NATURAL[sortBy] ? sorted : sorted.reverse();
	}

	function sortCards(out: Card[]): Card[] {
		if (sortBy === 'time') {
			return [...out].sort((a, b) => {
				// Scheduled work keeps clock order; loose todos follow in their own.
				if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
				if (a.startTime) return -1;
				if (b.startTime) return 1;
				return a.sortOrder - b.sortOrder;
			});
		}

		/*
		 * One rating, best first — and an unrated card is not last.
		 *
		 * It used to sink to the bottom whatever the question was, which said
		 * "nobody weighed this" and meant "this matters least". A rating nobody
		 * set counts as the middle of the scale (`$lib/ratings`), so 4 and 5
		 * beat it and 1 and 2 fall below it, on all three alike now that ease
		 * runs the same way as the other two. Same arithmetic as the to-do
		 * list's "Priority" and as `up_next` over MCP.
		 */
		const key: Rating = sortBy;
		return [...out].sort(
			(a, b) => compareByRating(a.ratings[key], b.ratings[key]) || a.sortOrder - b.sortOrder
		);
	}

	/** How many cards the Skipped toggle would bring back, on this tab. */
	const skippedCount = $derived(cards.filter((c) => shownStatus(c) === 'skipped').length);

	const columns = $derived(
		STATUSES.filter((s) => showDone || s !== 'skipped').map((status) => ({
			status,
			cards: visible(status),
			/** Whether a search or a filter is what emptied it. */
			hidden: narrowed && cards.some((c) => shownStatus(c) === status)
		}))
	);

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
		if (!card) return;
		// A todo off the list put into one of the day's columns goes on the
		// day, as dropping it there does.
		if (tab === 'today' && card.kind === 'todo' && !card.scheduledDate)
			void promote(card, data.date, status);
		else void move(card, status);
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
				// Cycles urgency by default; interest and ease sit behind u/i/y.
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
			case 'rate-ease':
				e.preventDefault();
				ratingKey =
					action === 'rate-urgency' ? 'urgency' : action === 'rate-interest' ? 'interest' : 'ease';
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
	/** Where the rating's icon goes in the key hint's sentence. */
	const RATING_SLOT = '\u0000';

	function openForm() {
		showForm = true;
		formRatings = { urgency: null, interest: null, ease: null };
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

{#snippet cardActions(card: Card)}
	{#if card.kind === 'todo' && !card.scheduledDate}
		<!-- Onto the board's day: the drag's and `t`'s move, as a press — the
		     one way there is on a phone, where the list is its own tab. -->
		{@const onto =
			data.date === data.today
				? t('tasks.board.putOnToday')
				: t('tasks.board.putOnDay', { day: dayOf(data.date, now()) })}
		<button
			type="button"
			onclick={(e) => {
				e.stopPropagation();
				void promote(card, data.date, 'todo');
			}}
			class="icon-btn"
			title={onto}
			aria-label={onto}
		>
			<Icon name="calendar" />
		</button>
	{/if}
	<!-- Pick it up. A drag is a mouse gesture and does not exist under a
	     finger, so the move a board is for needs a press: this arms the card
	     and the next press on a column puts it there. -->
	<button
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			movingUid = movingUid === card.uid ? null : card.uid;
		}}
		aria-pressed={movingUid === card.uid}
		class="icon-btn"
		title={t('tasks.board.moveThisToAColumn')}
		aria-label={t('tasks.board.moveThisToAColumn')}
	>
		<Icon name="drag" />
	</button>
	<button
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			openEditor(card);
		}}
		class="icon-btn"
		title={t('ui.edit')}
		aria-label={t('tasks.board.edit', { title: card.title })}
	>
		<Icon name="edit" />
	</button>
	{#if card.kind === 'todo'}
		<!-- Arms the confirmation under the card, as `x` does. -->
		<button
			type="button"
			onclick={(e) => {
				e.stopPropagation();
				confirmingDelete = card.uid;
			}}
			class="icon-btn icon-btn-danger"
			title={t('ui.delete')}
			aria-label={t('tasks.board.deleteCard', { title: card.title })}
		>
			<Icon name="trash" />
		</button>
	{/if}
{/snippet}

<!--
	What the bin and `x` arm. The key does not delete on its own — a keystroke
	that destroys a row is one you make by accident — it opens this, and the
	button ignores its own first moments, so the press that armed it cannot
	also confirm it. Escape backs out, as everywhere else here.
-->
{#snippet confirmDelete(card: Card)}
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
{/snippet}

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

{#snippet sortControl()}
	<!-- The same control the task list and a notebook's notes use. -->
	<div class="flex" data-tour="board-ratings">
		<SortControl
			value={sortBy}
			options={ORDERS}
			labels={ORDER_LABELS}
			icons={RATING_ICONS}
			{direction}
			onpick={pickOrder}
			onflip={() => (direction = direction === 'asc' ? 'desc' : 'asc')}
			label={t('tasks.board.orderCardsBy')}
		/>
	</div>
{/snippet}

<div class="space-y-4">
	<FormError message={form?.message} />

	<!--
		The board and the controls that act on it are one surface, the task
		list's shape: where you are and what you are looking at along the top,
		then what narrows and orders it, then the columns.
	-->
	<RoomSurface>
		{#snippet tools()}
			<!--
				What is on the board, then which day: the switch at the start of
				the line at every width, so it is in one place on a phone and a
				desktop, and the day beside it. The To-do tab has no day; the
				navigator is held invisible there so the switch does not move.
			-->
			<div
				use:sliding
				class="seg shrink-0"
				role="group"
				aria-label={t('tasks.board.whatToShow')}
				data-tour="board-tabs"
			>
				{#each [{ v: 'today', l: t('ui.today') }, { v: 'general', l: t('tasks.board.toDoTab') }] as opt (opt.v)}
					<button
						onclick={() => {
							tab = opt.v as typeof tab;
							focusRow = 0;
						}}
						aria-pressed={tab === opt.v}>{opt.l}</button
					>
				{/each}
			</div>

			<div
				class="flex min-w-0 flex-1 sm:flex-none {tab === 'today' ? '' : 'invisible'}"
				inert={tab !== 'today'}
			>
				<PeriodNav
					unit={t('tasks.plan.day')}
					atNow={data.date === data.today}
					onprev={() => shiftDay(-1)}
					onnext={() => shiftDay(1)}
					onnow={() => goto(resolve('/tasks/board'))}
				>
					<span class="tabular truncate text-sm text-gray-600">
						{dayOf(data.date, now(), { weekday: 'short' })}
						{#if data.date === data.today}<span class="text-gray-500">
								{t('tasks.plan.today')}</span
							>{/if}
					</span>
				</PeriodNav>
			</div>
		{/snippet}

		{#snippet filters()}
			<FilterBar
				name="board"
				on={narrowed || showDone}
				summary={narrowing()}
				onclear={clearFilters}
				trailing={sortControl}
			>
				{#snippet lead()}
					<SearchField bind:value={looking} label={t('tasks.board.searchCards')} />
				{/snippet}
				{#snippet count()}
					{@const showing = columns.reduce((sum, c) => sum + c.cards.length, 0)}
					<ShowingCount
						total={cards.length}
						shown={showing}
						said={(count) => t('tasks.board.showingCount', { count })}
					/>
				{/snippet}

				{#snippet inline()}
					<!-- Nothing to bring back is nothing to press. The ease picker
					     only ever says a feather and "All" or "3+", so on a phone it
					     is narrower than the others, and the order keeps its place
					     on this line instead of taking one of its own. -->
					<button
						type="button"
						onclick={() => (showDone = !showDone)}
						aria-pressed={showDone}
						disabled={skippedCount === 0 && !showDone}
						class="btn btn-sm shrink-0"
					>
						{t('tasks.board.skippedCount', { count: skippedCount })}
					</button>
					<Picker
						value={minEase === null ? '' : String(minEase)}
						options={easeChoices}
						onpick={(next) => (minEase = next === '' ? null : Number(next))}
						label={t('tasks.board.easeFrom')}
						class="min-w-24 sm:min-w-36 sm:flex-none"
					/>
				{/snippet}
				{#if tab === 'general'}
					<Picker
						value={notebookFilter}
						options={notebookChoices}
						onpick={(next) => (notebookFilter = next)}
						label={t('ui.notebook')}
						class="min-w-36 flex-1 sm:flex-none"
					/>
					{#if tagsInUse.length > 0 || isTagFiltering(tagFilter)}
						<TagFilter
							tags={tagsInUse}
							value={tagFilter}
							onchange={(next) => (tagFilter = next)}
							name="board-tags"
							class="min-w-36 flex-1 sm:flex-none"
						/>
					{/if}
				{/if}
			</FilterBar>
		{/snippet}

		<div class="board-body space-y-3 p-4">
			<!--
		What is in your hand, and the way to put it back.

		A card armed for a move is a state somebody can walk away from, so it
		says so — with its name, because two cards in a column look alike — and
		the way out is a press rather than a guess.

		Floating at the foot of the screen, where the selection bar floats: it
		was a line above the columns, and arming a move shoved every column down
		under the finger that was about to pick one.
	-->
			{#if moving}
				<div
					class="float-layer overlay-face fixed inset-x-3 z-40 mx-auto flex max-w-xl items-center gap-3 border px-3 py-2 text-sm shadow-overlay"
					style="bottom: calc(var(--safe-bottom) + var(--mobile-nav-height) + 0.75rem)"
					role="status"
				>
					<Icon name="drag" size={14} />
					<span class="min-w-0 flex-1 truncate"
						>{t('tasks.board.movingPickAColumn', { title: moving.title })}</span
					>
					<button
						type="button"
						class="btn btn-primary btn-sm shrink-0"
						onclick={() => (movingUid = null)}
					>
						{t('ui.cancel')}
					</button>
				</div>
			{/if}

			<div class="flex flex-col gap-3 md:flex-row md:items-start">
				<div class="board-columns min-w-0 flex-1" style="--lanes: {columns.length}">
					<!--
						Stacked on a phone, side by side from md up — never a strip that
						scrolls sideways inside the page. Each column is as tall as what
						is in it: an empty one is its empty state, not a slab of grey.
					-->
					<div
						class="flex flex-col gap-3 md:grid md:auto-cols-fr md:grid-flow-col md:items-start"
						data-tour="board-columns"
					>
						{#each columns as column, ci (column.status)}
							<section
								class="lane flex flex-col border bg-gray-50 {dragOverColumn === column.status
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
							It lights up while a card is being dragged: a column is a drop
							target for its whole height, and the header is the part
							somebody aims at.
						-->
								<header
									class="flex items-center justify-between border-b px-3 py-2 {dragging &&
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
											card.ratings.ease != null}
										<!--
									The card is named, because it is a button that contains
									buttons. Without `aria-label` its accessible name is
									everything written inside it — the title, the notes and the
									labels of the two icons — so a screen reader announced a
									single button called "bin this one Nothing written on this
									one Move this to a column Edit bin this one", and anything
									looking for the edit control found the whole card first.
								-->
										<TodoCard
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
											tabindex={0}
											aria-expanded={openCards.has(card.uid)}
											aria-label={t('tasks.board.readThisCard', { title: card.title })}
											class="cursor-grab {focusCol === ci && focusRow === ri
												? 'kb-cursor'
												: ''} {dragging?.uid === card.uid || movingUid === card.uid
												? 'opacity-40'
												: ''}"
											title={card.title}
											hint={card.categoryName ?? t('tasks.board.noCategory')}
											color={card.categoryColor}
											done={shownStatus(card) === 'done'}
											doing={shownStatus(card) === 'doing'}
											tickLabel={shownStatus(card) === 'done'
												? t('tasks.board.markNotDone', { title: card.title })
												: t('tasks.board.markDone', { title: card.title })}
											ontick={() => move(card, shownStatus(card) === 'done' ? 'todo' : 'done')}
										>
											{#snippet actions()}
												{@render cardActions(card)}
											{/snippet}
											{#snippet meta()}
												<!--
													The second line, whether or not there is anything on it:
													always here and always the same height, so the titles start
													at the same place and the cards end at the same place.
												-->
												{#if card.startTime}
													<!-- Full strength: this is ten pixels on a tinted ground,
													     where anything held back stops clearing 4.5:1. -->
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
															class="border border-current px-1 text-[10px]"
														>
															{t('tasks.board.whichActivity')}
														</button>
													{/if}
													{#if card.kind === 'todo' && card.scheduledDate && card.scheduledDate < data.date}
														<span class="text-[10px]">{t('tasks.board.carriedOver')}</span>
													{/if}
													<RatingBadges values={card.ratings} muted={card.status === 'done'} />
													<!-- Why this card exists, in one glyph; the editor and the
													     todo list spell the goal out. -->
													{#if card.goals.length}
														<span title={card.goals.map((g) => g.title).join(' · ')}>
															<Icon name="goals" size={11} />
														</span>
													{/if}
												{/if}
											{/snippet}
											<!--
												What is written on it, for whoever pressed it: its notes and the
												goals it belongs to by name. Reading a card should not mean
												opening the form that edits it and pressing Cancel.
											-->
											{#if openCards.has(card.uid)}
												{@render opened(card)}
											{/if}
											{@render confirmDelete(card)}
										</TodoCard>
									{/each}

									{#if column.cards.length === 0}
										{@const dropping = dragOverColumn === column.status}
										<EmptyState
											compact
											filtered={column.hidden && !dropping}
											onclear={clearFilters}
											icon={dropping ? 'drag' : column.hidden ? undefined : 'check'}
											title={dropping
												? t('tasks.board.dropHere')
												: column.hidden
													? undefined
													: t('tasks.board.nothingHere')}
										/>
									{/if}
								</div>
							</section>
						{/each}
					</div>
				</div>

				{#if tab === 'today'}
					<!-- The todo list stays visible beside Today so the two can actually
			     interact: drag one across and it becomes a scheduled task. As wide
			     as a column, at every width. On a phone there is no dragging and
			     no room beside the day; the list is the To-do tab, one press
			     away, and each of its cards goes on the day with its own button. -->
					<aside
						aria-label={t('tasks.board.toDoList')}
						class="board-rail lane hidden border bg-gray-50 md:block {railOver
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
								<TodoCard
									draggable="true"
									ondragstart={(e) => onDragStart(card, e)}
									ondragend={onDragEnd}
									ondragover={(e) => e.preventDefault()}
									onclick={() => readCard(card)}
									onkeydown={() => {}}
									role="button"
									tabindex={0}
									aria-expanded={openCards.has(card.uid)}
									aria-label={t('tasks.board.readThisCard', { title: card.title })}
									class="lift cursor-grab {dragging?.uid === card.uid || movingUid === card.uid
										? 'opacity-40'
										: ''}"
									title={card.title}
									hint={card.categoryName ?? t('tasks.board.noCategory')}
									color={card.categoryColor}
									done={shownStatus(card) === 'done'}
									doing={shownStatus(card) === 'doing'}
									tickLabel={t('tasks.board.markDone', { title: card.title })}
									ontick={() => move(card, 'done')}
								>
									{#snippet actions()}
										{@render cardActions(card)}
									{/snippet}
									{#snippet meta()}
										<RatingBadges values={card.ratings} muted={card.status === 'done'} />
									{/snippet}
									{#if openCards.has(card.uid)}
										{@render opened(card)}
									{/if}
									{@render confirmDelete(card)}
								</TodoCard>
							{/each}

							{#if railCards.length === 0}
								<EmptyState
									compact
									filtered={railHidden && !railOver}
									onclear={clearFilters}
									icon={railOver ? 'drag' : railHidden ? undefined : 'check'}
									title={railOver
										? t('tasks.board.dropToSendBack')
										: railHidden
											? undefined
											: t('tasks.board.nothingWaiting')}
								/>
							{/if}
						</div>
					</aside>
				{/if}
			</div>
		</div>

		{#if tab === 'today' && dayTotals.length > 0}
			<!--
			Where the day went, under the day.

			It sat above the columns, which put a summary of the answer between
			the question and the cards that are the answer — and pushed the first
			row of every column down a line for it. It is something you read after
			looking, so it reads after them.
		-->
			<div class="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-200 px-4 py-3">
				{#each dayTotals as total (total.name)}
					<span class="flex items-center gap-2 text-sm">
						<CategoryMark name={total.name} color={total.color} />
						<span class="tabular text-gray-500">{formatDuration(t, total.minutes)}</span>
					</span>
				{/each}
			</div>
		{/if}
	</RoomSurface>

	<Modal bind:open={showForm} error={form?.message} title={t('tasks.board.newCard')} size="sm">
		<form
			id="card-form"
			method="post"
			action="?/createTodo"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') showForm = false;
				}}
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
			<button type="submit" form="card-form" class="btn btn-primary"
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
				<div use:sliding class="seg">
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
									slice: timeOf(reminder.remindAt, now())
								})}
							>
								<Icon name="clock" size={12} />
								<span class="tabular">{timeOf(reminder.remindAt, now())}</span>
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

					<MoreOptions label={t('tasks.board.urgencyEaseInterest')} count={editRatingsSet}>
						{#snippet summary()}<RatingIcon />{/snippet}
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
					<button
						class="btn btn-danger btn-sm"
						use:armed
						title={t('ui.delete')}
						aria-label={t('ui.delete')}
					>
						<Icon name="trash" />
					</button>
				</form>
			{/if}
			<button type="button" class="btn" onclick={() => (editing = null)}>{t('ui.cancel')}</button>
			<button type="submit" form="edit-form" class="btn btn-primary">{t('ui.save')}</button>
		{/snippet}
	</Modal>

	<p class="kbd-hint text-xs text-gray-500">
		<Kbd keys={keyFor('/tasks/board', 'prev-column')} />
		<Kbd keys={keyFor('/tasks/board', 'next-card')} />
		<Kbd keys={keyFor('/tasks/board', 'prev-card')} />
		<Kbd keys={keyFor('/tasks/board', 'next-column')} />
		{t('tasks.board.move')}
		<Kbd keys={keyFor('/tasks/board', 'carry-left')} />
		<Kbd keys={keyFor('/tasks/board', 'carry-right')} />
		{t('tasks.board.carryCard')}
		<Kbd keys={keyFor('/tasks/board', 'toggle-done')} />
		{t('tasks.board.done')}
		<Kbd keys={keyFor('/tasks/board', 'toggle-today')} />
		{t('tasks.board.today')}
		<Kbd keys={keyFor('/tasks/board', 'switch-tab')} />
		{t('tasks.board.switchTab')}
		<Kbd keys="1-5" />
		<!-- The rating being set is its icon; the sentence is split around it. -->
		{#each t('tasks.board.rateWhich', { rating: RATING_SLOT }).split(RATING_SLOT) as part, at (at)}
			{#if at > 0}<RatingIcon rating={ratingKey} size={12} />{/if}{part}
		{/each}
		<Kbd keys={keyFor('/tasks/board', 'delete')} />
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

	/*
	 * The rail is one more column. Fluid columns beside a fixed rail drew
	 * them 329px against 320 and further apart the wider the screen; the
	 * basis below leaves each column and the rail the same share.
	 */
	@media (min-width: 48rem) {
		.board-columns {
			flex: var(--lanes) 1 calc((var(--lanes) - 1) * 0.75rem);
		}

		.board-rail {
			flex: 1 1 0;
			min-width: 0;
		}
	}
</style>
