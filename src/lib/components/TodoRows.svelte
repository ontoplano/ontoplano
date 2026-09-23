<script lang="ts">
	import { say } from '$lib/said.svelte';
	import { discardForm, keptForm } from '$lib/kept-form';
	import Picker from '$lib/components/Picker.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import { agoOf, momentOf } from '$lib/when';
	import { compareByPriority, type RatingValues } from '$lib/ratings';
	import { useWhen } from '$lib/when-context.svelte';
	import { deleteLater, isLeaving } from '$lib/undo.svelte';
	import NumberBox from '$lib/components/NumberBox.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { tick } from 'svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { enhance } from '$lib/enhance';
	import Backlinks from '$lib/components/Backlinks.svelte';
	import TodoFields from '$lib/components/fields/TodoFields.svelte';
	import Written from '$lib/components/Written.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import { matchScore } from '$lib/destinations';
	import { getAction, keyFor } from '$lib/shortcuts';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import RatingBadges from '$lib/components/RatingBadges.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { CLOSED_STATUSES } from '$lib/task-status';
	import { ordinal } from '$lib/ordinal';
	import { keepInView } from '$lib/actions/keep-in-view';
	import { invalidateAll } from '$app/navigation';
	import { cancelFor, changeNow, isPending } from '$lib/undo.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { GoalBacklink } from '$lib/services/backlinks';
	import type { Todo } from '$lib/services/todos';
	import type { TodoActionNames } from '$lib/todo-actions';
	import { useT } from '$lib/i18n';
	import type { PlainKey } from '$lib/i18n/keys';

	const t = useT();
	const now = useWhen();

	/**
	 * A list of todos and everything you can do to one.
	 *
	 * The to-do room shows all of them; a notebook shows the ones filed under
	 * it. Operating on a todo has to mean the same thing in both places —
	 * ticking it off, putting it on a day, editing it, putting it away — so the
	 * rows, the toolbar and the two dialogs are this component rather than
	 * markup written twice. Where the forms post is a prop, because a notebook
	 * page's own `delete` and `update` already belong to the notebook; see
	 * `$lib/todo-actions`.
	 */
	let {
		todos,
		categories,
		notebooks,
		actions,
		goalLinks = {},
		error = undefined,
		/**
		 * The notebook this list belongs to, when it is one notebook's.
		 *
		 * A new todo lands in it without being asked, and the rows drop the
		 * notebook chip: everything here is filed under the notebook whose page
		 * this is, so naming it on every row says nothing.
		 */
		notebookId = null,
		/**
		 * The screen whose keyboard shortcuts drive this list, if any.
		 *
		 * A list beside other things on a page must not swallow the keyboard —
		 * pressing `e` in a notebook belongs to whatever the notebook decides,
		 * not to whichever todo a cursor happens to sit on.
		 */
		shortcutRoom = null,
		framed = true,
		claimsRoomBar,
		listTour = null,
		newTour = null,
		/**
		 * A way in from outside, for a screen that draws its own New button.
		 *
		 * A notebook puts one beside the tab it belongs to rather than in the
		 * room's bar, and it must open this list's form rather than a second
		 * one written next to it. Set once, on mount.
		 */
		// `$bindable()` is a compiler directive, not an assignment: this one is
		// only ever written from here, which is what the rule mistakes it for.
		// eslint-disable-next-line no-useless-assignment
		openNew = $bindable(),
		/**
		 * Open this list's editor on one task, handed up like `openNew`.
		 *
		 * A note that points at a task — `TASK:#4` — opens the task where the
		 * task lives, which is this list's own form. Anything else would be a
		 * second editor to keep in step with this one.
		 */
		// eslint-disable-next-line no-useless-assignment
		openTodo = $bindable()
	}: {
		todos: Todo[];
		categories: { id: number; name: string }[];
		notebooks: { id: number; title: string }[];
		actions: TodoActionNames;
		goalLinks?: Record<number, GoalBacklink[]>;
		error?: string | undefined;
		notebookId?: number | null;
		/**
		 * Which screen's bindings these rows answer to — `/tasks/todo` and the
		 * like. Null leaves the keyboard alone entirely.
		 */
		shortcutRoom?: string | null;
		/**
		 * Whether the list draws the surface it sits on.
		 *
		 * In the to-do room it is the room: one bordered card with the filters
		 * along its top. Inside a notebook the card is the notebook's own, and
		 * these are two more panes of it — a card drawn inside a card is the
		 * floating this was meant to stop.
		 */
		framed?: boolean;
		/**
		 * Whether this list is the room, and so owns the bar's one verb.
		 *
		 * Separate from `shortcutRoom` because the two are different questions
		 * and were one prop: a notebook's Tasks tab wants j/k on its rows and
		 * does *not* want "New to-do" in the room bar, where "New notebook"
		 * already sits and the tab header already offers "New task". Turning
		 * the keys on turned a second, duplicate verb on with them.
		 */
		claimsRoomBar?: boolean;
		listTour?: string | null;
		newTour?: string | null;
		openNew?: (() => void) | undefined;
		openTodo?: ((id: number) => void) | undefined;
	} = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	/**
	 * Words to look for, across the titles and the notes.
	 *
	 * A list of three hundred tasks cannot be read, and the other filters
	 * answer "which kind" rather than "which one" — somebody looking for the
	 * plumber knows the word and not the notebook. The app's own fuzzy, so it
	 * behaves like the palette and the label box rather than inventing a third
	 * idea of what matching means.
	 */
	let looking = $state('');

	let showCompleted = $state(false);
	/** Put-away tasks are out of the way by default; that is what putting away is. */
	let showArchived = $state(false);
	/**
	 * Which notebook's tasks to show.
	 *
	 * `''` is all of them, `'none'` the ones filed under nothing — which is a
	 * real answer and not the absence of one: a task nobody has placed is
	 * exactly what somebody goes looking for. Not offered inside a notebook,
	 * where the answer is already fixed.
	 */
	let notebookFilter = $state('');
	/**
	 * Which label to show, `''` for all and `'none'` for the ones with none.
	 *
	 * A label is what several assistants on one list use to say whose work is
	 * whose — `a1`, `done` — so being able to read back one of them is the
	 * point of having them at all.
	 */
	let tagFilter = $state<string[]>([]);
	let selectedIndex = $state(0);
	let delegatingId: number | null = $state(null);
	let confirmingDelete: number | null = $state(null);
	/**
	 * Which rows are showing everything written on them.
	 *
	 * A task's notes are one truncated line on the row, and the only way to
	 * read the rest of them was to open the form that edits it — so reading
	 * what you wrote meant opening a dialog and pressing Cancel. Pressing the
	 * title unfolds it in place instead. Held per row, and per visit: it is a
	 * way of looking at a list, not a fact about the list.
	 */
	let openNotes = new SvelteSet<number>();

	function toggleNotes(id: number) {
		if (openNotes.has(id)) openNotes.delete(id);
		else openNotes.add(id);
	}

	/** Whether there is anything under the title worth unfolding. */
	function hasMore(todo: Todo): boolean {
		return Boolean(todo.notes);
	}

	let formRatings: Record<string, number | null> = $state({
		urgency: null,
		interest: null,
		ease: null
	});

	/**
	 * Where this draft would land among the open tasks here, by priority.
	 *
	 * A number out of a thousand said what the answers *were*; this says what
	 * they *do* — which is the only reason anybody moves one of those sliders.
	 * Counted against the open tasks this list is showing, which is the list
	 * the task is about to join, and against itself excluded: a task does not
	 * queue behind the version of itself that is being edited.
	 *
	 * A task being written has no age yet, so it takes now — and ties are
	 * broken towards the older one, which puts a new task behind everything it
	 * matches exactly. That is the honest answer: it has waited least.
	 */
	const editing = $derived(todos.find((one: Todo) => one.id === editingId));

	/**
	 * Which notebook the draft is filed under, as the form has it.
	 *
	 * Bound rather than passed, because the queue it joins is that notebook's:
	 * moving a task from the kitchen to the trip changes what it is queuing
	 * behind, and the line it is standing in has to say so while you are still
	 * choosing.
	 */
	let formNotebookId: number | null = $state(null);

	const draftPlace = $derived.by(() => {
		const draft = {
			ratings: formRatings as RatingValues,
			sortOrder: editing?.sortOrder ?? 0,
			createdAt: editing?.createdAt ?? new Date().toISOString()
		};
		const ahead = todos.filter(
			(one: Todo) =>
				one.id !== editingId &&
				one.notebookId === formNotebookId &&
				!CLOSED_STATUSES.includes(one.status) &&
				!one.archivedAt &&
				compareByPriority(one, draft) < 0
		);
		return ahead.length + 1;
	});

	/**
	 * How long a task stays on screen after it is ticked.
	 *
	 * Long enough to see the tick land and the row grey, and short enough that
	 * a list being worked through does not feel like it is holding you up.
	 */
	const SEEN_DONE_MS = 500;

	/**
	 * The ones just ticked, held in the list while the tick is seen.
	 *
	 * A list that is not showing finished tasks drops one the instant it is
	 * marked done — and since the row is what was pressed, the answer to the
	 * press was the row vanishing, which reads as something deleted rather
	 * than something done. Held here for half a second, during which
	 * `shownStatus` already draws it ticked and greyed exactly as a finished
	 * task is drawn.
	 */
	const lingering = new SvelteSet<number>();

	function linger(id: number) {
		lingering.add(id);
		setTimeout(() => lingering.delete(id), SEEN_DONE_MS);
	}

	/**
	 * What the row says right now.
	 *
	 * A tick is held for the undo window rather than sent, so between the click
	 * and the write there is nothing on the server to read: the list renders the
	 * outcome itself, and Undo just cancels the timer. Reopening is not held —
	 * it is already the undo of a tick.
	 */
	function shownStatus(todo: Todo): Todo['status'] {
		return isPending(undoKey(todo)) ? 'done' : todo.status;
	}

	function undoKey(todo: Todo): string {
		return `todo:${todo.id}`;
	}

	/*
	 * Newest first, and the other way if you ask.
	 *
	 * The service hands these back in the order they were put in, which is the
	 * order a hand-sorted list wants and the wrong one for a list you keep
	 * adding to: the thing just written was at the bottom, under everything
	 * already ignored. Newest first is what somebody is looking for; oldest
	 * first is the deliberate question — what has been on here longest.
	 *
	 * Kept in this browser: it is a way of looking at a list rather than a fact
	 * about the account, and flipping it on a phone says nothing about a laptop.
	 */
	/*
	 * Three questions, one button.
	 *
	 * Newest and oldest are about when something was written down. "Last done"
	 * is the other question a to-do list gets asked — *what have I just
	 * finished* — and it is not the same as either: `updatedAt` moves for a
	 * renamed title, so a completion is what `completedAt` records and what
	 * this orders by. Finished work first, newest at the top; everything
	 * unfinished keeps its own order underneath, because throwing that away is
	 * throwing away the order somebody arranged by hand.
	 */
	/*
	 * What the list is sorted by, and which way — two questions, not one.
	 *
	 * These used to be `newest | oldest | done`, cycled by a single button:
	 * `newest` and `oldest` are one field read two ways, so the list of
	 * "orders" was a field and a direction folded together, and the only way
	 * through them was to press until the right one came round. Separated, it
	 * is the same control a notebook's notes use.
	 */
	/*
	 * And the third question, which is the one a to-do list is really for:
	 * *what should I be doing*. Priority is the three ratings read together —
	 * urgency first, then the task that takes least out of you, then the one
	 * you most want to do — and it is `$lib/ratings` doing the reading, so this
	 * list and the `up_next` an assistant asks cannot disagree about it.
	 */
	const ORDERS = ['created', 'done', 'priority'] as const;
	type Order = (typeof ORDERS)[number];

	/* The field's name only: which way it runs is the arrow's business now. */
	const ORDER_LABELS: Record<Order, PlainKey> = {
		created: 'todoRows.added',
		done: 'todoRows.done',
		priority: 'todoRows.priority'
	};

	let order = $state<Order>('created');
	let direction = $state<'asc' | 'desc'>('desc');
	$effect(() => {
		try {
			/*
			 * What was stored before the two were separated still means
			 * something: `newest` and `oldest` were the created field read each
			 * way, so they are read back as that rather than thrown away.
			 */
			const held = localStorage.getItem('ontoplano:todos-order');
			if (held === 'newest') {
				order = 'created';
				direction = 'desc';
			} else if (held === 'oldest') {
				order = 'created';
				direction = 'asc';
			} else if (held && (ORDERS as readonly string[]).includes(held)) {
				order = held as Order;
			}
			const heldWay = localStorage.getItem('ontoplano:todos-direction');
			if (heldWay === 'asc' || heldWay === 'desc') direction = heldWay;
			// What the older setting said, so nobody's list flips on an update.
			else if (localStorage.getItem('ontoplano:todos-newest') === '0') {
				order = 'created';
				direction = 'asc';
			}
		} catch {
			// A private window, or storage refused. The default stands.
		}
	});

	function remember() {
		try {
			localStorage.setItem('ontoplano:todos-order', order);
			localStorage.setItem('ontoplano:todos-direction', direction);
		} catch {
			// It still works for this visit; only the memory is lost.
		}
	}

	function pickOrder(next: Order) {
		order = next;
		remember();
	}

	function flipDirection() {
		direction = direction === 'asc' ? 'desc' : 'asc';
		remember();
	}

	/** Finished first, newest of them at the top; the rest as they were. */
	function byLastDone(a: Todo, b: Todo): number {
		if (!a.completedAt && !b.completedAt) return 0;
		if (!a.completedAt) return 1;
		if (!b.completedAt) return -1;
		return b.completedAt.localeCompare(a.completedAt);
	}

	let visibleTodos = $derived.by(() => {
		// A row whose delete is being held is already gone as far as the person
		// is concerned — the toast is what is holding it, not the list.
		const here = todos.filter((t: Todo) => !isLeaving(`todo:${t.id}`));
		let shown = showCompleted
			? here
			: here.filter((t: Todo) => lingering.has(t.id) || !CLOSED_STATUSES.includes(shownStatus(t)));

		// Away unless asked for. An archived task is one somebody has decided
		// not to look at, so the list honours that until they say otherwise.
		if (!showArchived) shown = shown.filter((t: Todo) => t.archivedAt === null);

		if (notebookFilter === 'none') shown = shown.filter((t: Todo) => t.notebookId === null);
		else if (notebookFilter !== '')
			shown = shown.filter((t: Todo) => String(t.notebookId) === notebookFilter);

		shown = byTag(shown);

		const wanted = looking.trim();
		if (wanted !== '') {
			// The title first, then everything else written on it: a word in the
			// notes is how somebody finds the task they described rather than
			// named.
			shown = shown.filter(
				(t: Todo) =>
					matchScore(t.title, wanted) !== null ||
					(t.notes ?? '').toLowerCase().includes(wanted.toLowerCase()) ||
					t.tags.some((one) => one.name.includes(wanted.toLowerCase()))
			);
		}

		if (order === 'done') {
			const done = [...shown].sort(byLastDone);
			return direction === 'asc' ? done.reverse() : done;
		}

		if (order === 'priority') {
			/*
			 * Ties past the three ratings keep the order somebody arranged by
			 * hand, rather than falling back on when they were written down.
			 */
			const best = [...shown].sort(compareByPriority);
			return direction === 'asc' ? best.reverse() : best;
		}

		return [...shown].sort((a: Todo, b: Todo) =>
			direction === 'desc'
				? b.createdAt.localeCompare(a.createdAt)
				: a.createdAt.localeCompare(b.createdAt)
		);
	});

	/** Whatever the notebook picker lets through, before the two toggles. */
	let inScope = $derived.by(() => {
		let held = todos;
		if (notebookFilter === 'none') held = held.filter((t: Todo) => t.notebookId === null);
		else if (notebookFilter !== '')
			held = held.filter((t: Todo) => String(t.notebookId) === notebookFilter);
		held = byTag(held);
		return held;
	});

	/**
	 * The tasks a note on a task may point at, by their number in this notebook.
	 *
	 * Only inside a notebook: `TASK:#4` means the fourth task *of that
	 * notebook*, and in the room — where every notebook's tasks sit together —
	 * four different tasks answer to it. A room row draws the reference as the
	 * characters somebody typed, which is the honest answer to an ambiguous
	 * number.
	 */
	const todoRefs = $derived(
		notebookId === null
			? undefined
			: new Map(
					todos
						.filter((one: Todo) => one.notebookSeq !== null)
						.map((one: Todo) => [
							one.notebookSeq as number,
							{ title: one.title, done: CLOSED_STATUSES.includes(one.status) }
						])
				)
	);

	/** Every label on this list, so the picker offers what is actually there. */
	let tagsInUse = $derived(
		[...new Set(todos.flatMap((t: Todo) => t.tags.map((one) => one.name)))].sort((a, b) =>
			a.localeCompare(b)
		)
	);

	/*
	 * The two filters, as the picker wants them.
	 *
	 * "Every" and "not in one" first, because they are answers rather than the
	 * absence of an answer, and then whatever this account actually has.
	 */
	let notebookChoices = $derived([
		{ value: '', label: t('todoRows.everyNotebook') },
		{ value: 'none', label: t('todoRows.notInOne') },
		...notebooks.map((book) => ({ value: String(book.id), label: book.title }))
	]);

	/*
	 * Several labels at once, because one was not a filter.
	 *
	 * "Show me the urgent ones" is a question a single label answers; "the
	 * urgent ones and the ones about the house" is the question anybody with a
	 * list long enough to filter is actually asking. Any of them rather than
	 * all: a task carries two or three labels, and asking for the ones
	 * carrying every label you picked usually asks for nothing.
	 *
	 * "No label" stands apart — it is not a label, so it cannot be combined
	 * with one, and choosing it clears the rest.
	 */
	const NO_TAG = 'none';

	let tagChoices = $derived([
		{ value: NO_TAG, label: t('todoRows.noTag') },
		...tagsInUse.map((name) => ({ value: name, label: name }))
	]);

	function byTag(rows: Todo[]): Todo[] {
		if (tagFilter.length === 0) return rows;
		if (tagFilter.includes(NO_TAG)) return rows.filter((t: Todo) => t.tags.length === 0);
		return rows.filter((t: Todo) => t.tags.some((one) => tagFilter.includes(one.name)));
	}

	/** How many are hidden by the two toggles, so neither is a silent filter. */
	let putAway = $derived(inScope.filter((t: Todo) => t.archivedAt !== null).length);

	/**
	 * Finished and out of sight, counted.
	 *
	 * A notebook's tab says "Tasks 1/1" — one task, one of them done — and the
	 * panel under it said "Nothing waiting. A to-do is a task with no day on
	 * it." So the tab claimed there was a task and the list claimed there was
	 * none, which reads as a list that has stopped being updated rather than
	 * one that is hiding what it was told to hide. Counted here and said out
	 * loud, on the button and in the empty state.
	 */
	let finished = $derived(
		inScope.filter((t: Todo) => t.archivedAt === null && CLOSED_STATUSES.includes(shownStatus(t)))
			.length
	);

	/** How many the two toggles are holding back when the list comes out empty. */
	let hiddenHere = $derived((showCompleted ? 0 : finished) + (showArchived ? 0 : putAway));

	/**
	 * Whether anything is being narrowed by, beyond the two toggles.
	 *
	 * The toggles were the only filters when this list was written, so an
	 * empty list was either "nothing here" or "it is all finished". There are
	 * four more now — a notebook, labels, a search box, and the notebook this
	 * list is inside — and searching for something nothing matches was
	 * answering "Nothing waiting. A task is one with no day on it", which is a
	 * list telling you it is empty while it is holding six rows back.
	 */
	let narrowed = $derived(
		notebookFilter !== '' || tagFilter.length > 0 || looking.trim().length > 0
	);

	/**
	 * What is narrowing the list, in the words the controls use.
	 *
	 * Said on the filter button while the controls are folded away, because a
	 * filter somebody cannot see is a filter they forget is on — which is the
	 * one way folding these can go wrong.
	 */
	function narrowing(): string {
		const said: string[] = [];
		if (showCompleted) said.push(t('todoRows.completed'));
		if (showArchived) said.push(t('todoRows.archived'));
		if (notebookFilter !== '')
			said.push(notebookChoices.find((one) => one.value === notebookFilter)?.label ?? '');
		for (const one of tagFilter) said.push(one === NO_TAG ? t('todoRows.noTag') : `#${one}`);
		return said.filter(Boolean).join(', ');
	}

	/** Back to everything, in one press. The search box is not a filter here —
	    it is the thing being typed into, and clearing it under the cursor is
	    the app taking the word out of somebody's hands. */
	function clearFilters() {
		showCompleted = false;
		showArchived = false;
		notebookFilter = '';
		tagFilter = [];
		selectedIndex = 0;
	}

	function isDone(todo: Todo): boolean {
		return shownStatus(todo) === 'done';
	}

	/**
	 * Ticking one off, with a few seconds to have meant something else.
	 *
	 * Clicking the box a second time inside the window is the same gesture as
	 * pressing Undo in the toast, so it cancels rather than queueing the
	 * opposite write behind the first.
	 */
	const deferComplete =
		(todo: Todo): SubmitFunction =>
		({ action, formData, cancel }) => {
			const key = undoKey(todo);
			if (isPending(key)) {
				cancel();
				cancelFor(key);
				return;
			}
			if (todo.status === 'done') return;

			cancel();

			const write = (status: string) => {
				const body = new FormData();
				body.set('id', String(todo.id));
				body.set('status', status);
				return fetch(action, {
					method: 'POST',
					body,
					headers: { 'x-sveltekit-action': 'true' }
				}).then(() => invalidateAll());
			};

			// Seen to be done before it goes. See `lingering` above.
			linger(todo.id);

			// Written now, not when the toast expires: a todo that says done here
			// and is still open everywhere it is counted is one screen telling two
			// stories. Undo puts it back to todo.
			changeNow(
				key,
				t('todoRows.completedTitle', { title: todo.title }),
				() => write(String(formData.get('status') ?? 'done')),
				() => write('todo')
			);
		};

	/** Today, as the value the scheduling form wants. */
	function todayStr(): string {
		return formatDate(new Date());
	}

	function startNew() {
		showForm = true;
		editingId = null;
		formRatings = { urgency: null, interest: null, ease: null };
		// Inside a notebook, a new task starts in it; in the room, in none.
		formNotebookId = notebookId;
	}

	/**
	 * Deleting waits, so it can still be called off.
	 *
	 * The confirm in place says "are you sure" before the fact, which is the
	 * wrong moment: you are sure until you are not, and that turns out about
	 * two seconds later. So the press is taken as meaning it, the row goes,
	 * and the toast holds the request for a few seconds with the way back on
	 * it — the same arrangement Inventory has.
	 */
	const deferDelete =
		(id: number, title: string): SubmitFunction =>
		({ action, formData, cancel }) => {
			cancel();
			confirmingDelete = null;
			deleteLater(`todo:${id}`, title, () => {
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
	 * Which slider to land on when the form opens, if any.
	 *
	 * Opening from the gauges on a row should arrive at the gauges in the form
	 * rather than at the top of a dialog somebody then has to scroll.
	 */
	let openAtRatings = $state(false);

	function startEdit(todo: Todo, where?: { atRatings?: boolean }) {
		editingId = todo.id;
		showForm = true;
		formRatings = { ...todo.ratings };
		formNotebookId = todo.notebookId;
		openAtRatings = where?.atRatings === true;
	}

	/*
	 * Land on the first scale, once the dialog has actually drawn one.
	 *
	 * The focus is the point rather than the scroll: it puts the arrow keys on
	 * the rating somebody pressed, and bringing it into view follows from that.
	 */
	$effect(() => {
		if (!showForm || !openAtRatings) return;
		openAtRatings = false;
		/*
		 * After the dialog's own opening move, not during it.
		 *
		 * A modal puts the cursor in its first field when it opens, and that
		 * happens after this effect runs — so focusing here was focusing
		 * something about to be focused over. Two frames is after the dialog has
		 * settled and still before anybody could have typed.
		 */
		void tick().then(() =>
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					const first = document.querySelector<HTMLInputElement>('#todo-form input[type="range"]');
					first?.focus();
					first?.scrollIntoView({ block: 'center' });
				})
			)
		);
	});

	function startDelegate(todo: Todo) {
		delegatingId = todo.id;
	}

	function formatDate(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!shortcutRoom) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			showForm = false;
			editingId = null;
			delegatingId = null;
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

		const action = getAction(shortcutRoom, e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'navigate-down':
				confirmingDelete = null;
				if (visibleTodos.length > 0) {
					selectedIndex = Math.min(selectedIndex + 1, visibleTodos.length - 1);
				}
				break;
			case 'navigate-up':
				confirmingDelete = null;
				if (visibleTodos.length > 0) {
					selectedIndex = Math.max(selectedIndex - 1, 0);
				}
				break;
			case 'new':
				startNew();
				break;
			case 'edit':
				if (visibleTodos.length > 0 && visibleTodos[selectedIndex]) {
					startEdit(visibleTodos[selectedIndex]);
				}
				break;
			case 'toggle-done':
				if (visibleTodos.length > 0 && visibleTodos[selectedIndex]) {
					const f = document.getElementById(`toggle-form-${visibleTodos[selectedIndex].id}`);
					if (f instanceof HTMLFormElement) f.requestSubmit();
				}
				break;
			case 'delegate':
				if (
					visibleTodos.length > 0 &&
					visibleTodos[selectedIndex] &&
					!isDone(visibleTodos[selectedIndex])
				) {
					startDelegate(visibleTodos[selectedIndex]);
				}
				break;
			case 'delete':
				if (visibleTodos.length > 0 && visibleTodos[selectedIndex]) {
					// Arms the confirmation only. Deleting takes a deliberate click.
					confirmingDelete = visibleTodos[selectedIndex].id;
				}
				break;
		}
	}

	function editingTodo(): Todo | null {
		return editingId ? (todos.find((t: Todo) => t.id === editingId) ?? null) : null;
	}

	$effect(() => {
		if (selectedIndex >= visibleTodos.length && visibleTodos.length > 0) {
			selectedIndex = visibleTodos.length - 1;
		}
	});

	// Handed up rather than called from up there: the form belongs to this
	// component, and a screen drawing its own New button opens this one.
	$effect(() => {
		openNew = startNew;
		openTodo = (id: number) => {
			const one = todos.find((t: Todo) => t.id === id);
			if (one) startEdit(one);
		};
	});

	/*
	 * This screen's one verb, drawn by the room's bar — see $lib/room-action.
	 *
	 * Only when this list *is* the screen. Inside a notebook it is one tab of
	 * three, and claiming the bar there replaced the page's own "New notebook"
	 * with "New to-do" the moment somebody looked at the Tasks tab — beside a
	 * New task button the notebook already draws for itself. Same rule as the
	 * keyboard above it: a list sitting inside a page does not swallow what
	 * belongs to the page.
	 */
	// Read once, on purpose: which screen this list belongs to is fixed for the
	// life of the component, and the bar is claimed at init or not at all.
	// svelte-ignore state_referenced_locally
	if (shortcutRoom && (claimsRoomBar ?? true))
		setRoomAction(() => ({
			label: t('app.newToDo'),
			run: startNew,
			tour: newTour ?? '',
			kbd: keyFor(shortcutRoom, 'new')
		}));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<!--
		The filters and the list they narrow are one object.

		They were a row of controls on the page's own ground with a card under
		it, so the thing acting and the thing acted on read as two. The
		controls sit along the top of the same surface now, with the rule
		beneath them doing the separating — the shape the inventory room has.
		Both empty states are inside it too: a room that is one object when it
		is full and two when it is empty is worse than either.
	-->
	<div class={framed ? 'border border-gray-200 bg-white shadow-card' : ''}>
		<RoomToolbar inset>
			{#snippet tools()}
				<!--
					The controls that narrow the list, folded until they are wanted.

					Seven of them needed three rows at 390px — a third of the screen
					spent before a single task. `FilterBar` holds the four that are
					pressed and leaves out the two that are not: the search box is
					typed into and the count and the order are read. What is
					narrowing the list is named on the button while it is shut, and
					the way back to everything stands beside it.
				-->
				<FilterBar
					name="tasks"
					on={narrowed || showCompleted || showArchived}
					summary={narrowing()}
					onclear={clearFilters}
				>
					{#snippet lead()}
						<!--
					A row of its own on a phone.

					Seven controls do not fit across 390px and the toolbar wrapped to
					three rows, which is the thing the note above it says it exists to
					prevent. The search box is the one you type into rather than
					press, so it takes the first line whole and the six small controls
					wrap under it — two rows instead of three, and a target the width
					of the screen for the one that wants a keyboard.
				-->
						<label
							class="order-first w-full min-w-32 sm:order-none sm:w-auto sm:max-w-56 sm:flex-1"
						>
							<span class="sr-only">{t('todoRows.searchTheseTasks')}</span>
							<input
								type="search"
								bind:value={looking}
								placeholder={t('todoRows.searchTheseTasks')}
								autocomplete="off"
								class="input input-sm"
							/>
						</label>
					{/snippet}
					{#snippet count()}
						<!--
					How many rows are on screen right now, beside the button that
					narrowed them.

					The two toggles say how many are hidden — archived, completed —
					and nothing said how many are left, so a list narrowed by a
					notebook and a label gave no number at all for the thing you are
					actually looking at.
				-->
						<span
							class="tabular shrink-0 self-center text-xs text-gray-500"
							title={t('todoRows.showingCount', { count: visibleTodos.length })}
						>
							<span class="sm:hidden">{visibleTodos.length}</span>
							<span class="hidden sm:inline"
								>{t('todoRows.showingCount', { count: visibleTodos.length })}</span
							>
						</span>
					{/snippet}
					{#snippet trailing()}
						<!-- The same control a notebook's notes use. See `SortControl`. -->
						<SortControl
							value={order}
							options={ORDERS}
							labels={ORDER_LABELS}
							{direction}
							onpick={pickOrder}
							onflip={flipDirection}
							label={t('todoRows.orderTasksBy')}
						/>
					{/snippet}
					<button
						onclick={() => (showCompleted = !showCompleted)}
						aria-pressed={showCompleted}
						class="btn btn-sm shrink-0"
					>
						<span class="sm:hidden">{t('todoRows.completed')}</span>
						<span class="hidden sm:inline"
							>{showCompleted
								? t('todoRows.hideCompleted')
								: t('todoRows.showCompletedCount', { count: finished })}</span
						>
					</button>
					<!-- Named with its number so a put-away task is never quietly gone:
				     nothing is hidden without the list saying how much. -->
					<button
						onclick={() => (showArchived = !showArchived)}
						aria-pressed={showArchived}
						class="btn btn-sm"
						hidden={putAway === 0 && !showArchived}
					>
						{showArchived
							? t('todoRows.hideArchived')
							: t('todoRows.showArchivedCount', { count: putAway })}
					</button>
					{#if notebookId === null}
						<!-- "Not in one" is an answer, not the absence of a filter: a task
					     nobody has placed is the thing people go looking for.

					     A `Picker` rather than a `<select>`: a form field dropped into
					     a row of buttons is a form field that wandered in, and these
					     two narrow what is on screen rather than submitting anything.
					     Wide enough for the word — two controls both squeezed to
					     "Ever…" are two controls nobody can tell apart. -->
						<Picker
							value={notebookFilter}
							options={notebookChoices}
							onpick={(next) => (notebookFilter = next)}
							label={t('ui.notebook')}
							class="min-w-36 flex-1 sm:flex-none"
						/>
					{/if}
					<!-- Only where there is something to pick: a list nobody has labelled
				     gets no control for labels. -->
					{#if tagsInUse.length > 0}
						<Picker
							values={tagFilter}
							options={[{ value: '', label: t('todoRows.everyTag') }, ...tagChoices]}
							onpickMany={(next) => {
								// Two rows that are not labels. "Every tag" is the way back to
								// no filter at all, and "no label" answers the question on its
								// own — neither combines with a label.
								if (next.includes('')) tagFilter = [];
								else if (next.includes(NO_TAG))
									tagFilter = tagFilter.includes(NO_TAG)
										? next.filter((one) => one !== NO_TAG)
										: [NO_TAG];
								else tagFilter = next;
							}}
							label={t('todoRows.filterByTag')}
							class="min-w-28 flex-1 sm:flex-none"
						/>
					{/if}
					<!--
					Pushed to the right end, but only where there is a right end.

					`ml-auto` at every width made it wrap onto a line of its own on a
					phone: three ragged rows, the last one an empty half with one
					button at the far side of it. Inline below `sm`, where the row is
					already wrapping and there is nothing to separate it from; pushed
					away from the filters above that, where the distance says what it
					is — one of these hides rows, the other reorders them.
				-->
					<!--
					Looking for one, rather than choosing a kind.

					The controls beside this answer "which kind" — finished, put
					away, in this notebook, carrying that label. None of them
					answers "the one about the plumber", which is what somebody
					with three hundred tasks is actually asking. It narrows as you
					type and the count beside it says what is left.
				-->
				</FilterBar>
			{/snippet}
		</RoomToolbar>
		{#if visibleTodos.length === 0}
			<!--
				Empty because there is nothing, or empty because it is all hidden.
				Saying the first when the second is true is how a list that is
				doing as it was told reads as a list that is out of date.
			-->
			{#if narrowed}
				<EmptyState
					icon="search"
					title={t('todoRows.nothingToShow')}
					description={t('todoRows.noneMatchTheseFilters', { count: inScope.length })}
				/>
			{:else if hiddenHere > 0}
				<EmptyState
					icon="check"
					title={t('todoRows.nothingToShow')}
					description={t('todoRows.hiddenByTheFilters', { count: hiddenHere })}
				>
					{#snippet action()}
						<!--
							The way back, right here. The toggles that hid these are
							folded away with the other filters, and a sentence about
							hidden work must not send somebody hunting for the way
							to see it.
						-->
						<div class="flex justify-center gap-2">
							{#if !showCompleted && finished > 0}
								<button onclick={() => (showCompleted = true)} class="btn btn-sm">
									{t('todoRows.showCompletedCount', { count: finished })}
								</button>
							{/if}
							{#if !showArchived && putAway > 0}
								<button onclick={() => (showArchived = true)} class="btn btn-sm">
									{t('todoRows.showArchivedCount', { count: putAway })}
								</button>
							{/if}
						</div>
					{/snippet}
				</EmptyState>
			{:else}
				<EmptyState
					icon="check"
					title={showCompleted ? t('gallery.id.nothingHereYet') : t('todoRows.nothingWaiting')}
					description={showCompleted
						? t('todoRows.anythingYouFinishShowsUp')
						: t('todoRows.aToDoIsATask')}
				/>
			{/if}
		{:else}
			<div class="divide-y divide-gray-200" data-tour={listTour}>
				{#each visibleTodos as todo, i (todo.id)}
					<div
						use:keepInView={shortcutRoom !== null && selectedIndex === i}
						class="flex flex-wrap items-stretch gap-x-4 px-4 py-3 {shortcutRoom &&
						selectedIndex === i
							? 'kb-cursor'
							: ''} {isDone(todo) ? 'opacity-50' : ''}"
					>
						<!--
							The tick box and the three gauges are one column.

							He asked for them under the box rather than beside it, and that
							is also what makes them line up: every row's gauges start at the
							same x, whatever the title above them is doing.
						-->
						<div class="flex shrink-0 flex-col items-center gap-1 self-start">
							<form
								id="toggle-form-{todo.id}"
								method="post"
								action={actions.setStatus}
								use:enhance={deferComplete(todo)}
								class="flex"
							>
								<input type="hidden" name="id" value={todo.id} />
								<input
									type="hidden"
									name="status"
									value={todo.status === 'done' ? 'todo' : 'done'}
								/>
								<!--
								As tall as the row it belongs to.

								The box was 20px pinned to the top-left of a row that is often
								three lines tall — notes, a notebook, a column of icons — so it
								sat in a corner of a lot of nothing and was a small thing to hit
								besides. The target now runs the height of the row and the
								square is bigger and centred in it, which fills the space the
								rest of the row makes and gives the one action every row has the
								size it deserves.
							-->
								<!--
								At the top of the row, not down the middle of it.

								It was `self-stretch` and centred, so on a task with notes,
								labels and a gauge under the title the box floated halfway down
								beside none of them. The thing it ticks is the title, so it
								stands level with the title.

								And once a task is done it says when: the tick is the only part
								of the row that knows, and "did I do that this morning or last
								week" is the question somebody asks of a list they are looking
								back at.
							-->
								<button
									type="submit"
									class="-m-1 flex shrink-0 items-start justify-center self-start p-1 pointer-coarse:w-11"
									aria-label={isDone(todo)
										? t('todoRows.markIncomplete')
										: t('todoRows.markComplete')}
									title={isDone(todo) && todo.completedAt
										? t('todoRows.doneAgo', {
												when: momentOf(todo.completedAt, now()),
												ago: agoOf(todo.completedAt, now())
											})
										: undefined}
								>
									<span
										class="flex size-7 items-center justify-center border {isDone(todo)
											? 'border-gray-400 bg-gray-400'
											: 'border-gray-400 bg-white'}"
									>
										{#if isDone(todo)}
											<svg class="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
												<path
													fill-rule="evenodd"
													d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
													clip-rule="evenodd"
												/>
											</svg>
										{/if}
									</span>
								</button>
							</form>

							<!--
							Under the tick box, stacked.

							They were beside the labels under the title, which is where you
							read what a task *is*; these three answer what it would cost you.
							The rail the tick box stands in has the width and nothing under
							it, and stacked they line up across every row — which is the half
							of "make sure its aligned" that a row of pills could never do.

							All three, always. Drawing only the answered ones put the same
							question in a different place on every row, so the eye had to
							read each card from scratch; an unanswered one is drawn half
							full and grey, which says "nobody said" rather than "the lowest
							there is".
						-->
							<!--
							Pressing them opens the form on them.

							They are the one thing on a row that shows a number without
							offering a way to change it, and the way in was two presses
							through a dialog that opens somewhere else entirely.
						-->
							<button
								type="button"
								class="w-full cursor-pointer"
								onclick={() => startEdit(todo, { atRatings: true })}
								title={t('todoRows.setTheRatings')}
								aria-label={t('todoRows.setTheRatings')}
							>
								<RatingBadges values={todo.ratings} stacked class="w-full" />
							</button>
						</div>

						<!-- One row at every width: the actions are a narrow column of icons
						     now, which fits beside the title on a phone. -->
						<!--
							Wrapping, because the actions below are a full-width line: in a
							row that cannot wrap they are a sibling competing for the width
							instead, which squeezes the title to one letter per line.
						-->
						<div class="flex min-w-0 flex-1 flex-wrap gap-x-3">
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									{#if todo.categoryColor}
										<span
											class="h-3 w-1 shrink-0"
											style="background-color: {todo.categoryColor}"
											title={todo.categoryName}
										></span>
									{/if}
									<!--
										`min-w-0` because a flex item will not shrink below its own
										content by default: a long title stopped being able to wrap,
										widened the row past the card, and took the whole list off
										the side of the screen with it. `break-words` so a single
										long word breaks rather than doing the same thing again.
									-->
									<!-- Finished is grey, not struck through: the tick and the
									     colour say it already, and a line through a title is one
									     more thing to read past. -->
									<!--
										Pressing the title reads the task; it does not edit it.

										The chevron's space is kept on every row, drawn only where
										there is something under the title — so the titles line up
										and nothing moves sideways as rows gain and lose notes.
									-->
									<span class="flex min-w-0 items-baseline gap-1.5">
										<span class="w-3 shrink-0 text-gray-400">
											{#if hasMore(todo)}
												<Icon
													name={openNotes.has(todo.id) ? 'chevron-down' : 'chevron-right'}
													size={12}
												/>
											{/if}
										</span>
										{#if hasMore(todo)}
											<button
												type="button"
												onclick={() => toggleNotes(todo.id)}
												aria-expanded={openNotes.has(todo.id)}
												class="min-w-0 text-left text-sm font-medium break-words {isDone(todo)
													? 'text-gray-400'
													: 'text-gray-900'}">{todo.title}</button
											>
										{:else}
											<span
												class="min-w-0 text-sm font-medium break-words {isDone(todo)
													? 'text-gray-400'
													: 'text-gray-900'}">{todo.title}</span
											>
										{/if}
									</span>
									{#if todo.scheduledDate}
										<span
											class="tabular border border-gray-200 bg-gray-50 px-1 text-[10px] text-gray-600"
											title={t('todoRows.pulledOntoThisDay')}
										>
											{todo.scheduledDate}
										</span>
									{/if}
									{#if todo.archivedAt}
										<span
											class="border border-gray-200 bg-gray-50 px-1 text-[10px] text-gray-600"
											title={t('todoRows.putAway')}
										>
											{t('todoRows.archived')}
										</span>
									{/if}
								</div>
								<!--
									A recording is a player and a picture is a picture, not the
									address of either.

									Notes are drawn as a line of text, and both attachments are
									stored as ordinary markdown — right for the text, wrong on
									the screen, where the row reads as
									`[ring the plumber](/media/audio/40)`. `Written` takes them
									out of the line and draws them under it, the same way an
									idea's are drawn. They are always there when there are any,
									so nothing moves when the row is pressed.
								-->
								{#if todo.notes}
									<!--
										The words under the title open it too.

										The title was the only thing that unfolded a task, and the
										line under it — the one you are reading when you want the
										rest — did nothing. It is a press now, wherever there is
										something to unfold. A picture or a recording inside is
										still its own control: the press is caught here rather than
										bound to the whole block, so playing something does not
										fold the row.
									-->
									{#if hasMore(todo)}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div
											class="cursor-pointer"
											onclick={(press) => {
												const target = press.target as HTMLElement;
												if (target.closest('a, button, audio, input, textarea')) return;
												toggleNotes(todo.id);
											}}
										>
											<Written
												content={todo.notes}
												compact
												oneLine={!openNotes.has(todo.id)}
												todos={todoRefs}
											/>
										</div>
									{:else}
										<Written
											content={todo.notes}
											compact
											oneLine={!openNotes.has(todo.id)}
											todos={todoRefs}
										/>
									{/if}
								{/if}
								<!-- Pressing one narrows the list to it, the way an idea's do:
								     a label is only useful if reading back one of them is a
								     press rather than a trip to a filter. -->
								<!--
									The three gauges, in the room the tick used to take.

									Under the title rather than in it: the title line is what
									somebody scans, and three small objects in the middle of it
									were three things to read past. Here they sit with the
									labels, which is the other thing you look at when you are
									choosing what to do rather than reading what it is.
								-->
								{#if todo.tags.length > 0}
									<div class="mt-1 flex flex-wrap items-center gap-1">
										{#each todo.tags as tag (tag.id)}
											<!--
												The chip says when it went on.
												
												Which is the whole reason the join carries a date: a
												list of labels says what is true and says nothing
												about what is new. Under the pointer rather than
												beside the word, because the age matters when you go
												looking for it and would be noise on every row at
												once. A label from before the column existed simply
												does not say — an invented date would be read as real.
											-->
											<TagChip
												name={tag.name}
												active={tagFilter.includes(tag.name)}
												title={tag.taggedAt
													? t('todoRows.taggedAgo', { ago: agoOf(tag.taggedAt, now()) })
													: undefined}
												onclick={() => {
													// Pressing a label adds it to the filter rather than
													// replacing it, so two presses is two labels — the
													// same thing the picker above does.
													tagFilter = tagFilter.includes(tag.name)
														? tagFilter.filter((one) => one !== tag.name)
														: [...tagFilter.filter((one) => one !== NO_TAG), tag.name];
													selectedIndex = 0;
												}}
											/>
										{/each}
									</div>
								{/if}
								<Backlinks
									goals={goalLinks[todo.id]}
									notebook={notebookId === null && todo.notebookId && todo.notebookTitle
										? { id: todo.notebookId, title: todo.notebookTitle }
										: null}
								/>
							</div>

							<!--
								Under the words, not beside them.

								The actions were a block three buttons wide pinned to the
								right-hand edge, which on a phone took a third of the row and
								left the title with barely enough space to break a word in —
								"letters barely have space there to span". A note card has
								never done that: its buttons sit on a line of their own under
								the text, pushed right. Same here, at every width, because it
								reads better on a laptop too.
							-->
							<div class="task-actions">
								{#if !isDone(todo)}
									<!-- One column changes; nothing is copied anywhere. -->
									<form method="post" action={actions.schedule} use:enhance>
										<input type="hidden" name="id" value={todo.id} />
										<input
											type="hidden"
											name="scheduledDate"
											value={todo.scheduledDate ? '' : todayStr()}
										/>
										<button
											type="submit"
											class="icon-btn"
											aria-pressed={!!todo.scheduledDate}
											aria-label={todo.scheduledDate
												? t('todoRows.putBackOnTheGeneral')
												: t('todoRows.pullOntoToday')}
											title={todo.scheduledDate
												? t('todoRows.putBackOnTheGeneral')
												: t('todoRows.pullOntoToday')}
										>
											<Icon name={todo.scheduledDate ? 'undo' : 'arrow-down'} />
										</button>
									</form>
								{/if}
								{#if !isDone(todo)}
									<button
										onclick={() => startDelegate(todo)}
										class="icon-btn"
										title={t('todoRows.delegateToADay')}
										aria-label={t('todoRows.delegateToADay')}
									>
										<Icon name="calendar" />
									</button>
								{/if}
								<button
									title={t('ui.edit')}
									aria-label={t('ui.edit')}
									onclick={() => startEdit(todo)}
									class="icon-btn"
								>
									<Icon name="edit" />
								</button>
								<!--
									Away, and back. Not a confirmation: putting a task away is
									the reversible one — the button beside it is what deletes,
									and that one asks.
								-->
								<!-- Plain `use:enhance`: the default applies the result and
								     re-reads the page, which is how the row leaves the list. -->
								<form method="post" action={actions.archive} use:enhance>
									<input type="hidden" name="id" value={todo.id} />
									<input type="hidden" name="away" value={todo.archivedAt ? 'false' : 'true'} />
									<button
										type="submit"
										class="icon-btn"
										title={todo.archivedAt
											? t('todoRows.takeItBackOut')
											: t('finance.ledgers.putItAway')}
										aria-label={todo.archivedAt
											? t('todoRows.takeItBackOut')
											: t('finance.ledgers.putItAway')}
									>
										<Icon name={todo.archivedAt ? 'undo' : 'archive'} />
									</button>
								</form>
								{#if confirmingDelete === todo.id}
									<form
										id="delete-form-{todo.id}"
										method="post"
										action={actions.remove}
										use:enhance={deferDelete(todo.id, todo.title)}
									>
										<input type="hidden" name="id" value={todo.id} />
										<button type="submit" class="btn btn-sm btn-danger" use:armed>
											{t('todoRows.confirm')}
										</button>
									</form>
									<button
										type="button"
										onclick={() => {
											confirmingDelete = null;
										}}
										class="btn btn-sm"
									>
										{t('ui.cancel')}
									</button>
								{:else}
									<button
										title={t('ui.delete')}
										aria-label={t('ui.delete')}
										type="button"
										onclick={() => {
											confirmingDelete = todo.id;
										}}
										class="icon-btn icon-btn-danger"
									>
										<Icon name="trash" />
									</button>
								{/if}

								<!--
									This task's number inside its notebook, quietly, at the end
									of the row.

									It is what a note points at — `TASK:#4` — and what somebody
									says out loud when they mean a particular task, so it has to
									be on the screen: the row id never was, and "the one about
									the plumber" is the only other way to name one. Bottom right,
									under the actions, because it is a label rather than a
									control. A task filed under nothing has no number and shows
									none.
								-->
								{#if todo.notebookSeq !== null}
									<span class="tabular order-first mr-auto text-[11px] text-gray-500">
										#{todo.notebookSeq}
									</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<Modal
		bind:open={showForm}
		{error}
		title={editingId ? t('todoRows.editToDo') : t('app.newToDo')}
		onclose={() => (editingId = null)}
	>
		{@const editing = editingTodo()}
		<!--
			What was typed survives an accidental close.

			The modal unmounts its body, which is right — the same dialog is
			reused for different tasks — so the fields cannot survive and what
			they held is written down instead. Keyed by which form this is: a
			half-written new task must not come back over a task being edited.
			See `$lib/kept-form`.
		-->
		<form
			id="todo-form"
			use:keptForm={editingId ? `edit-todo-${editingId}` : 'new-todo'}
			method="post"
			action={editingId ? actions.update : actions.create}
			use:enhance={() => {
				const wasEditing = editingId;
				return async ({ update, result }) => {
					await update({ reset: false });
					if (result.type !== 'success') return;

					/*
					 * The app answers the press.
					 *
					 * A task made in a notebook used to appear in a list that had
					 * just reordered itself, with nothing saying it had worked. A
					 * new one offers Edit rather than Undo — you asked for it and
					 * it is there, so the useful next move is saying more about
					 * it, and taking it back is what delete is for.
					 */
					const made = Number(result.data?.id ?? 0);
					if (wasEditing) say(t('todoRows.saved'));
					else if (made > 0)
						say(t('todoRows.taskAdded'), {
							label: t('ui.edit'),
							run: () => {
								const todo = todos.find((one: Todo) => one.id === made);
								if (todo) startEdit(todo);
							}
						});
					else say(t('todoRows.taskAdded'));

					// Saved, so there is no draft to come back to.
					discardForm(wasEditing ? `edit-todo-${wasEditing}` : 'new-todo');
					showForm = false;
					editingId = null;
				};
			}}
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}

			<FormGrid>
				<TodoFields
					title={editing?.title ?? ''}
					notes={editing?.notes ?? ''}
					categoryId={editing?.categoryId ?? null}
					bind:notebookId={formNotebookId}
					tags={editing?.tags.map((one) => one.name).join(', ') ?? ''}
					scheduledDate={editing?.scheduledDate ?? ''}
					{categories}
					{notebooks}
					bind:ratings={formRatings}
				/>
			</FormGrid>
		</form>

		{#snippet footer()}
			<!--
				Delete sits away from the two safe buttons, at the far left.
				
				A task being edited is a task somebody may have decided against,
				and closing the form to hunt the row's own delete is the long way
				round. Not beside Save, though: the destructive one and the one
				everybody presses should never be neighbours, and a press aimed at
				Save that lands one button over must not be a deletion. Armed
				first, like every other delete in the app.
			-->
			{#if editingId}
				<form
					method="post"
					action={actions.remove}
					class="mr-auto"
					use:enhance={(event) => {
						/*
						 * Run the submit first, then close.
						 *
						 * This closed the form before running it, and the form lives
						 * inside `{#if editingId}` — so clearing that took the form
						 * out of the DOM while its own submission was still being
						 * set up, and the press did nothing at all. Closing is
						 * deferred to after the handler has read the event.
						 */
						const outcome = deferDelete(editingId!, editingTodo()?.title ?? '')(event);
						// The dialog closes now; `editingId` is what keeps this form
						// mounted, so it is cleared only once the submit has been
						// read — clearing it here took the form out of the DOM
						// mid-flight and the press did nothing at all.
						showForm = false;
						queueMicrotask(() => (editingId = null));
						return outcome;
					}}
				>
					<input type="hidden" name="id" value={editingId} />
					<button type="submit" class="btn btn-danger" use:armed>
						<Icon name="trash" />
						{t('ui.delete')}
					</button>
				</form>
			{/if}
			<!--
				What the three answers come to, while they are being answered.

				In the middle of the footer because it is about the whole form
				rather than about either button beside it, and live because the
				number is the only way to see what moving one slider did to the
				task's place in the list.
			-->
			<span class="flex-1 text-center text-sm" title={t('ratings.whereItWouldSit')}>
				<span class="tabular text-gray-700">
					{t('ratings.nthInLine', { nth: ordinal(t, draftPlace) })}
				</span>
			</span>

			<!--
				Cancel throws the draft away; Escape and the backdrop keep it.

				Both close the form, and they are not the same act: one is
				somebody saying they are finished with it, the other is a slip.
			-->
			<button
				type="button"
				class="btn"
				onclick={() => {
					discardForm(editingId ? `edit-todo-${editingId}` : 'new-todo');
					showForm = false;
				}}>{t('ui.cancel')}</button
			>
			<button type="submit" form="todo-form" class="btn btn-primary">
				{editingId ? t('ui.save') : t('todoRows.createTodo')}
			</button>
		{/snippet}
	</Modal>

	<Modal
		open={delegatingId !== null}
		{error}
		onclose={() => (delegatingId = null)}
		title={t('todoRows.putItOnADay')}
		description={t('todoRows.itKeepsItsPlaceIn')}
		size="sm"
	>
		{@const todo = todos.find((t: Todo) => t.id === delegatingId)}
		{#if todo}
			<form
				id="delegate-form"
				method="post"
				action={actions.delegate}
				use:enhance={() => {
					return async ({ update }) => {
						await update({ reset: false });
						delegatingId = null;
					};
				}}
			>
				<input type="hidden" name="id" value={todo.id} />
				<input type="hidden" name="mode" value="category" />

				<p class="mb-3 text-sm font-medium text-gray-900">{todo.title}</p>

				<FormGrid>
					<Field label={t('ui.date')} span={6} required>
						<input
							autocomplete="off"
							name="date"
							type="date"
							required
							value={formatDate(new Date())}
							class="input"
						/>
					</Field>
					<Field label={t('todoRows.time')} span={3} required>
						<input
							autocomplete="off"
							name="startTime"
							type="time"
							required
							value="09:00"
							class="input tabular"
						/>
					</Field>
					<Field label={t('todoRows.minutes')} span={3}>
						<NumberBox autocomplete="off" name="durationMinutes" min="15" step="15" value="60" />
					</Field>
					<Field label={t('ui.category')} span={12} required>
						<select name="categoryId" required class="select">
							{#each categories as cat (cat.id)}
								<option value={cat.id}>{cat.name}</option>
							{/each}
						</select>
					</Field>
				</FormGrid>
			</form>
		{/if}

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (delegatingId = null)}
				>{t('ui.cancel')}</button
			>
			<button type="submit" form="delegate-form" class="btn btn-primary"
				>{t('todoRows.putOnTheDay')}</button
			>
		{/snippet}
	</Modal>
</div>
