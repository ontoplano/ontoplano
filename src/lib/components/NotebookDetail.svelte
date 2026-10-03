<script lang="ts">
	import { Reveal, revealNear } from '$lib/reveal.svelte';
	import GoalFields, { type FormTarget } from '$lib/components/fields/GoalFields.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import MarkdownBox from '$lib/components/MarkdownBox.svelte';
	import { page } from '$app/state';
	import TagInput from '$lib/components/TagInput.svelte';
	import { civilOf, momentOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { tick, untrack, type ComponentProps, type Snippet } from 'svelte';
	import { enhance } from '$lib/enhance';
	import { MediaQuery, SvelteSet } from 'svelte/reactivity';
	import OneLine from '$lib/components/OneLine.svelte';
	import { resolve } from '$app/paths';
	import { armed } from '$lib/actions/armed';
	import { BackCloses } from '$lib/back-closes';
	import { SPLIT_MEDIA, isPhone } from '$lib/breakpoints';
	import { keepInView } from '$lib/actions/keep-in-view';
	import TabStrip from '$lib/components/TabStrip.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import PictureAttach from '$lib/components/PictureAttach.svelte';
	import { type Horizon } from '$lib/goals';
	import GoalCard from '$lib/components/GoalCard.svelte';
	import GoalLinksModal from '$lib/components/GoalLinksModal.svelte';
	import { NOTEBOOK_GOAL_ACTIONS } from '$lib/goal-action-names';
	import { CLOSED_STATUSES } from '$lib/task-status';
	import {
		DEFAULT_NOTE_ORDER,
		defaultDirectionFor,
		NOTE_DIRECTION_KEY,
		NOTE_ORDERS,
		NOTE_ORDER_KEY,
		isNoteDirection,
		isNoteOrder,
		orderNotes,
		type NoteDirection,
		type NoteOrder
	} from '$lib/note-order';
	import TodoRows from '$lib/components/TodoRows.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import { Selection } from '$lib/selection.svelte';
	import SelectionBar from '$lib/components/SelectionBar.svelte';
	import RowCard from '$lib/components/RowCard.svelte';
	import SelectBox from '$lib/components/SelectBox.svelte';
	import BatchDialog from '$lib/components/BatchDialog.svelte';
	import type { EntryBatchVerb } from '$lib/services/diary';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import IdeaCard from '$lib/components/IdeaCard.svelte';
	import BillList from '$lib/components/BillList.svelte';
	import HabitCard from '$lib/components/HabitCard.svelte';
	import LedgerTile from '$lib/components/LedgerTile.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import WorkoutCard from '$lib/components/WorkoutCard.svelte';
	import ItemRow, { itemRowWash } from '$lib/components/ItemRow.svelte';
	import LinkIntoNotebook from '$lib/components/LinkIntoNotebook.svelte';
	import { NOTEBOOK_ITEM_ACTIONS } from '$lib/item-action-names';
	import { NOTEBOOK_WORKOUT_ACTIONS } from '$lib/workout-action-names';
	import { NOTEBOOK_HABIT_ACTIONS } from '$lib/habit-action-names';
	import { NOTEBOOK_BILL_ACTIONS } from '$lib/bill-action-names';
	import IdeaFields from '$lib/components/fields/IdeaFields.svelte';
	import BuyFields from '$lib/components/fields/BuyFields.svelte';
	import HabitFields from '$lib/components/fields/HabitFields.svelte';
	import LedgerFields from '$lib/components/fields/LedgerFields.svelte';
	import RecipeFields from '$lib/components/fields/RecipeFields.svelte';
	import WorkoutFields from '$lib/components/fields/WorkoutFields.svelte';
	import { NOTEBOOK_IDEA_ACTIONS } from '$lib/idea-action-names';
	import { DEFAULT_MODULES, moduleMeta, type NotebookModule } from '$lib/notebook-modules';
	import { ITEM_PARAM, TAB_PARAM } from '$lib/notebook-widget';
	import { moduleGlyph } from '$lib/glyphs';
	import type { Currency } from '$lib/money';
	import { NOTEBOOK_TODO_ACTIONS } from '$lib/todo-actions';
	import type { Todo } from '$lib/services/todos';
	import { browsable } from '$lib/browse.svelte';
	import { checklistItems } from '$lib/checklist';
	import { renderMarkdown } from '$lib/markdown';
	import { say } from '$lib/said.svelte';
	import { useT } from '$lib/i18n';
	import { describeRecurrence, parseRecurrence } from '$lib/recurrence';
	import type { PlainKey } from '$lib/i18n/keys';

	/** What the picker is given, per module. */
	type LinkableList = ComponentProps<typeof LinkIntoNotebook>['candidates'];

	const t = useT();
	const now = useWhen();

	/**
	 * One notebook: what is in it, and what can be done to it.
	 *
	 * The same thing on two screens — beside the list on the index, and alone on
	 * its own page — so it is a component rather than markup written twice. The
	 * forms post to actions the two routes share.
	 */
	type Entry = {
		id: number;
		seq: number | null;
		/** What it is called. Empty on anything written before notes had names. */
		title?: string;
		content: string;
		createdAt: string;
		/**
		 * When the row last changed, which is what the Edited order reads.
		 *
		 * Pinning and archiving touch it too. Neither shows: a pinned note is
		 * above the order altogether, and an archived one is not on screen
		 * unless it was asked for.
		 */
		updatedAt?: string | null;
		/** When it was put away, or null. Hidden, not deleted. */
		archivedAt?: string | null;
		tags: { id: number; name: string }[];
		people: { id: number; name: string }[];
	};

	let {
		notebook = null,
		contents = null,
		orphaned = [],
		showingOrphans = false,
		allPeople = [],
		categories = [],
		inventoryCategories = [],
		workoutCategories = [],
		parsers = [],
		currency = 'BRL',
		pickableNotebooks = [],
		locations = [],
		areas = [],
		workoutMeasures = [],
		slots = [],
		todos = [],
		allTodos = [],
		activities = [],
		composing = $bindable(false),
		/**
		 * The New button for whichever tab is showing, for the page to draw.
		 *
		 * It lives in the page's own header — the card's corner on the index, the
		 * title row on a notebook's own page — because the strip beside the tabs
		 * is where this notebook's controls go, and at 390px a button there costs
		 * the tabs the room they need. What it says and what it does follow the
		 * tab: New note while notes are showing, New task on Tasks, New goal on
		 * Goals. It said "New note" on all three, which is what this fixes.
		 */
		// `$bindable()` is a compiler directive, not an assignment: this one is
		// only ever written from here, which is what the rule mistakes it for.
		// eslint-disable-next-line no-useless-assignment
		newAction = $bindable(),
		/**
		 * The Link button, beside New, for whichever tab is showing.
		 *
		 * Drawn by the page for the same reason `newAction` is — the strip
		 * beside the tabs has no room for it at 390px. Every tab has it: a
		 * subject started halfway through has its things already, and the only
		 * way to gather them was to delete each one and write it again.
		 */
		// eslint-disable-next-line no-useless-assignment
		linkAction = $bindable()
	}: {
		notebook?: {
			id: number;
			title: string;
			description: string;
			/** What it holds, already narrowed by what this account has put away. */
			modules?: NotebookModule[];
		} | null;
		contents?: {
			entries: Entry[];
			todos: Todo[];
			blocks: {
				id: number;
				kind: 'weekly' | 'once';
				label: string | null;
				/** A one-off's day; null for one that repeats. */
				date: string | null;
				/** A repeating one's weekday and rhythm; null for a one-off. */
				weekday: number | null;
				recurrence: string | null;
				startTime: string;
			}[];
			/* The whole goal: the tab draws the goals room's own card. */
			goals: ComponentProps<typeof GoalCard>['goal'][];
			/* And the whole idea, for the same reason — see `IdeaCard`. */
			ideas: ComponentProps<typeof IdeaCard>['idea'][];
			/* And the whole bill, with the period its tick would pay and its history. */
			bills: ComponentProps<typeof BillList>['bills'];
			/* And the whole habit, with the days it has been logged. */
			habits: ComponentProps<typeof HabitCard>['habit'][];
			habitOccurrences: ComponentProps<typeof HabitCard>['occurrences'];
			/** The account's today, which the heatmap and the tick both read. */
			today: string;
			/** 0 for Monday — where the heatmap's weeks start. */
			weekFirstDay: number;
			/* The ledgers this subject's money moves through — see `LedgerTile`. */
			ledgers: ComponentProps<typeof LedgerTile>['ledger'][];
			/* And the whole recipe, with what the cupboard has not got. */
			recipes: ComponentProps<typeof RecipeCard>['recipe'][];
			/* And the whole workout, with the register under its plan. */
			workouts: ComponentProps<typeof WorkoutCard>['workout'][];
			workoutSessions: ComponentProps<typeof WorkoutCard>['sessions'];
			/* And the whole thing, with its count and its own fields. */
			inventory: ComponentProps<typeof ItemRow>['item'][];
			/* What each tab could take that it has not got — see `LinkIntoNotebook`. */
			linkable: Record<string, LinkableList>;
			/*
			 * The other modules, each as its room's own rows.
			 *
			 * Loosely typed on purpose: `ModuleTab` reads them through
			 * `$lib/notebook-rows`, which is the one place that knows what a
			 * habit's row looks like as against a bill's. Naming seven row types
			 * here would be that knowledge written twice.
			 */
			[module: string]: unknown;
		} | null;
		orphaned?: Entry[];
		showingOrphans?: boolean;
		/** Everybody already known, so the field completes rather than duplicates. */
		allPeople?: { id: number; name: string }[];
		/** What the Tasks tab's editor offers, the same as the to-do room's. */
		categories?: { id: number; name: string }[];
		/** What the other tabs' own forms offer, the same as their rooms'. */
		inventoryCategories?: { id: number; name: string }[];
		workoutCategories?: { id: number; name: string }[];
		parsers?: { key: string; name: string }[];
		/** For the money a ledger holds and a bill expects. */
		currency?: Currency;
		pickableNotebooks?: { id: number; title: string; modules: readonly string[] }[];
		/** Where a thing can live, for the Inventory tab's form. */
		locations?: { id: number; name: string; path: string }[];
		areas?: { id: number; name: string }[];
		workoutMeasures?: { activity: string; unit: string }[];
		/* What a goal on this notebook can be told to count. */
		slots?: { id: number; name: string; startTime: string }[];
		todos?: { id: number; title: string }[];
		allTodos?: { id: number; title: string; status: string }[];
		activities?: { id: number; name: string }[];
		/** Whether the composer is open, so a page can put the button elsewhere. */
		composing?: boolean;
		newAction?: { label: string; labels: string[]; run?: () => void; href?: string } | undefined;
		linkAction?: { label: string; run: () => void } | undefined;
	} = $props();

	let editingNoteId = $state<number | null>(null);

	/*
	 * Whether what is on screen is what was last saved.
	 *
	 * Saving used to close the editor, so "save and keep reading it" was save,
	 * find the note again, open it again. It stays open now, and the button
	 * says which of the two things pressing it will do: Save while there is
	 * something to save, Close once there is not. The two words are held in one
	 * fixed-width slot so the button does not change size as you type — that is
	 * the flicker to avoid, and it is the same rule as everywhere else.
	 *
	 * Reset whenever a different note is opened, because it is a fact about the
	 * editor on screen and not about any note.
	 */
	let noteSaved = $state(false);

	/**
	 * Whether the put-away notes are showing.
	 *
	 * Away by default, which is what putting away means. A notebook kept for a
	 * year holds notes that have stopped being interesting and are still not
	 * things to delete, and a list of forty where six are current is a list
	 * nobody reads.
	 */
	let showArchivedNotes = $state(false);

	/*
	 * Which notes are open. Closed is the resting state, and opening one does
	 * not close another: comparing two notes is the reason to have a notebook.
	 */
	const openNotes = new SvelteSet<number>();
	const toggleNote = (id: number) => {
		if (openNotes.has(id)) openNotes.delete(id);
		else openNotes.add(id);
	};

	/**
	 * What to call a note in a list.
	 *
	 * Its title when it has one. Before titles existed every note was its
	 * content, so the first line stands in — which is what somebody would have
	 * typed as a title anyway — trimmed of the markdown that would read as
	 * punctuation in a list.
	 */
	function noteName(entry: { title?: string; content: string }): string {
		if (entry.title) return entry.title;
		const first = entry.content
			.split('\n')
			.map((line) =>
				line
					.replace(/^#{1,6}\s*/, '')
					.replace(/^[-*+]\s+/, '')
					.trim()
			)
			.find(Boolean);
		if (!first) return 'Untitled';
		/*
		 * A reference reads as the task it names, here too.
		 *
		 * A note that was a checklist and became tasks is a note whose first
		 * line is `TASK:#1` — which in the list would name the note "TASK:#1".
		 * The chip in the body already says the task's title; this is the same
		 * answer where there is no room for a chip.
		 */
		return first
			.replace(/(?:TASK|TODO):#(\d+)/g, (whole, seq) => todoRefs.get(Number(seq))?.title ?? whole)
			.slice(0, 120);
	}

	/**
	 * Maximized: the notebook takes the whole screen.
	 *
	 * Reading or writing anything longer than a note wants more than a column
	 * beside a list. The surface below is a `<dialog>` that lays out as if it
	 * were not there — until `showModal()` promotes it, same DOM and all, to
	 * the top layer. Nothing is re-rendered on the way in or out, which is
	 * what keeps a half-written note, the open tab and the scroll exactly
	 * where they were.
	 */
	let maximized = $state(false);

	/*
	 * `composing` — whether the note composer is open — is a prop now, so a page
	 * can put the button that opens it in its own header. Closed to begin with,
	 * on every screen: it used to stand open above the notes, which is a form
	 * taking the top of the page whether or not anybody is writing.
	 */
	let surface = $state<HTMLDialogElement>();

	/**
	 * The type sizes on offer, smallest to biggest. Steps rather than a
	 * slider: each one is a size somebody chose, and the ends are the sizes
	 * past which the column stops reading well. The first step is the app's
	 * own `text-sm`. The choice is the device's, kept in `localStorage`.
	 */
	const TYPE_STEPS = ['0.875rem', '1rem', '1.125rem', '1.25rem', '1.5rem'] as const;
	const DEFAULT_TYPE_STEP = 1;
	const TYPE_STEP_KEY = 'notebook.typeStep';

	let typeStep = $state(readTypeStep());

	function readTypeStep(): number {
		if (typeof localStorage === 'undefined') return DEFAULT_TYPE_STEP;
		try {
			const raw = localStorage.getItem(TYPE_STEP_KEY);
			const step = raw === null ? NaN : Number(raw);
			return Number.isInteger(step) && step >= 0 && step < TYPE_STEPS.length
				? step
				: DEFAULT_TYPE_STEP;
		} catch {
			return DEFAULT_TYPE_STEP;
		}
	}

	function setTypeStep(step: number) {
		typeStep = step;
		try {
			localStorage.setItem(TYPE_STEP_KEY, String(step));
		} catch {
			// Blocked storage loses the preference, not the feature.
		}
	}

	/*
	 * The full screen, on a desk: its column can be dragged wider or narrower,
	 * and a tab dragged to its right edge opens beside the others.
	 *
	 * `tab` stays what it always was — the tab the keys, the cursor and the
	 * room's New button act on — and with panes that is the pane last pressed.
	 * `paneTabs` is every tab showing, in order; outside the split it is just
	 * `[tab]`. A tab is in one pane at most: picking one already open goes to it.
	 */
	const TAB_DRAG = 'application/x-ontoplano-notebook-tab';
	/** More than this and a pane is narrower than a list row reads at. */
	const MAX_PANES = 3;
	/** The narrowest the column or a pane may be dragged, in pixels. */
	const MIN_COLUMN_PX = 480;
	const MIN_PANE_PX = 280;
	/** How far an arrow key moves an edge or a divider. */
	const NUDGE_PX = 32;
	const WIDTH_KEY = 'notebook.width';

	const wide = new MediaQuery(SPLIT_MEDIA);
	const canSplit = $derived(maximized && wide.current);
	let paneTabs = $state<Tab[]>([]);
	let paneShare = $state<number[]>([]);
	let activePane = $state(0);
	let panesEl = $state<HTMLElement>();
	let draggingTab = $state(false);
	const split = $derived(canSplit && paneTabs.length > 1);

	// The keys can change the tab too (h/l, a link to a task): it lands in
	// the pane it is already showing in, or replaces the active pane's.
	$effect(() => {
		const k = tab;
		untrack(() => {
			const at = paneTabs.indexOf(k);
			if (at >= 0) activePane = at;
			else if (paneTabs.length < 2) paneTabs = [k];
			else paneTabs[activePane] = k;
		});
	});

	// A module switched off while it was showing in a pane takes the pane.
	$effect(() => {
		const offered = TAB_KEYS;
		untrack(() => {
			if (paneTabs.every((k) => offered.includes(k))) return;
			const kept = paneTabs.filter((k) => offered.includes(k));
			paneTabs = kept.length ? kept : [tab];
			paneShare = paneTabs.map(() => 1);
			activePane = Math.min(activePane, paneTabs.length - 1);
		});
	});

	function showTab(key: Tab) {
		moduleSearches[key] = '';
		tab = key;
	}

	function focusPane(i: number) {
		if (paneTabs[i] === undefined || (activePane === i && tab === paneTabs[i])) return;
		activePane = i;
		tab = paneTabs[i];
	}

	function pickInPane(i: number, key: Tab) {
		const open = paneTabs.indexOf(key);
		if (open >= 0 && open !== i) return focusPane(open);
		moduleSearches[key] = '';
		paneTabs[i] = key;
		activePane = i;
		tab = key;
	}

	function openBeside(key: Tab) {
		const open = paneTabs.indexOf(key);
		if (open >= 0 && paneTabs.length > 1) return focusPane(open);
		const others = paneTabs.filter((k) => k !== key);
		if (others.length >= MAX_PANES) return;
		// Dragging the only tab showing out beside itself leaves the next one
		// in its place, so there is something on each side.
		const left = others.length ? others : [TAB_KEYS.find((k) => k !== key) ?? key];
		paneTabs = [...left, key];
		paneShare = paneTabs.map(() => 1);
		activePane = paneTabs.length - 1;
		moduleSearches[key] = '';
		tab = key;
	}

	function closePane(i: number) {
		const next = paneTabs.filter((_, at) => at !== i);
		const shares = paneShare.filter((_, at) => at !== i);
		paneTabs = next;
		paneShare = shares;
		activePane = Math.max(
			0,
			Math.min(activePane > i ? activePane - 1 : activePane, next.length - 1)
		);
		tab = next[activePane];
	}

	function dropBeside(event: DragEvent) {
		event.preventDefault();
		draggingTab = false;
		const index = Number(event.dataTransfer?.getData(TAB_DRAG));
		const key = tabs[index]?.key;
		if (key) openBeside(key);
	}

	/** Only a tab of this notebook raises the drop zone, not a file or a link. */
	function noticeDrag(event: DragEvent) {
		draggingTab = canSplit && Boolean(event.dataTransfer?.types.includes(TAB_DRAG));
	}

	/** The column's width in pixels, or null for the reading width (one pane) or the screen (several). */
	let columnPx = $state<number | null>(readWidth());

	function readWidth(): number | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			const raw = Number(localStorage.getItem(WIDTH_KEY));
			return Number.isFinite(raw) && raw >= MIN_COLUMN_PX ? raw : null;
		} catch {
			return null;
		}
	}

	function setWidth(px: number | null) {
		columnPx =
			px === null ? null : Math.round(Math.max(MIN_COLUMN_PX, Math.min(px, window.innerWidth)));
		try {
			if (columnPx === null) localStorage.removeItem(WIDTH_KEY);
			else localStorage.setItem(WIDTH_KEY, String(columnPx));
		} catch {
			// Blocked storage loses the width, not the feature.
		}
	}

	/** What the column measures now, whatever it was set by. */
	function currentWidth(): number {
		return surface?.querySelector<HTMLElement>('.nb-body')?.getBoundingClientRect().width ?? 0;
	}

	function startGrip(event: PointerEvent) {
		const grip = event.currentTarget as HTMLElement;
		grip.setPointerCapture(event.pointerId);
		const move = (e: PointerEvent) => setWidth(2 * Math.abs(e.clientX - window.innerWidth / 2));
		const stop = () => {
			grip.removeEventListener('pointermove', move);
			grip.removeEventListener('pointerup', stop);
			grip.removeEventListener('pointercancel', stop);
		};
		grip.addEventListener('pointermove', move);
		grip.addEventListener('pointerup', stop);
		grip.addEventListener('pointercancel', stop);
	}

	function nudgeWidth(event: KeyboardEvent, side: number) {
		const outward = event.key === 'ArrowRight' ? side : event.key === 'ArrowLeft' ? -side : 0;
		if (!outward) return;
		event.preventDefault();
		setWidth(currentWidth() + 2 * outward * NUDGE_PX);
	}

	/** The panes' widths now, which is what a divider starts from. */
	function measuredShares(): number[] {
		return [...(panesEl?.querySelectorAll<HTMLElement>(':scope > .nb-pane') ?? [])].map(
			(pane) => pane.getBoundingClientRect().width
		);
	}

	/** Move the line between pane `i - 1` and pane `i` by `dx` pixels. */
	function shiftDivider(widths: number[], i: number, dx: number) {
		const pair = widths[i - 1] + widths[i];
		const left = Math.max(MIN_PANE_PX, Math.min(widths[i - 1] + dx, pair - MIN_PANE_PX));
		const next = [...widths];
		next[i - 1] = left;
		next[i] = pair - left;
		paneShare = next;
	}

	function startDivider(event: PointerEvent, i: number) {
		const divider = event.currentTarget as HTMLElement;
		divider.setPointerCapture(event.pointerId);
		const from = event.clientX;
		const widths = measuredShares();
		const move = (e: PointerEvent) => shiftDivider(widths, i, e.clientX - from);
		const stop = () => {
			divider.removeEventListener('pointermove', move);
			divider.removeEventListener('pointerup', stop);
			divider.removeEventListener('pointercancel', stop);
		};
		divider.addEventListener('pointermove', move);
		divider.addEventListener('pointerup', stop);
		divider.addEventListener('pointercancel', stop);
	}

	function nudgeDivider(event: KeyboardEvent, i: number) {
		const dx = event.key === 'ArrowRight' ? NUDGE_PX : event.key === 'ArrowLeft' ? -NUDGE_PX : 0;
		if (!dx) return;
		event.preventDefault();
		shiftDivider(measuredShares(), i, dx);
	}

	/** On a phone the maximized notebook is a screen, so back closes it. */
	const back = new BackCloses(() => leaveMaximized());

	$effect(() => back.watch());

	function enterMaximized() {
		maximized = true;
		surface?.showModal();
		if (isPhone()) back.claim();
	}

	function leaveMaximized() {
		maximized = false;
		if (surface?.open) surface.close();
		back.release();
	}

	// The boxes a picture writes its markdown into. Only one note is ever being
	// edited at a time, so one reference is enough for the whole list.
	let addBox = $state<HTMLTextAreaElement>();
	let editBox = $state<HTMLTextAreaElement>();
	let confirmDeleteNote = $state<number | null>(null);

	/**
	 * The note being turned into todos, and which of its boxes are coming.
	 *
	 * A checklist written in a note is a list nothing can remind anybody of, so
	 * a note with a `- [ ]` in it offers to become the tasks it describes. The
	 * dialog is not a confirmation — it is where somebody leaves a few behind,
	 * because half of these lists have three things on them that were done
	 * before the note was finished.
	 */
	let listifying = $state<Entry | null>(null);
	let coming = $state(new SvelteSet<number>());

	const listifyingItems = $derived(listifying ? checklistItems(listifying.content) : []);

	function offerTodos(entry: Entry) {
		listifying = entry;
		coming = new SvelteSet(checklistItems(entry.content).map((_, at) => at));
	}

	/**
	 * Notes, tasks and goals as tabs rather than three stacked lists.
	 *
	 * A notebook with a dozen notes pushed its tasks below the fold, so the two
	 * halves of "everything about this" could not be seen together at all.
	 */
	/*
	 * Which tabs this notebook has is the notebook's own answer now.
	 *
	 * Notes and tasks by default, and whatever else the subject accumulates —
	 * its shopping, its bills, the account it is paid from. The list arrives
	 * already narrowed by what this account has put away altogether, so a room
	 * hidden in Preferences cannot come back as a tab in here; see
	 * `$lib/notebook-modules`.
	 */
	const TAB_KEYS = $derived<readonly NotebookModule[]>(notebook?.modules ?? DEFAULT_MODULES);
	type Tab = NotebookModule;

	/*
	 * A notebook opens on its own first tab.
	 *
	 * It always opened on Notes, which made the order somebody put the tabs in
	 * a decoration: a renovation whose first tab is its shopping opened on the
	 * writing anyway. The first tab is the answer to "what is this notebook
	 * mostly", and it is the notebook's to give.
	 */
	const firstTab = $derived<Tab>(TAB_KEYS[0] ?? 'notes');
	let tab = $state<Tab>(untrack(() => firstTab));

	/*
	 * A tab that was showing and is not offered any more.
	 *
	 * Switching Inventory off while standing on it would otherwise leave the
	 * strip with nothing lit and the body drawing a module the notebook no
	 * longer has. It falls back to the first tab, the same one it opened on.
	 */
	$effect(() => {
		if (!TAB_KEYS.includes(tab)) tab = firstTab;
	});

	/**
	 * The Tasks tab's own New, reached from a button the page draws.
	 *
	 * The list is `TodoRows`, the same component the to-do room uses, and it
	 * owns the form. A second form written beside it would be a second set of
	 * fields to keep in step, so the button opens that one.
	 */
	let openNewTodo = $state<(() => void) | undefined>(undefined);
	/** And its editor on one task, for a note that points at one. */
	let openTodoById = $state<((id: number) => void) | undefined>(undefined);
	/* Whether the goal form is open on this notebook. */
	let composingGoal = $state(false);
	/* What is in the composer, so the checklist offer can watch it. */
	let composing_content = $state('');
	const composingTodoCount = $derived(checklistItems(composing_content).length);
	let goalHorizon = $state<Horizon>('week');
	let goalStart = $state('');
	let goalTargets = $state<FormTarget[]>([]);
	/* Which goal the form is editing, or null while one is being written. */
	let editingGoalId = $state<number | null>(null);
	/* Which goal's "what counts towards this" is open. */
	let linkingGoalId = $state<number | null>(null);

	const editingGoal = $derived(
		editingGoalId === null
			? null
			: (contents?.goals.find((one) => one.id === editingGoalId) ?? null)
	);
	const linkingGoal = $derived(
		linkingGoalId === null
			? null
			: (contents?.goals.find((one) => one.id === linkingGoalId) ?? null)
	);

	/**
	 * This notebook's tasks by their number in it, for `TASK:#4` in a note.
	 *
	 * Rendered with the task's own title and a tick where it is done, so a
	 * note that points at a list says what is on the list and how far along it
	 * is, rather than a row of numbers.
	 */
	const todoRefs = $derived(
		new Map(
			(contents?.todos ?? [])
				.filter((one) => one.notebookSeq !== null)
				.map((one) => [
					one.notebookSeq as number,
					{ title: one.title, done: CLOSED_STATUSES.includes(one.status) }
				])
		)
	);

	/** The notes `NOTE:#12` may name here, by their number, as they are listed. */
	const noteRefs = $derived(
		new Map(
			(contents?.entries ?? [])
				.filter((entry) => entry.seq !== null)
				.map((entry) => [entry.seq as number, { title: noteName(entry) }])
		)
	);

	function openReferencedTodo(press: MouseEvent) {
		const link = (press.target as HTMLElement).closest('.todo-ref') as HTMLElement | null;
		if (!link) return;
		press.preventDefault();
		const seq = Number(link.dataset.todoSeq);
		const one = (contents?.todos ?? []).find((task) => task.notebookSeq === seq);
		if (!one) return;
		// The task lives on the Tasks tab, and its editor is that list's own.
		tab = 'tasks';
		// After the tab has drawn, so the list is there to be asked.
		void tick().then(() => openTodoById?.(one.id));
	}

	/** Units this account already counts things in, offered rather than imposed. */
	const knownUnits = $derived(
		[
			...new Set(
				(contents?.goals ?? []).flatMap((g) => g.targets.map((one) => one.unit)).filter(Boolean)
			)
		].sort()
	);

	function openGoalEdit(id: number) {
		const one = contents?.goals.find((g) => g.id === id);
		if (!one) return;
		editingGoalId = id;
		goalHorizon = one.horizon;
		goalStart = one.periodStart;
		goalTargets =
			one.targets.length > 0
				? one.targets.map((target) => ({
						id: target.id,
						value: String(target.targetValue),
						unit: target.unit,
						whole: target.whole,
						measureActivity: target.measureActivity ?? ''
					}))
				: [{ id: null, value: '', unit: '', whole: true, measureActivity: '' }];
		composingGoal = true;
	}

	/** Which tab's picker is open, if any. */
	let linking = $state(false);

	/**
	 * What the Link button says, per tab.
	 *
	 * The singular noun, matching the New button beside it: a tab offering
	 * "New thing" and "Link Inventory" is naming the same thing twice in two
	 * registers.
	 */
	const LINK_LABEL: Partial<Record<NotebookModule, PlainKey>> = {
		notes: 'notebooks.linkNote',
		tasks: 'notebooks.linkTask',
		goals: 'notebooks.linkGoal',
		ideas: 'notebooks.linkIdea',
		inventory: 'notebooks.linkItem',
		ledgers: 'notebooks.linkLedger',
		bills: 'notebooks.linkBill',
		habits: 'notebooks.linkHabit',
		workouts: 'notebooks.linkWorkout',
		recipes: 'notebooks.linkRecipe'
	};

	$effect(() => {
		linkAction = notebook
			? { label: t(LINK_LABEL[tab] ?? 'ui.add'), run: () => (linking = true) }
			: undefined;
	});

	/**
	 * Which prefix each module's own handlers answer under, here.
	 *
	 * The notebook page mounts every room's handlers under its module's name —
	 * see `$lib/services/scoped-actions` — so a form on a tab posts to the code
	 * the room runs rather than to a second implementation of it.
	 */
	const ACTION_PREFIX: Partial<Record<NotebookModule, string>> = {
		inventory: 'item',
		ledgers: 'ledger',
		bills: 'bill',
		habits: 'habit',
		workouts: 'workout',
		recipes: 'recipe'
	};

	/** What each tab's search box says, in the words the Notes and Tasks tabs use. */
	const SEARCH_LABEL: Partial<Record<NotebookModule, PlainKey>> = {
		goals: 'notebookDetail.searchTheseGoals',
		ideas: 'notebookDetail.searchTheseIdeas',
		inventory: 'notebookDetail.searchTheseThings',
		ledgers: 'notebookDetail.searchTheseLedgers',
		bills: 'notebookDetail.searchTheseBills',
		habits: 'notebookDetail.searchTheseHabits',
		workouts: 'notebookDetail.searchTheseWorkouts',
		recipes: 'notebookDetail.searchTheseRecipes'
	};

	const NEW_LABELS: Partial<Record<NotebookModule, PlainKey>> = {
		inventory: 'notebooks.newItem',
		ledgers: 'notebooks.newLedger',
		bills: 'notebooks.newBill',
		habits: 'notebooks.newHabit',
		workouts: 'notebooks.newWorkout',
		recipes: 'notebooks.newRecipe'
	};

	/*
	 * The Ideas tab's own composer, and which idea it is editing.
	 *
	 * `IdeaFields` rather than fields written here, for the same reason the
	 * Goals tab uses `GoalFields`: an idea written in a notebook has to be the
	 * same idea, with the same box, the same attachments and the same tags.
	 */
	let composingIdea = $state(false);
	let editingIdeaId = $state<number | null>(null);
	const editedIdea = $derived(
		(
			contents?.ideas as { id: number; content: string; tags: { name: string }[] }[] | undefined
		)?.find((one) => one.id === editingIdeaId)
	);

	function closeIdeaForm() {
		composingIdea = false;
		editingIdeaId = null;
	}

	/*
	 * The other six tabs' composer: the room's own form, opened here.
	 *
	 * New used to be a link to the room, which threw you out of the notebook to
	 * write the thing and then filed it back under the subject by magic — "is
	 * this a joke? Just open the same modal". It is the same modal: the room's
	 * fields, the room's handlers, and the notebook selector every one of those
	 * forms now carries, already set to this one.
	 */
	let composingModule = $state<NotebookModule | null>(null);
	/** The Bills tab's list, which owns the bill form — see `BillList`. */
	let billList = $state<ReturnType<typeof BillList>>();
	let habitKind = $state<'bad' | 'good' | 'neutral'>('bad');
	let habitDays = $state<boolean[]>([false, false, false, false, false, false, false]);
	let newMeasures = $state<{ activity: string; unit: string }[]>([{ activity: '', unit: '' }]);

	function openComposer(module: NotebookModule) {
		// Opened fresh: what the last one was left on is not part of this one.
		habitKind = 'bad';
		habitDays = [false, false, false, false, false, false, false];
		newMeasures = [{ activity: '', unit: '' }];
		composingModule = module;
	}

	$effect(() => {
		if (!notebook) {
			newAction = undefined;
			return;
		}
		const action =
			tab === 'notes'
				? {
						label: composing ? t('ui.cancel') : t('notebookDetail.newNote'),
						run: () => (composing = !composing)
					}
				: tab === 'tasks'
					? { label: t('notebookDetail.newTask'), run: () => openNewTodo?.() }
					: tab === 'ideas'
						? {
								label: composingIdea ? t('ui.cancel') : t('notebooks.newIdea'),
								run: () => {
									editingIdeaId = null;
									composingIdea = !composingIdea;
								}
							}
						: tab === 'goals'
							? {
									/*
									 * Written here, like a task.
									 *
									 * This used to be a link to the goals room carrying the
									 * notebook — which meant the same press stayed put on one
									 * tab and threw you out of the notebook on the next. The
									 * form is the goals room's own fields (`GoalFields`), so
									 * it is the same form in both places.
									 */
									label: composingGoal ? t('ui.cancel') : t('notebookDetail.newGoal'),
									run: () => {
										// Opening it fresh: the same modal edits a goal, and a
										// half-filled form from the last edit is not a new goal.
										editingGoalId = null;
										goalTargets = [];
										composingGoal = !composingGoal;
									}
								}
							: // The rest: the room's own form, opened here — see `openComposer`.
								{
									label: t(NEW_LABELS[tab] ?? 'ui.add'),
									// Bills open the list's own form, the one the room uses.
									run: () => (tab === 'bills' ? billList?.openNew() : openComposer(tab))
								};
		newAction = { ...action, labels: newLabels };
	});

	/**
	 * Every word the New button can say on this notebook's tabs, and Cancel.
	 *
	 * So whoever draws it can make it as wide as the longest of them: a button
	 * that changes width when the tab does moves everything beside it.
	 */
	const newLabels = $derived([
		...TAB_KEYS.map((key) =>
			key === 'notes'
				? t('notebookDetail.newNote')
				: key === 'tasks'
					? t('notebookDetail.newTask')
					: key === 'ideas'
						? t('notebooks.newIdea')
						: key === 'goals'
							? t('notebookDetail.newGoal')
							: t(NEW_LABELS[key] ?? 'ui.add')
		),
		t('ui.cancel')
	]);

	/*
	 * Whichever notebook you move to opens on its own first tab, not on
	 * whichever one the last notebook happened to be showing.
	 *
	 * Its first, not Notes: the order somebody puts a notebook's tabs in is
	 * that notebook's answer to "what is this mostly", and opening on the
	 * writing regardless made that order a decoration.
	 *
	 * Compared by which notebook it is, not by the object: the props arrive
	 * fresh from every load, so watching `notebook` itself sent you back to
	 * Notes each time something on the Tasks tab was ticked off or put away.
	 * Deliberately not reactive — it is a memory of the last render, and
	 * writing it must not be what schedules the next one.
	 */
	let subjectOnScreen: string | null = null;

	$effect(() => {
		const subject = showingOrphans ? 'orphans' : String(notebook?.id ?? '');
		if (subject === subjectOnScreen) return;
		subjectOnScreen = subject;
		// Unless the address names a tab — a home-screen widget's tap does.
		const asked = untrack(() => page.url.searchParams.get(TAB_PARAM));
		const named = TAB_KEYS.find((one) => one === asked);
		tab = named ?? firstTab;
		const item = Number(untrack(() => page.url.searchParams.get(ITEM_PARAM)));
		// A task and a goal open in a form, which is a history entry; on a
		// first load that has to wait until the router is up.
		if (named && Number.isInteger(item) && item > 0) setTimeout(() => openItem(named, item));
	});

	/**
	 * Put one thing in the tab on screen, opened — what a widget's line was
	 * pressed for. A note unfolds under the cursor, a task and a goal open in
	 * their editors; the other tabs have no single thing to open, and showing
	 * the tab is the answer.
	 */
	function openItem(module: Tab, id: number) {
		if (module === 'notes') {
			const entry = contents?.entries.find((one) => one.id === id);
			if (!entry) return;
			if (entry.archivedAt) showArchivedNotes = true;
			openNotes.add(id);
			void tick().then(() => {
				const at = shownNotes.findIndex((one) => one.id === id);
				if (at >= 0) cursor = at;
			});
		} else if (module === 'tasks') openTodoById?.(id);
		else if (module === 'goals') openGoalEdit(id);
	}

	/**
	 * How far along, where that means something.
	 *
	 * A tab that says "9" says how much there is and nothing about whether any
	 * of it is finished, which for a list of tasks is the more interesting half
	 * — a subject with nine tasks and two done is in a different state from one
	 * with nine and none. Notes have no such thing to say, so they keep a plain
	 * count rather than gaining a denominator that means nothing.
	 */
	/*
	 * The order the notes are read in, and which way round.
	 *
	 * Kept in this browser rather than on the account: it is a way of looking
	 * at a list, and choosing it on a phone says nothing about a laptop. The
	 * comparison itself lives in `$lib/note-order.ts`, where it can be tested
	 * without a page.
	 */
	let noteOrder = $state<NoteOrder>(DEFAULT_NOTE_ORDER);
	let noteDirection = $state<NoteDirection>(defaultDirectionFor(DEFAULT_NOTE_ORDER));

	$effect(() => {
		try {
			const order = localStorage.getItem(NOTE_ORDER_KEY);
			if (isNoteOrder(order)) noteOrder = order;
			const direction = localStorage.getItem(NOTE_DIRECTION_KEY);
			if (isNoteDirection(direction)) noteDirection = direction;
		} catch {
			// A private window, or storage refused. The defaults stand.
		}
	});

	function remember(key: string, value: string) {
		try {
			localStorage.setItem(key, value);
		} catch {
			// It still holds for this visit; only the memory is lost.
		}
	}

	/**
	 * Choosing a field also chooses the direction somebody meant by it.
	 *
	 * "Edited" asked ascending is the note nobody has touched since February,
	 * which is not the question anybody opens that order to ask. The arrow is
	 * still right there to turn it round.
	 */
	function pickOrder(order: NoteOrder) {
		noteOrder = order;
		noteDirection = defaultDirectionFor(order);
		remember(NOTE_ORDER_KEY, order);
		remember(NOTE_DIRECTION_KEY, noteDirection);
	}

	function flipDirection() {
		noteDirection = noteDirection === 'asc' ? 'desc' : 'asc';
		remember(NOTE_DIRECTION_KEY, noteDirection);
	}

	const ORDER_LABELS: Record<NoteOrder, PlainKey> = {
		written: 'notebookDetail.orderWritten',
		title: 'notebookDetail.orderTitle',
		edited: 'notebookDetail.orderEdited'
	};

	/**
	 * The labels the notes are narrowed to, by pressing one on a note.
	 *
	 * The task list has done this since it had labels — press `#a1` on a row
	 * and the list is the rows carrying it — and the notes beside it did
	 * nothing, though they carry the same vocabulary. Pressing adds rather than
	 * replaces, so two presses is two labels, and a note has to carry all of
	 * them: narrowing by pressing is only useful if it narrows.
	 */
	let noteTagFilter = $state<string[]>([]);

	/**
	 * What somebody typed to narrow the notes.
	 *
	 * The tasks tab beside this one has had a search box since it was written
	 * and the notes tab never did, so the same notebook answered "find the one
	 * about the boiler" on one tab and not on the other. Same box, same place
	 * in the strip, same order as everything else — see `FilterBar`.
	 */
	let noteSearch = $state('');

	/*
	 * What the search box on every other tab holds.

	 * One box for all of them, cleared when the tab changes: the Notes and
	 * Tasks tabs each open on a search strip, and a Goals tab that opened on
	 * its first card read as a different kind of screen.
	 */
	function clearNoteFilters() {
		noteTagFilter = [];
		showArchivedNotes = false;
		noteSearch = '';
	}

	/*
	 * Each tab's own search. One box used to serve every tab and was emptied on
	 * a change of tab; with two tabs side by side, typing in one must not
	 * filter the other. It is still emptied when a pane changes to that tab.
	 */
	let moduleSearches = $state<Record<string, string>>({});

	/** The words of whatever a module tab lists, for the search box above it. */
	function wordsOf(item: Record<string, unknown>): string {
		const words: string[] = [];
		for (const value of Object.values(item)) {
			if (typeof value === 'string') words.push(value);
			else if (Array.isArray(value))
				for (const one of value)
					if (one && typeof one === 'object' && 'name' in one && typeof one.name === 'string')
						words.push(one.name);
		}
		return words.join('\n').toLowerCase();
	}

	/**
	 * How every other tab is ordered: when it was added, or by name.
	 *
	 * The Notes and Tasks tabs each have an order control at the end of the
	 * strip; a tab without one was the same strip missing its last control.
	 */
	const MODULE_ORDERS = ['added', 'name'] as const;
	type ModuleOrder = (typeof MODULE_ORDERS)[number];
	const MODULE_ORDER_LABELS: Record<ModuleOrder, PlainKey> = {
		added: 'notebookDetail.orderAdded',
		name: 'notebookDetail.orderName'
	};
	let moduleOrder = $state<ModuleOrder>('added');
	let moduleDirection = $state<'asc' | 'desc'>('asc');

	/** What a module's thing is called, whichever field its room keeps that in. */
	function nameOf(item: Record<string, unknown>): string {
		for (const field of ['title', 'name', 'content'])
			if (typeof item[field] === 'string') return item[field] as string;
		return '';
	}

	/** A module tab's list, narrowed by its search box and put in its order. */
	function searched<T>(items: readonly T[], key: Tab): T[] {
		const needle = (moduleSearches[key] ?? '').trim().toLowerCase();
		const out = needle
			? items.filter((item) => wordsOf(item as Record<string, unknown>).includes(needle))
			: [...items];
		const sign = moduleDirection === 'asc' ? 1 : -1;
		return out.sort((a, b) => {
			const one = a as Record<string, unknown>;
			const two = b as Record<string, unknown>;
			return (
				sign *
				(moduleOrder === 'name'
					? nameOf(one).localeCompare(nameOf(two))
					: Number(one.id ?? 0) - Number(two.id ?? 0))
			);
		});
	}

	const shownGoals = $derived(searched(contents?.goals ?? [], 'goals'));
	const shownIdeas = $derived(searched(contents?.ideas ?? [], 'ideas'));
	const shownInventory = $derived(searched(contents?.inventory ?? [], 'inventory'));
	const shownWorkouts = $derived(searched(contents?.workouts ?? [], 'workouts'));
	const shownRecipes = $derived(searched(contents?.recipes ?? [], 'recipes'));
	const shownLedgers = $derived(searched(contents?.ledgers ?? [], 'ledgers'));
	const shownHabits = $derived(searched(contents?.habits ?? [], 'habits'));
	const shownBills = $derived(searched(contents?.bills ?? [], 'bills'));

	/** How many a module tab holds, and how many of them its search leaves. */
	const moduleTallies = $derived.by(() => {
		const pairs: Partial<Record<Tab, [number, number]>> = {
			goals: [contents?.goals.length ?? 0, shownGoals.length],
			ideas: [contents?.ideas.length ?? 0, shownIdeas.length],
			inventory: [contents?.inventory.length ?? 0, shownInventory.length],
			workouts: [contents?.workouts.length ?? 0, shownWorkouts.length],
			recipes: [contents?.recipes.length ?? 0, shownRecipes.length],
			ledgers: [contents?.ledgers.length ?? 0, shownLedgers.length],
			habits: [contents?.habits.length ?? 0, shownHabits.length],
			bills: [contents?.bills.length ?? 0, shownBills.length]
		};
		return pairs;
	});
	const tallyOf = (key: Tab) => moduleTallies[key] ?? null;

	function toggleNoteTag(name: string) {
		noteTagFilter = noteTagFilter.includes(name)
			? noteTagFilter.filter((one) => one !== name)
			: [...noteTagFilter, name];
	}

	/** The notes on screen: everything, or everything still out, in the chosen order. */
	const shownNotes = $derived.by(() => {
		const all = contents?.entries ?? orphaned;
		let out = showArchivedNotes ? all : all.filter((entry) => !entry.archivedAt);
		if (noteTagFilter.length > 0)
			out = out.filter((entry) =>
				noteTagFilter.every((name) => entry.tags.some((tag) => tag.name === name))
			);
		const wanted = noteSearch.trim().toLowerCase();
		if (wanted !== '')
			// The title first and then the writing, which is how somebody finds
			// the note they described rather than named.
			out = out.filter(
				(entry) =>
					(entry.title ?? '').toLowerCase().includes(wanted) ||
					(entry.content ?? '').toLowerCase().includes(wanted)
			);
		return orderNotes(out, noteOrder, noteDirection);
	});

	/*
	 * Several notes at once — the same selection the task list has.
	 *
	 * Only your own: in a shared notebook somebody else's note is theirs to
	 * move or delete, as it is on its own row.
	 */
	const noteSelection = new Selection<EntryBatchVerb>();
	const selectableNotes = $derived(
		shownNotes.filter((entry) => !('mine' in entry) || entry.mine !== false)
	);
	const chosenNoteIds = $derived(
		selectableNotes.filter((entry) => noteSelection.has(entry.id)).map((entry) => entry.id)
	);
	$effect(() => noteSelection.keep(selectableNotes.map((entry) => entry.id)));
	const NOTE_BATCH_LABELS = {
		notebook: 'notebookDetail.batchMove',
		tag: 'notebookDetail.batchTag',
		archive: 'notebookDetail.batchArchive',
		unarchive: 'notebookDetail.batchUnarchive',
		remove: 'notebookDetail.batchDelete'
	} as const;
	const noteBatchVerbs = $derived(
		(
			[
				['notebook', 'notebook'],
				['tag', 'tag'],
				['archive', 'archive'],
				// Only while the put-away ones are on screen to be chosen.
				...(showArchivedNotes ? ([['unarchive', 'undo']] as const) : []),
				['remove', 'trash']
			] as const
		).map(([key, icon]) => ({ key, icon, label: t(NOTE_BATCH_LABELS[key]) }))
	);

	function noteSelectionKeys(e: KeyboardEvent) {
		if (tab !== 'notes' && !showingOrphans) return;
		if (e.key !== 'Escape') {
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			)
				return;
		}
		if (noteSelection.verb && e.key !== 'Escape') return;
		const under = shownNotes[cursor];
		const selectable = under && selectableNotes.includes(under) ? under.id : undefined;
		if (noteSelection.handleKey(e, () => selectable)) e.stopPropagation();
	}

	/** How many are put away, so the button can say what it would bring back. */
	const putAwayNotes = $derived(
		(contents?.entries ?? orphaned).filter((entry) => entry.archivedAt).length
	);

	/**
	 * The strip: one entry per module this notebook holds, in the app's order.
	 *
	 * Built from the same list the body switches on, so a tab can never be
	 * drawn with nothing behind it. The number beside a tab is how many lines
	 * pressing it shows — one number, because "3/8" beside a word does not say
	 * which of the two is which.
	 */
	const tabs = $derived<{ key: Tab; label: PlainKey; count: number }[]>(
		TAB_KEYS.map((key) => {
			if (key === 'notes') return { key, label: 'app.notes' as PlainKey, count: shownNotes.length };
			if (key === 'tasks')
				return {
					key,
					label: 'app.tasks' as PlainKey,
					count: (contents?.todos.length ?? 0) + (contents?.blocks.length ?? 0)
				};
			if (key === 'goals')
				return { key, label: 'app.goals' as PlainKey, count: contents?.goals.length ?? 0 };
			const counted: Partial<Record<NotebookModule, number>> = {
				ideas: contents?.ideas.length,
				inventory: contents?.inventory.length,
				workouts: contents?.workouts.length,
				recipes: contents?.recipes.length,
				ledgers: contents?.ledgers.length,
				habits: contents?.habits.length,
				bills: contents?.bills.length
			};
			return { key, label: moduleMeta(key).name, count: counted[key] ?? 0 };
		})
	);

	/**
	 * Where the cursor is among the notes, for the keyboard.
	 *
	 * -1 is nowhere, which is where it starts: arriving on a notebook should
	 * not mark a note as chosen when nobody has chosen one.
	 */
	let cursor = $state(-1);

	// Back to nowhere when the list underneath changes out from under it — a
	// cursor on the fourth note of three is a row nobody can see.
	$effect(() => {
		const shown = shownNotes.length;
		void tab;
		untrack(() => {
			if (cursor >= shown) cursor = -1;
		});
	});

	/*
	 * The keys this screen answers to, said once — see `$lib/browse`.
	 *
	 * `h` and `l` across Notes, Tasks and Goals; `j` and `k` down the notes;
	 * `Enter` unfolds the one under the cursor and `e` opens it for editing.
	 * Only on the notes tab: Tasks is `TodoRows`, which walks itself, and
	 * Goals is a list of links to somewhere else.
	 */
	/*
	 * What j/k walks depends on which tab is showing.
	 *
	 * It used to be the notes and nothing else — the other two tabs declared
	 * no items, so the keys did nothing at all on them while h/l went on
	 * switching between the three. Tasks are the exception: that list is the
	 * to-do room's own component and takes the keys itself, so this hands them
	 * over rather than fighting it for them.
	 */
	/*
	 * The long lists, drawn fifty at a time as their end comes near — see
	 * `$lib/reveal`. A notebook of years of notes froze opening otherwise.
	 */
	const noteReveal = new Reveal(
		() => shownNotes.length,
		() => (contents?.entries ?? orphaned).length
	);
	const goalReveal = new Reveal(
		() => shownGoals.length,
		() => contents?.goals.length ?? 0
	);
	const ideaReveal = new Reveal(
		() => shownIdeas.length,
		() => contents?.ideas.length ?? 0
	);

	browsable(() => ({
		items: () => (tab === 'notes' ? shownNotes : tab === 'goals' ? shownGoals : []),
		cursor: () => cursor,
		moveTo: (at: number) => {
			cursor = at;
			(tab === 'goals' ? goalReveal : noteReveal).reach(at);
		},
		tabs: { of: TAB_KEYS, current: () => tab, go: (key: string) => (tab = key as Tab) },
		open: (at: number) => {
			if (tab === 'notes') toggleNote(shownNotes[at].id);
		},
		edit: (at: number) => {
			if (tab !== 'notes') return;
			editingNoteId = shownNotes[at].id;
			noteSaved = false;
		}
	}));

	/*
	 * A note's stamp says the time as well as the day.
	 *
	 * Two notes written on the same afternoon read as the same note otherwise,
	 * and which one is the later of them is the thing somebody is looking for.
	 */
	function when(iso: string): string {
		return momentOf(iso, now());
	}
