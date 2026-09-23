<script lang="ts">
	import GoalFields, { type FormTarget } from '$lib/components/fields/GoalFields.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import MarkdownBox from '$lib/components/MarkdownBox.svelte';
	import { page } from '$app/state';
	import TagInput from '$lib/components/TagInput.svelte';
	import { momentOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { tick, untrack, type ComponentProps } from 'svelte';
	import { enhance } from '$lib/enhance';
	import { SvelteSet } from 'svelte/reactivity';
	import OneLine from '$lib/components/OneLine.svelte';
	import { resolve } from '$app/paths';
	import { armed } from '$lib/actions/armed';
	import { BackCloses } from '$lib/back-closes';
	import { isPhone } from '$lib/breakpoints';
	import { keepInView } from '$lib/actions/keep-in-view';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import PictureAttach from '$lib/components/PictureAttach.svelte';
	import { SECTION_COLORS } from '$lib/colors';
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
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import IdeaCard from '$lib/components/IdeaCard.svelte';
	import BillRow from '$lib/components/BillRow.svelte';
	import HabitCard from '$lib/components/HabitCard.svelte';
	import LedgerTile from '$lib/components/LedgerTile.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import WorkoutCard from '$lib/components/WorkoutCard.svelte';
	import ItemRow from '$lib/components/ItemRow.svelte';
	import LinkIntoNotebook from '$lib/components/LinkIntoNotebook.svelte';
	import { NOTEBOOK_ITEM_ACTIONS } from '$lib/item-action-names';
	import { NOTEBOOK_WORKOUT_ACTIONS } from '$lib/workout-action-names';
	import { NOTEBOOK_HABIT_ACTIONS } from '$lib/habit-action-names';
	import { NOTEBOOK_BILL_ACTIONS } from '$lib/bill-action-names';
	import IdeaFields from '$lib/components/fields/IdeaFields.svelte';
	import { NOTEBOOK_IDEA_ACTIONS } from '$lib/idea-action-names';
	import { DEFAULT_MODULES, moduleMeta, type NotebookModule } from '$lib/notebook-modules';
	import type { Currency } from '$lib/money';
	import { NOTEBOOK_TODO_ACTIONS } from '$lib/todo-actions';
	import type { Todo } from '$lib/services/todos';
	import { browsable } from '$lib/browse.svelte';
	import { checklistItems } from '$lib/checklist';
	import { renderMarkdown } from '$lib/markdown';
	import { say } from '$lib/said.svelte';
	import { useT } from '$lib/i18n';
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
		currency = 'BRL',
		pickableNotebooks = [],
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
			blocks: { id: number; label: string | null; date: string; startTime: string }[];
			/* The whole goal: the tab draws the goals room's own card. */
			goals: ComponentProps<typeof GoalCard>['goal'][];
			/* And the whole idea, for the same reason — see `IdeaCard`. */
			ideas: ComponentProps<typeof IdeaCard>['idea'][];
			/* And the whole bill, with the period its tick would pay. */
			bills: (ComponentProps<typeof BillRow>['bill'] & {
				period: string;
				paidThisPeriod: boolean;
			})[];
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
		/** For the money a ledger holds and a bill expects. */
		currency?: Currency;
		pickableNotebooks?: { id: number; title: string }[];
		areas?: { id: number; name: string }[];
		workoutMeasures?: { activity: string; unit: string }[];
		/* What a goal on this notebook can be told to count. */
		slots?: { id: number; name: string; startTime: string }[];
		todos?: { id: number; title: string }[];
		allTodos?: { id: number; title: string; status: string }[];
		activities?: { id: number; name: string }[];
		/** Whether the composer is open, so a page can put the button elsewhere. */
		composing?: boolean;
		newAction?: { label: string; run?: () => void; href?: string } | undefined;
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
	let tab = $state<Tab>('notes');

	/*
	 * A tab that was showing and is not offered any more.
	 *
	 * Switching Inventory off while standing on it would otherwise leave the
	 * strip with nothing lit and the body drawing a module the notebook no
	 * longer has. Notes is always there, which is what makes it the fallback.
	 */
	$effect(() => {
		if (!TAB_KEYS.includes(tab)) tab = 'notes';
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
	 * Where a module's own room is, and what its New button says.
	 *
	 * These six write through the room's own form, which is where that form
	 * lives — the same reason the Goals tab used to be a link. Each is being
	 * moved in here one at a time, the way Goals and Ideas already have been:
	 * the form is the room's component, so it is the same form in both places
	 * rather than a thinner one written twice.
	 */
	const ROOM_OF: Partial<Record<NotebookModule, string>> = {
		inventory: resolve('/inventory'),
		ledgers: resolve('/finance/ledgers'),
		bills: resolve('/finance/bills'),
		habits: resolve('/health/habits'),
		workouts: resolve('/health/workouts'),
		recipes: resolve('/health/recipes')
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

	$effect(() => {
		if (!notebook) {
			newAction = undefined;
			return;
		}
		newAction =
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
							: // The rest, each in the room that owns its form.
								{
									label: t(NEW_LABELS[tab] ?? 'ui.add'),
									href: ROOM_OF[tab]
								};
	});

	/*
	 * Whichever notebook you move to opens on its notes, not on whichever tab
	 * the last one happened to be showing.
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
		tab = 'notes';
	});

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

	/** How many are put away, so the button can say what it would bring back. */
	const putAwayNotes = $derived(
		(contents?.entries ?? orphaned).filter((entry) => entry.archivedAt).length
	);

	/**
	 * The strip: one entry per module this notebook holds, in the app's order.
	 *
	 * Built from the same list the body switches on, so a tab can never be
	 * drawn with nothing behind it. Notes, tasks and goals count themselves
	 * because they are drawn here; everything else is counted through
	 * `rowsFor`, which is what the tab itself draws — so the number beside a
	 * tab is exactly how many lines pressing it shows.
	 */
	const tabs = $derived<{ key: Tab; label: PlainKey; count: number; done?: number }[]>(
		TAB_KEYS.map((key) => {
			if (key === 'notes') return { key, label: 'app.notes' as PlainKey, count: shownNotes.length };
			if (key === 'tasks')
				return {
					key,
					label: 'app.tasks' as PlainKey,
					count: (contents?.todos.length ?? 0) + (contents?.blocks.length ?? 0),
					// A block on the grid is a thing that happens rather than a thing
					// to finish, so only the todos are counted as done or not.
					done: contents?.todos.filter((todo) => CLOSED_STATUSES.includes(todo.status)).length ?? 0
				};
			if (key === 'goals')
				return {
					key,
					label: 'app.goals' as PlainKey,
					count: contents?.goals.length ?? 0,
					done: contents?.goals.filter((goal) => goal.status !== 'open').length ?? 0
				};
			if (key === 'ideas')
				return {
					key,
					label: moduleMeta(key).name,
					count: contents?.ideas.length ?? 0,
					done: contents?.ideas.filter((idea) => idea.isApplied).length ?? 0
				};
			if (key === 'inventory')
				return {
					key,
					label: moduleMeta(key).name,
					count: contents?.inventory.length ?? 0,
					// Got it, which is what the tick on a row says.
					done: contents?.inventory.filter((item) => item.bought).length ?? 0
				};
			if (key === 'workouts')
				return { key, label: moduleMeta(key).name, count: contents?.workouts.length ?? 0 };
			if (key === 'recipes')
				return { key, label: moduleMeta(key).name, count: contents?.recipes.length ?? 0 };
			if (key === 'ledgers')
				return { key, label: moduleMeta(key).name, count: contents?.ledgers.length ?? 0 };
			if (key === 'habits')
				return {
					key,
					label: moduleMeta(key).name,
					count: contents?.habits.length ?? 0,
					// Done today, which is the one thing a habit row is pressed for.
					done:
						contents?.habits.filter((habit) =>
							contents.habitOccurrences.some(
								(one) => one.habitId === habit.id && one.date === contents.today
							)
						).length ?? 0
				};
			if (key === 'bills')
				return {
					key,
					label: moduleMeta(key).name,
					count: contents?.bills.length ?? 0,
					// Put away, not paid: a bill comes round again, and whether this
					// month's is settled is the mark on the row rather than a tally.
					done: contents?.bills.filter((bill) => !bill.active).length ?? 0
				};

			// Every module above names itself; this is the compiler's proof that
			// none is missing rather than a fallback anybody reaches.
			return { key, label: moduleMeta(key).name, count: 0 };
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
	browsable(() => ({
		items: () => (tab === 'notes' ? shownNotes : tab === 'goals' ? (contents?.goals ?? []) : []),
		cursor: () => cursor,
		moveTo: (at: number) => (cursor = at),
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

<!--
	The dialog is the notebook's own surface, inline until `showModal()` — see
	the note on `maximized` above. `display: contents` below is what lets it
	stand here without being a box of its own.
-->
<dialog
	bind:this={surface}
	onclose={leaveMaximized}
	aria-label={notebook?.title ?? 'Notes'}
	class="nb-surface bg-white"
	style="--nb-type: {TYPE_STEPS[typeStep]}"
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
			<!-- Notes whose notebook was deleted: no tabs here, so the order
			     control gets the row the tab strip would have been. -->
			<div class="flex items-center justify-end gap-1 border-b border-gray-200 px-4 py-1.5">
				{@render orderControl()}
			</div>
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
			<div class="flex items-center border-b border-gray-200 pr-2">
				<div class="snap-strip min-w-0 flex-1 gap-1 px-2 md:flex">
					{#each tabs as option (option.key)}
						<!--
							The strip gives up its width to the controls beside it, so on a
							narrow screen the tab you are on can be the one off the end.
							This scrolls it back — by the smallest amount that works, and
							never vertically.
						-->
						<button
							use:keepInView={tab === option.key}
							onclick={() => (tab = option.key)}
							class="tab-link px-3 py-2 text-sm font-medium whitespace-nowrap transition {tab ===
							option.key
								? 'border-b-2 text-gray-900'
								: 'text-gray-500 hover:text-gray-700'}"
							style={tab === option.key ? `border-color: ${SECTION_COLORS.diary}` : ''}
						>
							{t(option.label)}
							<span class="tabular ml-1 text-xs text-gray-500">
								{option.done !== undefined && option.count > 0
									? `${option.done}/${option.count}`
									: option.count}
							</span>
						</button>
					{/each}
				</div>
				<div class="flex shrink-0 items-center justify-end gap-2 pl-2">
					<button
						type="button"
						onclick={() => (maximized ? leaveMaximized() : enterMaximized())}
						class="icon-btn shrink-0"
						title={maximized
							? t('notebookDetail.backToThePage')
							: t('notebookDetail.theWholeScreen')}
						aria-label={maximized
							? t('notebookDetail.backToThePage')
							: t('notebookDetail.theWholeScreen')}
					>
						<Icon name="maximize" />
					</button>
				</div>
			</div>

			{#if tab === 'notes'}
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
			{/if}

			{#if tab === 'notes'}
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
							start="both"
							todos={todoRefs}
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
			{:else if tab === 'tasks'}
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
					shortcutRoom={tab === 'tasks' ? '/tasks/todo' : null}
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
						{#each contents.blocks as block (`b${block.id}`)}
							<li class="flex items-center gap-3 px-4 py-2 text-sm">
								<Icon name="calendar" class="shrink-0 text-gray-500" />
								<span class="min-w-0 flex-1 truncate text-gray-900">{block.label}</span>
								<span class="tabular shrink-0 text-xs text-gray-500">
									{block.date}
									{block.startTime}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if tab === 'goals'}
				<!--
					The goals room's own card, not a line of text.

					This was a list of titles linking to `/goals`: you could see
					that a goal existed and do nothing to it — no edit, no delete,
					no way to say it was achieved or missed, nothing about what
					counts towards it. Filing a goal under a notebook is supposed
					to scope it, not strip it.
				-->
				<div class="divide-y divide-gray-200 px-4">
					{#each contents.goals as goal, at (goal.id)}
						<div class={tab === 'goals' && cursor === at ? 'kb-cursor' : ''}>
							<GoalCard
								{goal}
								goals={contents.goals}
								{allTodos}
								{slots}
								{activities}
								actions={NOTEBOOK_GOAL_ACTIONS}
								accent={SECTION_COLORS.home}
								onedit={(id) => openGoalEdit(id)}
								onlink={(id) => (linkingGoalId = id)}
							/>
						</div>
					{/each}
				</div>
			{:else if tab === 'ideas'}
				<!--
					The Ideas room's own card, not a line with a tick beside it.

					An idea filed under a subject is an idea: its star, its tags, the
					note saying what was applied, and the verbs up its right-hand
					edge. Drawing a thinner version of it here is how the two screens
					stopped agreeing about what an idea is — see `IdeaCard`.
				-->
				{#if contents.ideas.length === 0}
					<EmptyState icon="ideas" title={t('notebooks.nothingUnderThisSubjectYet')} compact />
				{:else}
					<div class="divide-y divide-gray-200 px-4">
						{#each contents.ideas as idea (idea.id)}
							<div class="py-2">
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
			{:else if tab === 'inventory'}
				<!--
					The Inventory room's own row: the count you press up and down, the
					price, the thing's own fields and the recipes that use it. The
					count is the whole point of the list — two tins and none are both
					"unticked" until you look — see `ItemRow`.
				-->
				{#if contents.inventory.length === 0}
					<EmptyState icon="shopping" title={t('notebooks.nothingUnderThisSubjectYet')} compact />
				{:else}
					<div class="divide-y divide-gray-200">
						{#each contents.inventory as item (item.id)}
							<div class="flex items-center gap-x-3 px-4 py-2">
								<ItemRow {item} {currency} actions={NOTEBOOK_ITEM_ACTIONS} />
							</div>
						{/each}
					</div>
				{/if}
			{:else if tab === 'workouts'}
				<!--
					The Health room's own card: the plan, and the record of what was
					actually done under it. Writing a session down is the room's own
					dialog, which is why that one is a link out rather than a form
					here — see `WorkoutCard`.
				-->
				{#if contents.workouts.length === 0}
					<EmptyState icon="flame" title={t('notebooks.nothingUnderThisSubjectYet')} compact />
				{:else}
					<ul class="divide-y divide-gray-200">
						{#each contents.workouts as workout (workout.id)}
							<WorkoutCard
								{workout}
								sessions={contents.workoutSessions}
								actions={NOTEBOOK_WORKOUT_ACTIONS}
							/>
						{/each}
					</ul>
				{/if}
			{:else if tab === 'recipes'}
				<!--
					The Kitchen's own card: the picture it is known by, and what it
					needs that the cupboard has not got. The loop between a recipe, the
					week and the shopping list is what the room is for, and a card
					without it is a title in a list — see `RecipeCard`.
				-->
				{#if contents.recipes.length === 0}
					<EmptyState icon="utensils" title={t('notebooks.nothingUnderThisSubjectYet')} compact />
				{:else}
					<div class="grid gap-px bg-gray-200 sm:grid-cols-2">
						{#each contents.recipes as recipe (recipe.id)}
							<RecipeCard {recipe} />
						{/each}
					</div>
				{/if}
			{:else if tab === 'ledgers'}
				<!--
					The Finance room's own tile: what it is called over what it holds,
					with the balance at the end. A statement is a page rather than a
					panel, so pressing one goes there — a notebook is not where
					somebody reads a bank export.
				-->
				{#if contents.ledgers.length === 0}
					<EmptyState icon="wallet" title={t('notebooks.nothingUnderThisSubjectYet')} compact />
				{:else}
					<div class="flex flex-wrap gap-2 px-4 py-3">
						{#each contents.ledgers as ledger (ledger.id)}
							<LedgerTile
								{ledger}
								{currency}
								href={`${resolve('/finance/ledgers')}?ledger=${ledger.id}`}
							/>
						{/each}
					</div>
				{/if}
			{:else if tab === 'habits'}
				<!--
					The Health room's own card: the streak, the year at a glance, the
					backdating and the note on each day. A habit without those is a
					checkbox — see `HabitCard`.
				-->
				{#if contents.habits.length === 0}
					<EmptyState icon="health" title={t('notebooks.nothingUnderThisSubjectYet')} compact />
				{:else}
					<div class="divide-y divide-gray-200">
						{#each contents.habits as habit (habit.id)}
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
			{:else if tab === 'bills'}
				<!--
					The Finance room's own row: what it costs, its rhythm, the day it
					falls due, the tick that pays it and the undo beside it.
				-->
				{#if contents.bills.length === 0}
					<EmptyState icon="wallet" title={t('notebooks.nothingUnderThisSubjectYet')} compact />
				{:else}
					<ul class="divide-y divide-gray-200">
						{#each contents.bills as bill (bill.id)}
							<BillRow
								{bill}
								{currency}
								actions={NOTEBOOK_BILL_ACTIONS}
								period={bill.period}
								paid={bill.paidThisPeriod}
							/>
						{/each}
					</ul>
				{/if}
			{/if}
		{/if}
	</div>
</dialog>

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
{#snippet noteControls()}
	<!--
		The same strip the tasks tab has, in the same order.

		That tab composes `FilterBar` with a search box in front of it and the
		count and the order behind it; this one was a hand-rolled row of buttons
		with no search at all, so one notebook answered "find the one about the
		boiler" on the Tasks tab and not on the Notes tab beside it. The controls
		differ because notes and tasks differ. The shape does not.
	-->
	<FilterBar
		name="notes"
		on={noteTagFilter.length > 0 || showArchivedNotes || noteSearch.trim() !== ''}
		summary={noteTagFilter.map((one) => `#${one}`).join(', ')}
		onclear={() => {
			noteTagFilter = [];
			showArchivedNotes = false;
			noteSearch = '';
		}}
	>
		{#snippet lead()}
			<!-- The box fills the slot; how wide that slot is belongs to
			     `FilterBar`, so this tab and the Tasks tab beside it are the same
			     shape. -->
			<label class="block w-full">
				<span class="sr-only">{t('notebookDetail.searchTheseNotes')}</span>
				<input
					type="search"
					bind:value={noteSearch}
					placeholder={t('notebookDetail.searchTheseNotes')}
					autocomplete="off"
					class="input input-sm"
				/>
			</label>
		{/snippet}

		{#snippet count()}
			<!-- How many are on screen right now — the toggles say what is hidden
			     and nothing said what is left. -->
			<!-- Held open at the count of every note there is — see `.count-slot`. -->
			<span
				class="tabular count-slot shrink-0 self-center text-xs text-gray-500"
				title={t('notebookDetail.showingCount', { count: shownNotes.length })}
			>
				<span class="count-widest" aria-hidden="true">
					<span class="sm:hidden">{contents?.entries.length ?? 0}</span>
					<span class="hidden sm:inline"
						>{t('notebookDetail.showingCount', { count: contents?.entries.length ?? 0 })}</span
					>
				</span>
				<span>
					<span class="sm:hidden">{shownNotes.length}</span>
					<span class="hidden sm:inline"
						>{t('notebookDetail.showingCount', { count: shownNotes.length })}</span
					>
				</span>
			</span>
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
	{#if shownNotes.length > 1 || noteOrder !== DEFAULT_NOTE_ORDER}
		<!-- The same control the task list uses. See `SortControl`. -->
		<SortControl
			value={noteOrder}
			options={NOTE_ORDERS}
			labels={ORDER_LABELS}
			direction={noteDirection}
			onpick={pickOrder}
			onflip={flipDirection}
			label={t('notebookDetail.orderNotesBy')}
		/>
	{/if}
{/snippet}

{#snippet noteList(entries: Entry[], notebookId: number | null)}
	{#if entries.length === 0}
		<p class="px-4 py-3 text-sm text-gray-500">{t('notebookDetail.nothingWrittenHereYet')}</p>
	{:else}
		<div class="divide-y divide-gray-200">
			{#each entries as entry, at (entry.id)}
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
					class="px-4 py-3 {cursor === at ? 'kb-cursor' : ''}"
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
							{#if notebookId !== null}
								<input type="hidden" name="notebookId" value={notebookId} />
							{/if}
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
								start="both"
								todos={todoRefs}
							/>
							<PictureAttach target={editBox} />
							<div class="mt-3">
								<FormGrid>
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
							A note is its name until you open it.

							A notebook is a subject somebody comes back to for months, and a
							column of full notes is a wall: what a list of them is for is
							finding the one you meant. Pressing the title opens it, and it
							stays open until pressed again.
						-->
						<button
							type="button"
							class="flex w-full items-baseline gap-2 text-left"
							aria-expanded={openNotes.has(entry.id)}
							onclick={() => toggleNote(entry.id)}
						>
							<span class="shrink-0 text-gray-400">
								<Icon name={openNotes.has(entry.id) ? 'chevron-down' : 'chevron-right'} size={14} />
							</span>
							<!-- Named for the suite, which asserts the order the list is in. -->
							<span
								data-note-title
								class="min-w-0 flex-1 truncate text-sm font-medium text-gray-900"
							>
								{noteName(entry)}
							</span>
						</button>
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
								{@html renderMarkdown(entry.content, todoRefs)}
							</div>
						{/if}
						<div class="mt-1 flex flex-wrap items-center gap-2">
							<span class="tabular text-xs text-gray-500">
								{entry.seq === null ? '' : `#${entry.seq} · `}{when(entry.createdAt)}
								{#if entry.archivedAt}
									{t('notebookDetail.archived')}
								{/if}
								{#if 'author' in entry && entry.author}
									· {entry.author}
								{/if}
							</span>

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

							<!-- In a shared notebook everybody reads everything, but a note
							     is edited and deleted only by whoever wrote it. -->
							<div
								class="ml-auto flex items-center gap-2"
								hidden={'mine' in entry && entry.mine === false}
							>
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
								<form method="post" action="?/archiveEntry" use:enhance>
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
							</div>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
{/snippet}

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
						<p class="text-sm {item.done ? 'text-gray-400' : 'text-gray-900'}">{item.title}</p>
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
	One picker for every tab: linking is the same act whatever the thing is.
	It reads the tab that is showing rather than being drawn nine times.
-->
{#if notebook}
	<LinkIntoNotebook
		bind:open={linking}
		module={tab}
		what={t(LINK_LABEL[tab] ?? 'ui.add')}
		notebookId={notebook.id}
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
		max-width: var(--max-width-reading);
		margin-inline: auto;
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
</style>