</script>

<svelte:window
	onkeydown={noteSelectionKeys}
	ondragstart={noticeDrag}
	ondragend={() => (draggingTab = false)}
	ondrop={() => (draggingTab = false)}
/>

<!--
	The dialog is the notebook's own surface, inline until `showModal()` — see
	the note on `maximized` above. `display: contents` below is what lets it
	stand here without being a box of its own.
-->
<dialog
	bind:this={surface}
	onclose={leaveMaximized}
	aria-label={notebook?.title ?? 'Notes'}
	class="nb-surface as-surface bg-white"
	class:nb-split={split}
	data-screen
	style="--nb-type: {TYPE_STEPS[typeStep]}{canSplit
		? `; --nb-width: ${columnPx === null ? (split ? '100%' : 'var(--max-width-reading)') : `${columnPx}px`}`
		: ''}"
>
	{#if maximized}
		<header class="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2">
			<button
				type="button"
				onclick={leaveMaximized}
				aria-label={t('ui.back')}
				class="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center text-gray-700 sm:hidden"
			>
				<svg
					class="h-6 w-6"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="square"
					aria-hidden="true"
				>
					<path d="M15 5l-7 7 7 7" />
				</svg>
			</button>
			<h2 class="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">
				{notebook?.title ?? t('notebooks.notesWithoutANotebook')}
			</h2>
			<!--
				The type control: the same letter at the two sizes it moves between.
				Both ends stay drawn and disable rather than disappear, so the
				buttons never trade places under a finger.
			-->
			<button
				type="button"
				onclick={() => setTypeStep(typeStep - 1)}
				disabled={typeStep === 0}
				class="icon-btn"
				title={t('notebookDetail.smallerType')}
				aria-label={t('notebookDetail.smallerType')}
			>
				<span class="text-xs font-semibold">A</span>
			</button>
			<button
				type="button"
				onclick={() => setTypeStep(typeStep + 1)}
				disabled={typeStep === TYPE_STEPS.length - 1}
				class="icon-btn"
				title={t('notebookDetail.biggerType')}
				aria-label={t('notebookDetail.biggerType')}
			>
				<span class="text-lg font-semibold">A</span>
			</button>
			<button
				type="button"
				onclick={leaveMaximized}
				aria-label={t('ui.close')}
				class="btn btn-quiet btn-sm hidden sm:flex"
			>
				&times;
			</button>
		</header>
	{/if}

	<div class="nb-body">
		{#if showingOrphans}
			<!-- Notes whose notebook was deleted: no tabs, and the same strip
			     the Notes tab opens on. -->
			<RoomToolbar inset>
				{#snippet tools()}
					{@render noteControls()}
				{/snippet}
			</RoomToolbar>
			{@render noteList(shownNotes, null)}
		{:else if !notebook || !contents}
			<!--
				What a notebook is, said where there is room to say it.

				It was a paragraph in a band between the tabs and the shelf — read
				once, in the way ever after, and gone the moment the first notebook
				existed. This column is empty until somebody picks one, which is
				exactly where an explanation belongs and exactly when it is wanted.
			-->
			<EmptyState
				icon="notebook"
				title={t('notebookDetail.nothingChosen')}
				description={t('notebooks.aSubjectYouWriteAgainst')}
			/>
		{:else}
			<!-- Everything about this notebook, one kind at a time. -->
			<!--
				The tabs, and what is done to what they list.
				
				The controls never go inside the scrolling strip — they were drawn
				over the last tab when they did, "New note" sitting on top of
				"Goals 0" — so they sit beside it and do not shrink. Which is
				exactly what left no tabs at all on a phone: "Show archived (1)"
				and the order control took the row and the strip shrank to a
				letter. Below `sm` they drop to a row of their own under the tabs,
				where there is width for them; the full-screen button stays up
				here at every size, because one icon costs nothing and it is the
				control for the panel rather than for what is in it.
			-->
			<!-- The same strip a room's tabs are, one level down; the whole-screen
			     button stands at its far end, as a room's verb does. -->
			{#if split}
				<!--
					Side by side: one pane per tab, each with its own strip and a ×,
					the widths shared out by the bars between them. A press anywhere in
					a pane makes it the one the keys and the room's New button act on.
				-->
				<div class="nb-panes" bind:this={panesEl}>
					{#each paneTabs as k, i (k)}
						{#if i > 0}
							<div
								role="separator"
								aria-orientation="vertical"
								aria-label={t('notebookDetail.sharePanes')}
								title={t('notebookDetail.sharePanes')}
								tabindex="0"
								class="nb-divider"
								onpointerdown={(event) => startDivider(event, i)}
								onkeydown={(event) => nudgeDivider(event, i)}
							></div>
						{/if}
						<section
							class="nb-pane"
							class:nb-pane-active={k === tab}
							style="flex: {paneShare[i] ?? 1} 1 0"
							aria-label={t(tabs.find((option) => option.key === k)?.label ?? 'ui.notes')}
							onpointerdowncapture={() => focusPane(i)}
							onfocusin={() => focusPane(i)}
						>
							<div class="notebook-tabs">{@render strip(i)}</div>
							{@render tabBody(k)}
						</section>
					{/each}
				</div>
			{:else}
				<div class="notebook-tabs">{@render strip(-1)}</div>
				{@render tabBody(tab)}
			{/if}
		{/if}
	</div>

	{#if canSplit}
		<!--
			The column's two edges, to drag it wider or narrower. Centred, so
			either edge moves both; a double press puts it back.
		-->
		{#each [-1, 1] as side (side)}
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label={t('notebookDetail.resizeWidth')}
				title={t('notebookDetail.resizeWidth')}
				tabindex="0"
				class="nb-grip {side < 0 ? 'nb-grip-left' : 'nb-grip-right'}"
				onpointerdown={startGrip}
				ondblclick={() => setWidth(null)}
				onkeydown={(event) => nudgeWidth(event, side)}
			></div>
		{/each}
		{#if draggingTab}
			<!-- Where a dragged tab opens beside the ones showing. -->
			<div
				class="nb-drop"
				role="region"
				aria-label={t('notebookDetail.openBeside')}
				ondragover={(event) => {
					event.preventDefault();
					if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
				}}
				ondrop={dropBeside}
			>
				<Icon name="plus" />
				<span>{t('notebookDetail.openBeside')}</span>
			</div>
		{/if}
	{/if}
</dialog>

<!--
	A tab strip: the notebook's (`pane` -1), or one pane's when split. Its tabs
	can be dragged to the right edge on the full screen, which opens them beside.
-->
{#snippet strip(pane: number)}
	{@const showing = pane < 0 ? tab : paneTabs[pane]}
	<!-- The same strip a room's tabs are, one level down; the whole-screen
	     button stands at its far end, as a room's verb does. -->
	<TabStrip
		nested
		label={t('notebookDetail.sections')}
		dataTour={pane <= 0 ? 'notebook-tabs' : undefined}
		tabs={tabs.map((option) => ({
			label: t(option.label),
			icon: moduleGlyph(option.key),
			count: String(option.count)
		}))}
		current={tabs.findIndex((option) => option.key === showing)}
		onpick={(index) => (pane < 0 ? showTab(tabs[index].key) : pickInPane(pane, tabs[index].key))}
		dragType={canSplit ? TAB_DRAG : undefined}
	>
		{#snippet trailing()}
			{#if pane < 0}
				<button
					type="button"
					onclick={() => (maximized ? leaveMaximized() : enterMaximized())}
					class="icon-btn ml-auto shrink-0"
					title={maximized ? t('notebookDetail.backToThePage') : t('notebookDetail.theWholeScreen')}
					aria-label={maximized
						? t('notebookDetail.backToThePage')
						: t('notebookDetail.theWholeScreen')}
				>
					<Icon name="maximize" />
				</button>
			{:else}
				<button
					type="button"
					onclick={() => closePane(pane)}
					class="icon-btn ml-auto shrink-0"
					title={t('notebookDetail.closePane')}
					aria-label={t('notebookDetail.closePane')}
				>
					<Icon name="close" />
				</button>
			{/if}
		{/snippet}
	</TabStrip>
{/snippet}

<!--
	What one tab shows, below its strip: drawn once for the notebook, or once
	per pane when the full screen is split. `k` is the tab; `tab` is the pane
	last pressed, which is the one the keys and the room's New button act on.
-->
{#snippet tabBody(k: Tab)}
	<!-- Only ever drawn with a notebook open; said again for the types. -->
	{#if notebook && contents}
		{#if k === 'notes'}
			<!--
				The same block the Tasks tab draws, by the same component.

				This was a hand-rolled row with `px-2 py-1.5` on it while Tasks
				used `RoomToolbar inset`, which is a whole rem — so the search
				box, the filter button, the count and the sort all sat eight
				pixels further left here, and the strip was a different height.
				Changing tab moved every control in it. One component, so the
				two cannot drift again.
			-->
			<RoomToolbar inset>
				{#snippet tools()}
					{@render noteControls()}
				{/snippet}
			</RoomToolbar>
		{:else if (tallyOf(k)?.[0] ?? 0) > 0}
			<!-- The strip every tab of a notebook opens on: search and count, in
			     the places the Notes and Tasks tabs put them. -->
			<RoomToolbar inset>
				{#snippet tools()}
					{@render moduleControls(k, tallyOf(k)![0], tallyOf(k)![1])}
				{/snippet}
			</RoomToolbar>
		{/if}

		{#if (tallyOf(k)?.[0] ?? 0) > 0 && tallyOf(k)![1] === 0}
			<EmptyState filtered onclear={() => (moduleSearches[k] = '')} compact />
		{/if}

		{#if k === 'notes'}
			<!--
		Writing about the kitchen renovation used to mean going to the Diary and
		remembering to pick the notebook from a dropdown.

		Behind a button, on every screen. Standing open it took the top of the
		notebook whether or not anybody was writing — a title box, a text box,
		a picture button and a fold of tags, above the notes somebody came to
		read. The button is where the form was, so opening it costs one press
		and closing it gives the space back.

		It is tinted and it ends in a rule: the notes below are separated from
		each other by exactly that line, so a composer with no edge of its own
		read as the first note in the list. A different surface says "this is
		where you write" without another heading to say it.
	-->
			{#if composing}
				<form
					method="post"
					action="?/addEntry"
					use:enhance={() =>
						async ({ update, result }) => {
							await update({ reset: result.type === 'success' });
							// Written and gone: the space belongs to the notes again.
							if (result.type === 'success') composing = false;
						}}
					class="border-b border-gray-200 bg-gray-50 px-4 pt-3 pb-4"
				>
					<input type="hidden" name="notebookId" value={notebook.id} />
					<!--
					A name first, because the list is names.

					Not required: a note jotted in a hurry should not be held up by a
					form asking what to call it, and one without a name is listed by
					its first line.
				-->
					<OneLine
						name="heading"
						placeholder={t('ui.title')}
						class="input mb-2 w-full font-medium"
					/>
					<!-- The same box the modal has, preview and all: a note written
					     here is the same note, and it was the one place that got a
					     bare textarea. -->
					<MarkdownBox
						bind:element={addBox}
						bind:value={composing_content}
						name="content"
						rows={6}
						required
						todos={todoRefs}
						notes={noteRefs}
						placeholder={t('notebookDetail.writeANoteAbout', { title: notebook.title })}
					/>
					<!-- A note written here takes a picture the same way a note written in
		     the diary does. It was missing here, which made pictures look like
		     a feature of one screen rather than of notes. -->
					<PictureAttach target={addBox} />
					<!--
			Tags and people, the same as a note written in the diary.

			Folded away because the common act here is typing a line and
			pressing add, and two more boxes in front of that is a form where
			there was a composer. Open, they are the same two fields, posting
			the same two names.

			Indented to `btn-sm`'s own left padding so its marker starts where
			the picture button's icon starts: two controls stacked under a text
			box, reading as one column rather than as two half-aligned rows.
		-->
					<div class="mt-1 pl-2.5">
						<MoreOptions label={t('notebookDetail.tagsPeople')} count={0} divided={false}>
							{@render tagsAndPeople('', '')}
						</MoreOptions>
					</div>
					<!--
						The checklist offer, where the checkboxes are being typed.

						It used to be an icon on the finished note's row, found
						afterwards by somebody who went looking. The moment it is
						wanted is while the list is being written, so it appears the
						instant a `- [ ]` does.

						The row holds its height whether or not the button is in it,
						so a checkbox typed into the third line does not shift the
						composer under the hand about to press Add.
					-->
					<div class="mt-2 flex min-h-8 items-center justify-end gap-2">
						{#if composingTodoCount > 0}
							<button
								type="submit"
								name="alsoTodos"
								value="1"
								class="btn btn-sm"
								title={t('notebookDetail.makeTodosOfTheCheckboxes')}
							>
								<Icon name="check" />
								{t('notebookDetail.addWithTodos', { count: composingTodoCount })}
							</button>
						{/if}
						<button class="btn btn-primary btn-sm"
							><Icon name="plus" /> {t('notebookDetail.addNote')}</button
						>
					</div>
				</form>
			{/if}

			{@render noteList(shownNotes, notebook.id)}
		{:else if k === 'tasks'}
			<!--
				The to-do room, looking at one subject.

				A notebook's tasks used to be a read-only list: you could see that
				four things about the kitchen were waiting and could not tick one
				off without going somewhere else. It is the same component the
				room uses, so a todo behaves the same way wherever it is found —
				and a new one written here lands in this notebook.
			-->
			<!--
				`shortcutRoom` so the rows answer to j/k here as they do in the
				room. The keys did nothing on this tab: the view above declares
				its items as the notes and gives back none on any other tab, and
				the list was never told to take them itself. It reads the to-do
				room's own bindings, which is the point — the same list behaves
				the same way wherever it is found.

				`framed` off because the card here is the notebook's: the filters
				and the rows are panes of it, edge to edge, rather than a second
				card drawn inside the first.
			-->
			<TodoRows
				todos={contents.todos}
				{categories}
				notebooks={pickableNotebooks}
				actions={NOTEBOOK_TODO_ACTIONS}
				notebookId={notebook.id}
				shortcutRoom={k === tab ? '/tasks/todo' : null}
				claimsRoomBar={false}
				framed={false}
				bind:openNew={openNewTodo}
				bind:openTodo={openTodoById}
			/>

			<!--
				Blocks below, and still a list: a block is a thing that happens at
				a time rather than a thing to finish, and it is edited on the day
				it sits on.
			-->
			{#if contents.blocks.length > 0}
				<ul class="divide-y divide-gray-200 border-t border-gray-200">
					{#each contents.blocks as block (`${block.kind}${block.id}`)}
						<li class="flex items-center gap-3 px-4 py-2 text-sm">
							<Icon name="calendar" class="shrink-0 text-gray-500" />
							<span class="min-w-0 flex-1 truncate text-gray-900"
								>{block.label || t('tasks.plan.untitledBlock')}</span
							>
							<span class="tabular shrink-0 text-xs text-gray-500">
								{block.kind === 'weekly'
									? describeRecurrence(parseRecurrence(block.recurrence), block.weekday ?? 0, t)
									: civilOf(block.date, now())}
								{block.startTime}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if k === 'goals'}
			<!--
				The goals room's own card, not a line of text.

				This was a list of titles linking to `/goals`: you could see
				that a goal existed and do nothing to it — no edit, no delete,
				no way to say it was achieved or missed, nothing about what
				counts towards it. Filing a goal under a notebook is supposed
				to scope it, not strip it.
			-->
			<div class="divide-y divide-gray-200">
				{#each goalReveal.of(shownGoals) as goal, at (goal.id)}
					<div
						class={k === tab && cursor === at ? 'kb-cursor' : ''}
						use:revealNear={{ reveal: goalReveal, index: at, trigger: goalReveal.trigger }}
					>
						<GoalCard
							{goal}
							goals={contents.goals}
							{allTodos}
							{slots}
							{activities}
							actions={NOTEBOOK_GOAL_ACTIONS}
							onedit={(id) => openGoalEdit(id)}
							onlink={(id) => (linkingGoalId = id)}
						/>
					</div>
				{/each}
			</div>
		{:else if k === 'ideas'}
			<!--
				The Ideas room's own card, not a line with a tick beside it.

				An idea filed under a subject is an idea: its star, its tags, the
				note saying what was applied, and its verbs. Drawing a thinner version of it here is how the two screens
				stopped agreeing about what an idea is — see `IdeaCard`.
			-->
			{#if contents.ideas.length === 0}
				<EmptyState
					icon={moduleGlyph('ideas')}
					title={t('notebooks.nothingUnderThisSubjectYet')}
					compact
				/>
			{:else}
				<div class="divide-y divide-gray-200">
					{#each ideaReveal.of(shownIdeas) as idea, at (idea.id)}
						<div use:revealNear={{ reveal: ideaReveal, index: at, trigger: ideaReveal.trigger }}>
							<IdeaCard
								{idea}
								actions={NOTEBOOK_IDEA_ACTIONS}
								selected
								onedit={(id) => {
									editingIdeaId = id;
									composingIdea = true;
								}}
							/>
						</div>
					{/each}
				</div>
			{/if}
		{:else if k === 'inventory'}
			<!--
				The Inventory room's own row: the count you press up and down, the
				price, the thing's own fields and the recipes that use it. The
				count is the whole point of the list — two tins and none are both
				"unticked" until you look — see `ItemRow`.
			-->
			{#if contents.inventory.length === 0}
				<EmptyState
					icon={moduleGlyph('inventory')}
					title={t('notebooks.nothingUnderThisSubjectYet')}
					compact
				/>
			{:else}
				<div class="divide-y divide-gray-200">
					{#each shownInventory as item (item.id)}
						<div class="row-card {itemRowWash(item)}">
							<ItemRow {item} {currency} actions={NOTEBOOK_ITEM_ACTIONS} />
						</div>
					{/each}
				</div>
			{/if}
		{:else if k === 'workouts'}
			<!--
				The Health room's own card: the plan, and the record of what was
				actually done under it. Writing a session down is the room's own
				dialog, which is why that one is a link out rather than a form
				here — see `WorkoutCard`.
			-->
			{#if contents.workouts.length === 0}
				<EmptyState
					icon={moduleGlyph('workouts')}
					title={t('notebooks.nothingUnderThisSubjectYet')}
					compact
				/>
			{:else}
				<ul class="divide-y divide-gray-200">
					{#each shownWorkouts as workout (workout.id)}
						<WorkoutCard
							{workout}
							sessions={contents.workoutSessions}
							actions={NOTEBOOK_WORKOUT_ACTIONS}
						/>
					{/each}
				</ul>
			{/if}
		{:else if k === 'recipes'}
			<!--
				The Kitchen's own card: the picture it is known by, and what it
				needs that the cupboard has not got. The loop between a recipe, the
				week and the shopping list is what the room is for, and a card
				without it is a title in a list — see `RecipeCard`.
			-->
			{#if contents.recipes.length === 0}
				<EmptyState
					icon={moduleGlyph('recipes')}
					title={t('notebooks.nothingUnderThisSubjectYet')}
					compact
				/>
			{:else}
				<div class="divide-y divide-gray-200">
					{#each shownRecipes as recipe (recipe.id)}
						<RecipeCard {recipe} />
					{/each}
				</div>
			{/if}
		{:else if k === 'ledgers'}
			<!--
				The Finance room's own tile: what it is called over what it holds,
				with the balance at the end. A statement is a page rather than a
				panel, so pressing one goes there — a notebook is not where
				somebody reads a bank export.
			-->
			{#if contents.ledgers.length === 0}
				<EmptyState
					icon={moduleGlyph('ledgers')}
					title={t('notebooks.nothingUnderThisSubjectYet')}
					compact
				/>
			{:else}
				<div class="flex flex-wrap gap-2 px-4 py-3">
					{#each shownLedgers as ledger (ledger.id)}
						<LedgerTile
							{ledger}
							{currency}
							href={`${resolve('/finance/ledgers')}?ledger=${ledger.id}`}
						/>
					{/each}
				</div>
			{/if}
		{:else if k === 'habits'}
			<!--
				The Health room's own card: the streak, the year at a glance, the
				backdating and the note on each day. A habit without those is a
				checkbox — see `HabitCard`.
			-->
			{#if contents.habits.length === 0}
				<EmptyState
					icon={moduleGlyph('habits')}
					title={t('notebooks.nothingUnderThisSubjectYet')}
					compact
				/>
			{:else}
				<div class="divide-y divide-gray-200">
					{#each shownHabits as habit (habit.id)}
						<HabitCard
							{habit}
							occurrences={contents.habitOccurrences}
							today={contents.today}
							firstDay={contents.weekFirstDay}
							actions={NOTEBOOK_HABIT_ACTIONS}
						/>
					{/each}
				</div>
			{/if}
		{:else if k === 'bills'}
			<!--
				The Finance room's own list: the rows, the form that edits them and
				the confirmation that deletes an archived one — see `BillList`.
			-->
			<BillList
				bind:this={billList}
				bills={shownBills}
				{currency}
				actions={NOTEBOOK_BILL_ACTIONS}
				notebooks={pickableNotebooks}
				startingNotebook={notebook?.id ?? null}
			>
				{#snippet empty()}
					<EmptyState
						icon={moduleGlyph('bills')}
						title={t('notebooks.nothingUnderThisSubjectYet')}
						compact
					/>
				{/snippet}
			</BillList>
		{/if}
	{/if}
{/snippet}

<!--
	One note, and the two things you can do to it.
	
	`notebookId` is null for a note whose notebook was deleted: editing one must
	not quietly adopt it into whatever notebook is on screen.
-->
<!--
	What a note carries besides its words, written the way the diary writes it:
	names typed inline, not a picker opened.
-->
{#snippet tagsAndPeople(tags: string, people: string)}
	<Field label={t('ui.tags')} span={6} hint={t('notebookDetail.separateWithCommasOrSpaces')}>
		<TagInput
			value={tags}
			known={page.data.tagVocabulary ?? []}
			placeholder={t('notebookDetail.workHealth')}
		/>
	</Field>
	<Field
		label={t('notebookDetail.people')}
		span={6}
		hint={t('notebookDetail.anyoneThisNoteIsAbout')}
	>
		<input
			name="people"
			type="text"
			autocomplete="off"
			list="notebook-known-people"
			value={people}
			placeholder={t('notebookDetail.anaJoão')}
			class="input"
		/>
		<datalist id="notebook-known-people">
			{#each allPeople as person (person.id)}
				<option value={person.name}></option>
			{/each}
		</datalist>
	</Field>
{/snippet}

<!--
	What the list is sorted by, and which way.

	On the tab row, beside the button that takes the notebook full-screen: both
	are ways of looking at these notes, and a row of its own underneath cost a
	centimetre of a phone screen to hold one control. It survives 390px because
	the New button is no longer here — the page draws that, in its header — and
	because the strip beside it takes the room that is left and scrolls.

	Two controls rather than one cycling button — three fields and two
	directions is six presses to get back where you started — and the select is
	a fixed width, so choosing a longer word does not move the arrow beside it.
-->
<!--
	What is done to the list of notes: what it shows, and in what order.

	One snippet, drawn either beside the tabs or on a row below them depending
	on the width — never twice at once, and never two versions of it.
-->
{#snippet moduleControls(key: Tab, total: number, shown: number)}
	<!-- The Notes tab's search and count, in the same slots; these tabs have
	     nothing else to narrow by. -->
	<FilterBar name="notebook-module">
		{#snippet lead()}
			<SearchField
				bind:value={moduleSearches[key]}
				label={t(SEARCH_LABEL[key] ?? 'notebookDetail.searchThisTab')}
			/>
		{/snippet}
		{#snippet count()}
			<ShowingCount {total} {shown} said={(count) => t('notebookDetail.itemsShowing', { count })} />
		{/snippet}
		{#snippet trailing()}
			<SortControl
				value={moduleOrder}
				options={MODULE_ORDERS}
				labels={MODULE_ORDER_LABELS}
				direction={moduleDirection}
				onpick={(next) => {
					moduleOrder = next;
					moduleDirection = 'asc';
				}}
				onflip={() => (moduleDirection = moduleDirection === 'asc' ? 'desc' : 'asc')}
				label={t('notebookDetail.orderThisTabBy')}
			/>
		{/snippet}
	</FilterBar>
{/snippet}

{#snippet noteControls()}
	<!--
		The same strip the tasks tab has, in the same order.

		That tab composes `FilterBar` with a search box in front of it and the
		count and the order behind it; this one was a hand-rolled row of buttons
		with no search at all, so one notebook answered "find the one about the
		boiler" on the Tasks tab and not on the Notes tab beside it. The controls
		differ because notes and tasks differ. The shape does not.
	-->
	<!-- "Select many" is the strip's verb, as on the to-do list, rather than a
	     band of its own above the notes. -->
	{#if (contents?.entries ?? orphaned).length > 0}
		<SelectionBar
			selection={noteSelection}
			visible={selectableNotes.map((entry) => entry.id)}
			verbs={noteBatchVerbs}
			selectAllLabel={t('notebookDetail.selectVisibleNotes')}
			dataTour="notebook-note-selection"
		>
			{#snippet strip(selectMany)}
				{@render noteFilters(selectMany)}
			{/snippet}
		</SelectionBar>
	{:else}
		{@render noteFilters()}
	{/if}
{/snippet}

{#snippet noteFilters(selectMany?: Snippet)}
	<FilterBar
		name="notes"
		verb={selectMany}
		on={noteTagFilter.length > 0 || showArchivedNotes || noteSearch.trim() !== ''}
		summary={noteTagFilter.map((one) => `#${one}`).join(', ')}
		onclear={clearNoteFilters}
	>
		{#snippet lead()}
			<!-- The box fills the slot; how wide that slot is belongs to
			     `FilterBar`, so this tab and the Tasks tab beside it are the same
			     shape. -->
			<SearchField bind:value={noteSearch} label={t('notebookDetail.searchTheseNotes')} />
		{/snippet}

		{#snippet count()}
			<!-- How many are on screen right now — the toggles say what is hidden
			     and nothing said what is left. -->
			<!-- Held open at the count of every note there is — see `.count-slot`. -->
			<ShowingCount
				total={contents?.entries.length ?? 0}
				shown={shownNotes.length}
				said={(count) => t('notebookDetail.showingCount', { count })}
			/>
		{/snippet}

		{#snippet trailing()}
			{@render orderControl()}
		{/snippet}

		<!-- Nothing is hidden without the strip saying how much. -->
		{#if putAwayNotes > 0 || showArchivedNotes}
			<button
				type="button"
				onclick={() => (showArchivedNotes = !showArchivedNotes)}
				class="btn btn-sm shrink-0"
			>
				{t('notebookDetail.archivedCount', { count: putAwayNotes })}
			</button>
		{/if}

		<!--
			What the list is narrowed to, and how to stop.

			A filter nothing on the screen mentions is a list that has quietly lost
			rows: the labels are here, pressed, and pressing one again lets it go.
		-->
		{#each noteTagFilter as name (name)}
			<TagChip {name} active onclick={() => toggleNoteTag(name)} />
		{/each}
	</FilterBar>
{/snippet}

{#snippet orderControl()}
	<!-- The same control the task list uses, always in the same place. See `SortControl`. -->
	<SortControl
		value={noteOrder}
		options={NOTE_ORDERS}
		labels={ORDER_LABELS}
		direction={noteDirection}
		onpick={pickOrder}
		onflip={flipDirection}
		label={t('notebookDetail.orderNotesBy')}
	/>
{/snippet}

{#snippet noteList(entries: Entry[], notebookId: number | null)}
	{#if entries.length === 0 && (contents?.entries ?? orphaned).length > 0}
		<!-- Hidden, not absent: the strip says what is narrowing it. -->
		<EmptyState compact filtered onclear={clearNoteFilters} />
	{:else if entries.length === 0}
		<EmptyState compact icon="note" title={t('notebookDetail.nothingWrittenHereYet')} />
	{:else}
		<div class="divide-y divide-gray-200">
			{#each noteReveal.of(entries) as entry, at (entry.id)}
				<!--
					A pinned note is marked, not just moved.

					Sorting alone says nothing once there are three of them at the top
					of a long notebook: the ones held there have to look held. A wash
					of the section's own accent and a spine down the side, which is
					how the app marks a thing everywhere else.

					`kb-cursor` is where the keyboard is, the same mark every other
					list in the app wears — and `keepInView` keeps it on screen as
					`j` walks past the bottom of the window.
				-->
				<article
					use:keepInView={notebookId !== null && cursor === at}
					use:revealNear={{ reveal: noteReveal, index: at, trigger: noteReveal.trigger }}
					class="{editingNoteId === entry.id ? 'px-4 py-3' : 'row-card'} {cursor === at
						? 'kb-cursor'
						: ''}"
					class:bg-gray-100={noteSelection.selecting && noteSelection.has(entry.id)}
					class:is-pinned={'pinnedAt' in entry && entry.pinnedAt}
				>
					{#if editingNoteId === entry.id}
						<form
							method="post"
							action="?/updateEntry"
							use:enhance={() =>
								async ({ update, result }) => {
									// Never reset: the editor stays open, and blanking its
									// fields for a frame is a flash of an empty note. On a
									// failure it would throw away what was written.
									await update({ reset: false });
									if (result.type === 'success') {
										noteSaved = true;
										say(t('notebookDetail.saved'));
									}
								}}
							oninput={() => (noteSaved = false)}
						>
							<input type="hidden" name="id" value={entry.id} />
							<OneLine
								name="heading"
								value={entry.title ?? ''}
								placeholder={t('ui.title')}
								class="input mb-2 w-full font-medium"
							/>
							<MarkdownBox
								bind:element={editBox}
								value={entry.content}
								name="content"
								rows={8}
								required
								todos={todoRefs}
								notes={noteRefs}
							/>
							<PictureAttach target={editBox} />
							<div class="mt-3">
								<FormGrid>
									<!-- Where it lives, which an edit may change: the diary is
									     the choice of no notebook. -->
									<NotebookField
										notebooks={pickableNotebooks}
										holds="notes"
										value={notebookId}
										span={12}
										noneLabel={t('sections.diary.label')}
									/>
									{@render tagsAndPeople(
										entry.tags.map((t) => t.name).join(', '),
										entry.people.map((p) => p.name).join(', ')
									)}
								</FormGrid>
							</div>
							<div class="mt-2 flex justify-end gap-2">
								<button type="button" class="btn btn-sm" onclick={() => (editingNoteId = null)}
									>{t('ui.cancel')}</button
								>
								<!--
									One button, two jobs, one width.

									Saved and unchanged, it closes; changed, it saves. The two
									words sit in a grid cell the size of the longer one and the
									unused one is hidden rather than removed, so the button
									never changes size under the finger.
								-->
								<button
									class="btn btn-primary btn-sm"
									type={noteSaved ? 'button' : 'submit'}
									onclick={noteSaved ? () => (editingNoteId = null) : undefined}
								>
									<span class="grid">
										<span class="col-start-1 row-start-1" class:invisible={noteSaved}
											>{t('ui.save')}</span
										>
										<span class="col-start-1 row-start-1" class:invisible={!noteSaved}
											>{t('ui.close')}</span
										>
									</span>
								</button>
							</div>
						</form>
					{:else}
						<!--
							The card a task is drawn on — `RowCard`: the fold and the note's
							number in the rail, the name and when beside them, the people and
							labels along the foot with the verbs at the end of that line.

							A note is its name until you open it. A notebook is a subject
							somebody comes back to for months, and a column of full notes is
							a wall: what a list of them is for is finding the one you meant.
							Pressing the title opens it, and it stays open until pressed again.
						-->
						<RowCard quiet={noteSelection.selecting}>
							{#snippet rail()}
								{#if noteSelection.selecting && !('mine' in entry && entry.mine === false)}
									<SelectBox
										checked={noteSelection.has(entry.id)}
										label={t('notebookDetail.selectNote', { title: noteName(entry) })}
										ontoggle={() => noteSelection.toggle(entry.id)}
									/>
								{:else}
									<!-- The same fold as the title; the title is the one a
									     keyboard and a screen reader reach. -->
									<button
										type="button"
										tabindex="-1"
										aria-hidden="true"
										class="-m-1 flex shrink-0 items-start justify-center self-start p-1 text-gray-500 hover:text-gray-900 pointer-coarse:w-11"
										onclick={() => toggleNote(entry.id)}
									>
										<span class="flex size-7 items-center justify-center">
											<Icon
												name={openNotes.has(entry.id) ? 'chevron-down' : 'chevron-right'}
												size={14}
											/>
										</span>
									</button>
								{/if}
								{#if entry.seq !== null}
									<span class="tabular text-[11px] text-gray-500">#{entry.seq}</span>
								{/if}
							{/snippet}

							{#snippet labels()}
								<!-- `@` for a person and `#` for a tag, the same one character
								     that makes the diary's rows legible. -->
								{#each entry.people as person (person.id)}
									<a href={resolve('/notebooks/people')} class="chip">@{person.name}</a>
								{/each}
								{#each entry.tags as tag (tag.id)}
									<TagChip
										name={tag.name}
										active={noteTagFilter.includes(tag.name)}
										onclick={() => toggleNoteTag(tag.name)}
									/>
								{/each}
							{/snippet}

							{#snippet controls()}
								<!-- In a shared notebook everybody reads everything, but a note
								     is edited and deleted only by whoever wrote it. -->
								{#if !('mine' in entry && entry.mine === false)}
									<!--
										Kept at the top, or let go. As many as somebody likes: what
										is worth having in front of you when you open a notebook is
										not a number anybody else can pick.
									-->
									{#if notebookId !== null}
										<form method="post" action="?/pinEntry" use:enhance>
											<input type="hidden" name="id" value={entry.id} />
											<input
												type="hidden"
												name="pinned"
												value={'pinnedAt' in entry && entry.pinnedAt ? 'false' : 'true'}
											/>
											<button
												type="submit"
												class="icon-btn"
												aria-pressed={'pinnedAt' in entry && Boolean(entry.pinnedAt)}
												title={'pinnedAt' in entry && entry.pinnedAt
													? t('notebookDetail.stopKeepingThisAtThe')
													: t('notebookDetail.keepThisAtTheTop')}
												aria-label={'pinnedAt' in entry && entry.pinnedAt
													? t('notebookDetail.stopKeepingThisAtThe')
													: t('notebookDetail.keepThisAtTheTop')}
											>
												<Icon name="pin" />
											</button>
										</form>
									{/if}
									<!--
										Offered by what the note says, not by where the pointer is.

										It is here for as long as the note has a checkbox in it and
										gone the moment it does not, so the row never changes shape
										under somebody reaching for the button beside it. The
										tooltip is what explains it: an icon alone would be a
										guess.
									-->
									{#if checklistItems(entry.content).length > 0}
										<button
											type="button"
											onclick={() => offerTodos(entry)}
											class="icon-btn"
											title={t('notebookDetail.makeTodosOfTheCheckboxes')}
											aria-label={t('notebookDetail.makeTodosOfTheCheckboxes')}
											><Icon name="check" /></button
										>
									{/if}
									<button
										onclick={() => {
											editingNoteId = entry.id;
											noteSaved = false;
										}}
										class="icon-btn"
										title={t('notebookDetail.editThisNote')}
										aria-label={t('notebookDetail.editThisNote')}><Icon name="edit" /></button
									>
									<!--
										Away, and back. No confirmation: this is the reversible one
										— the note stays where it is and comes back unchanged. The
										button beside it is what deletes, and that one asks.
									-->
									<form data-leaves method="post" action="?/archiveEntry" use:enhance>
										<input type="hidden" name="id" value={entry.id} />
										<input type="hidden" name="away" value={entry.archivedAt ? 'false' : 'true'} />
										<button
											type="submit"
											class="icon-btn"
											title={entry.archivedAt
												? t('notebookDetail.takeItBackOut')
												: t('finance.ledgers.putItAway')}
											aria-label={entry.archivedAt
												? t('notebookDetail.takeItBackOut')
												: t('finance.ledgers.putItAway')}
										>
											<Icon name={entry.archivedAt ? 'undo' : 'archive'} />
										</button>
									</form>
									{#if confirmDeleteNote === entry.id}
										<form
											data-leaves
											method="post"
											action="?/deleteEntry"
											use:enhance={() =>
												async ({ update }) => {
													await update({ reset: false });
													confirmDeleteNote = null;
												}}
											class="flex items-center gap-2"
										>
											<input type="hidden" name="id" value={entry.id} />
											<button
												type="button"
												class="btn btn-sm"
												onclick={() => (confirmDeleteNote = null)}>{t('ui.cancel')}</button
											>
											<button class="btn btn-danger btn-sm" use:armed
												>{t('notebookDetail.yesDelete')}</button
											>
										</form>
									{:else}
										<button
											onclick={() => (confirmDeleteNote = entry.id)}
											class="icon-btn icon-btn-danger"
											title={t('notebookDetail.deleteThisNote')}
											aria-label={t('notebookDetail.deleteThisNote')}><Icon name="trash" /></button
										>
									{/if}
								{/if}
							{/snippet}

							<button
								type="button"
								class="flex min-w-0 items-baseline self-start text-left"
								aria-expanded={openNotes.has(entry.id)}
								onclick={() => toggleNote(entry.id)}
							>
								<!-- Named for the suite, which asserts the order the list is in. -->
								<span
									data-note-title
									class="min-w-0 text-sm leading-snug font-medium break-words text-gray-900"
								>
									{noteName(entry)}
								</span>
							</button>
							<span class="tabular mt-0.5 text-xs text-gray-500">
								{when(entry.createdAt)}
								{#if entry.archivedAt}
									{t('notebookDetail.archived')}
								{/if}
								{#if 'author' in entry && entry.author}
									· {entry.author}
								{/if}
							</span>
							{#if openNotes.has(entry.id)}
								<!--
									A reference in the writing opens the task it names.

									`TASK:#4` is rendered as a link by the markdown renderer,
									which is pure and knows nothing about this screen — so the
									press is caught here, where the list and its editor are.
									Delegated from the whole block rather than bound per link:
									the html is written by `{@html}` and has no components in it
									to put a handler on.
								-->
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div class="md mt-2 text-sm text-gray-900" onclick={openReferencedTodo}>
									<!-- `renderMarkdown` escapes every character of the input before it emits a
									     tag, and emits only attributes it writes itself. See `$lib/markdown.ts`. -->
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html renderMarkdown(entry.content, { tasks: todoRefs, notes: noteRefs })}
								</div>
							{/if}
						</RowCard>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
{/snippet}

<BatchDialog
	selection={noteSelection}
	ids={chosenNoteIds}
	action="?/batchEntries"
	id="note-batch-form"
	title={noteSelection.verb ? t(NOTE_BATCH_LABELS[noteSelection.verb]) : ''}
	destructive={noteSelection.verb === 'remove'}
	done={(count) => t('notebookDetail.batchUpdated', { count })}
>
	{#snippet fields(verb)}
		{#if verb === 'notebook'}
			<NotebookField
				notebooks={pickableNotebooks}
				holds="notes"
				value={notebook?.id ?? null}
				span={12}
				noneLabel={t('sections.diary.label')}
			/>
		{:else if verb === 'tag'}
			<Field label={t('todoRows.addLabels')} span={12}
				><OneLine name="add" class="input" autofocus /></Field
			>
			<Field label={t('todoRows.removeLabels')} span={12}
				><OneLine name="remove" class="input" /></Field
			>
		{:else if verb === 'archive'}
			<p class="col-span-12 text-sm text-gray-700">{t('notebookDetail.archiveSelectedNotes')}</p>
		{:else if verb === 'unarchive'}
			<p class="col-span-12 text-sm text-gray-700">{t('notebookDetail.unarchiveSelectedNotes')}</p>
		{:else}
			<p class="col-span-12 text-sm text-gray-700">{t('notebookDetail.deleteSelectedNotes')}</p>
		{/if}
	{/snippet}
</BatchDialog>

<!--
	What the note is about to become.

	Shown rather than promised: somebody who wrote a list two months ago should
	read the titles back before a dozen of them land on their task list, and the
	notes under each are what tells two similar lines apart.
-->
<Modal
	open={listifying !== null}
	onclose={() => (listifying = null)}
	title={t('notebookDetail.makeTodosOfThisNote')}
	size="md"
>
	<form
		method="post"
		action="?/entryToTodos"
		use:enhance={() =>
			async ({ update }) => {
				await update({ reset: false });
				say(t('notebookDetail.madeTodos', { count: coming.size }));
				listifying = null;
			}}
	>
		<input type="hidden" name="id" value={listifying?.id ?? ''} />
		<p class="text-sm text-gray-600">{t('notebookDetail.theNoteStaysAsItIs')}</p>
		<ul class="mt-3 divide-y divide-gray-200 border-y border-gray-200">
			{#each listifyingItems as item, at (at)}
				<li class="flex items-start gap-3 py-2">
					<input
						type="checkbox"
						name="only"
						value={at}
						checked={coming.has(at)}
						onchange={(e) => (e.currentTarget.checked ? coming.add(at) : coming.delete(at))}
						class="mt-0.5"
						aria-label={item.title}
					/>
					<div class="min-w-0 flex-1">
						<p class="text-sm {item.done ? 'text-gray-500 line-through' : 'text-gray-900'}">
							{item.title}
						</p>
						{#if item.notes}
							<p class="mt-0.5 text-xs whitespace-pre-wrap text-gray-500">{item.notes}</p>
						{/if}
					</div>
					{#if item.done}
						<span class="chip shrink-0">{t('notebookDetail.alreadyDone')}</span>
					{/if}
				</li>
			{/each}
		</ul>
		<div class="mt-4 flex justify-end gap-2">
			<button type="button" class="btn" onclick={() => (listifying = null)}>{t('ui.cancel')}</button
			>
			<button class="btn btn-primary" disabled={coming.size === 0}>
				{t('notebookDetail.makeCountTodos', { count: coming.size })}
			</button>
		</div>
	</form>
</Modal>

<!--
	Writing a goal without leaving the notebook.

	The same fields the goals room uses, posting to the same handler — see
	`$lib/services/goal-actions`. The notebook is fixed rather than picked:
	you are looking at it.
-->
<Modal
	bind:open={composingGoal}
	title={editingGoal ? t('goals.editGoal') : t('notebookDetail.newGoal')}
	onclose={() => (editingGoalId = null)}
>
	<!-- Only ever opened from a notebook's own header, so there is one. -->
	<form
		id="notebook-goal-form"
		method="post"
		action={editingGoal ? NOTEBOOK_GOAL_ACTIONS.update : '?/goalCreate'}
		use:enhance={() => {
			const wasEditing = editingGoal !== null;
			return async ({ result, update }) => {
				await update({ reset: false });
				if (result.type !== 'success') return;
				composingGoal = false;
				editingGoalId = null;
				goalTargets = [];
				say(wasEditing ? t('notebookDetail.saved') : t('notebookDetail.goalAdded'));
			};
		}}
	>
		{#if editingGoal}
			<input type="hidden" name="id" value={editingGoal.id} />
		{/if}
		<GoalFields
			editing={editingGoal}
			editingId={editingGoalId}
			bind:horizon={goalHorizon}
			bind:start={goalStart}
			bind:targets={goalTargets}
			{areas}
			notebooks={pickableNotebooks}
			{workoutMeasures}
			{knownUnits}
			startingNotebook={notebook?.id ?? null}
		/>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (composingGoal = false)}>
			{t('ui.cancel')}
		</button>
		<button type="submit" form="notebook-goal-form" class="btn btn-primary">
			{editingGoal ? t('ui.save') : t('goals.createGoal')}
		</button>
	{/snippet}
</Modal>

<!--
	The Ideas tab's composer, which is the Ideas room's form.

	`IdeaFields` — the same box, the same picture and recording attachments,
	the same tag input — so an idea caught against a subject is the same idea
	caught anywhere else. The notebook rides along hidden, which is what files
	it here.
-->
<Modal
	bind:open={composingIdea}
	title={editedIdea ? t('ui.edit') : t('notebooks.newIdea')}
	onclose={closeIdeaForm}
>
	<form
		id="notebook-idea-form"
		method="post"
		action={editedIdea ? '?/ideaUpdate' : '?/ideaCreate'}
		use:enhance={() => {
			const wasEditing = editedIdea !== undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				if (result.type !== 'success') return;
				closeIdeaForm();
				say(wasEditing ? t('notebookDetail.saved') : t('notebooks.newIdea'));
			};
		}}
	>
		{#if editedIdea}
			<input type="hidden" name="id" value={editedIdea.id} />
		{/if}
		<!-- What files it under this subject, on edits too, so saving an idea
		     from in here never takes it out of the notebook. -->
		<input type="hidden" name="notebookId" value={notebook?.id ?? ''} />
		<FormGrid>
			<IdeaFields
				content={editedIdea?.content ?? ''}
				tags={editedIdea?.tags.map((one) => one.name).join(', ') ?? ''}
			/>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={closeIdeaForm}>{t('ui.cancel')}</button>
		<button type="submit" form="notebook-idea-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>

<!--
	The other tabs' composer: the room's own form, in the notebook.

	Same fields, same handlers, and the notebook selector each of those forms
	carries is already on this one — so writing a bill here is writing a bill,
	and the subject it belongs to is a question the form asks rather than a
	thing that happens to it.
-->
{#if notebook && composingModule}
	{@const module = composingModule}
	<Modal open title={t(NEW_LABELS[module] ?? 'ui.add')} onclose={() => (composingModule = null)}>
		<form
			id="notebook-module-form"
			method="post"
			action="?/{ACTION_PREFIX[module]}Create"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type !== 'success') return;
					say(t(NEW_LABELS[module] ?? 'ui.add'));
					composingModule = null;
				}}
		>
			{#if module === 'inventory'}
				<FormGrid>
					<BuyFields
						categories={inventoryCategories}
						{locations}
						askLocation
						notebooks={pickableNotebooks}
						startingNotebook={notebook.id}
						showFields
					/>
				</FormGrid>
			{:else if module === 'ledgers'}
				<LedgerFields {parsers} notebooks={pickableNotebooks} startingNotebook={notebook.id} />
			{:else if module === 'habits'}
				<HabitFields
					bind:kind={habitKind}
					bind:days={habitDays}
					notebooks={pickableNotebooks}
					startingNotebook={notebook.id}
				/>
			{:else if module === 'workouts'}
				<WorkoutFields
					categories={workoutCategories}
					bind:measures={newMeasures}
					notebooks={pickableNotebooks}
					startingNotebook={notebook.id}
				/>
			{:else if module === 'recipes'}
				<RecipeFields notebooks={pickableNotebooks} startingNotebook={notebook.id} />
			{/if}
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={() => (composingModule = null)}
				>{t('ui.cancel')}</button
			>
			<button type="submit" form="notebook-module-form" class="btn btn-primary"
				>{t('ui.save')}</button
			>
		{/snippet}
	</Modal>
{/if}

<!--
	One picker for every tab: linking is the same act whatever the thing is.
	It reads the tab that is showing rather than being drawn nine times.
-->
{#if notebook}
	<LinkIntoNotebook
		bind:open={linking}
		module={tab}
		what={t(LINK_LABEL[tab] ?? 'ui.add')}
		notebookId={notebook.id}
		notebookTitle={notebook.title}
		candidates={(contents?.linkable as Record<string, LinkableList> | undefined)?.[tab]}
		action="?/linkIntoNotebook"
	/>
{/if}

<!-- What counts towards a goal, the same modal the goals room opens. -->
<GoalLinksModal
	goal={linkingGoal}
	{activities}
	{slots}
	{todos}
	{allTodos}
	action={NOTEBOOK_GOAL_ACTIONS.setLinks}
	onclose={() => (linkingGoalId = null)}
/>

<style>
	/*
	 * Inline, the surface is not there: `display: contents` lays its children
	 * out as if the card held them directly. Maximized, `showModal()` puts the
	 * same element in the top layer and these rules give it the screen. The
	 * DOM never moves between the two, which is the whole trick — see the
	 * comment on `maximized`.
	 */
	dialog.nb-surface {
		display: contents;
	}

	dialog.nb-surface[open] {
		display: flex;
		flex-direction: column;
		position: fixed;
		inset: 0;
		margin: 0;
		border: 0;
		padding: 0;
		padding-top: var(--safe-top, 0px);
		width: 100%;
		max-width: 100%;
		height: 100dvh;
		max-height: 100dvh;
	}

	/* Full screen already; a dimmer behind it would be dimming nothing. */
	dialog.nb-surface::backdrop {
		background: transparent;
	}

	/*
	 * The body scrolls on its own only when maximized — inline, the page is
	 * the scroller. Capped at a reading width: a note across a whole monitor
	 * is a line the eye loses its place tracking back from.
	 */
	dialog.nb-surface[open] .nb-body {
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		width: 100%;
		max-width: var(--nb-width, var(--max-width-reading));
		margin-inline: auto;
	}

	/* Split: the panes scroll, each on its own; the body only holds them. */
	dialog.nb-surface.nb-split[open] .nb-body {
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.nb-panes {
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.nb-pane {
		min-width: 0;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		border-top: 2px solid transparent;
	}

	/* The pane the keys go to. */
	.nb-pane-active {
		border-top-color: var(--section-accent);
	}

	.nb-divider {
		flex: 0 0 0.5rem;
		cursor: col-resize;
		background: var(--color-gray-100);
		border-inline: 1px solid var(--color-gray-200);
		touch-action: none;
	}

	.nb-divider:hover,
	.nb-divider:focus-visible {
		background: var(--color-gray-300);
	}

	/* The column's edges: a strip either side of it, over the gutter. */
	.nb-grip {
		position: fixed;
		top: 3.5rem;
		bottom: 0;
		width: 0.5rem;
		cursor: col-resize;
		touch-action: none;
	}

	.nb-grip:hover,
	.nb-grip:focus-visible {
		background: var(--color-gray-200);
	}

	/* A small handle in the middle, so the edge says it can be taken hold of. */
	.nb-grip::after {
		content: '';
		position: absolute;
		top: 50%;
		left: calc(50% - 1px);
		width: 2px;
		height: 2.5rem;
		margin-top: -1.25rem;
		background: var(--color-gray-300);
	}

	.nb-grip-left {
		left: max(0px, calc(50% - var(--nb-width) / 2 - 0.5rem));
	}

	.nb-grip-right {
		right: max(0px, calc(50% - var(--nb-width) / 2 - 0.5rem));
	}

	.nb-drop {
		position: fixed;
		top: 3.5rem;
		right: 0;
		bottom: 0;
		width: 8rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		text-align: center;
		font-size: 0.75rem;
		color: var(--color-gray-700);
		background: var(--color-gray-100);
		border-left: 2px dashed var(--color-gray-400);
	}

	/*
	 * The chosen type size, applied only maximized: the two-column page keeps
	 * the app's own scale. Headings ride along in em so the hierarchy scales
	 * as one thing; `:global` because the markdown's tags are not in this
	 * template.
	 */
	dialog.nb-surface[open] .md {
		font-size: var(--nb-type);
		line-height: 1.6;
	}

	dialog.nb-surface[open] .md :global(h1) {
		font-size: 1.3em;
	}

	dialog.nb-surface[open] .md :global(h2) {
		font-size: 1.15em;
	}

	dialog.nb-surface[open] .md :global(:is(h3, h4, h5, h6)) {
		font-size: 1em;
	}

	/*
	 * Writing at the size you read at.
	 *
	 * `:global`, because the box is `MarkdownBox` now and a scoped selector
	 * stops at the component boundary — the chosen type size stopped reaching
	 * the thing being typed into the moment the preview was added.
	 */
	dialog.nb-surface[open] :global(textarea) {
		font-size: var(--nb-type);
		line-height: 1.6;
	}

	/*
	 * The panel has no gutter of its own — its toolbar and rows inset
	 * themselves by a rem — so the first tab's word lines up with those, not
	 * with a gutter that is not there.
	 */
	.notebook-tabs :global(.room-tabs-nested > .seg-track) {
		margin-inline-start: 0;
		padding-inline: 0.25rem;
	}
</style>
