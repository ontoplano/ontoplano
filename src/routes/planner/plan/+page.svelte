<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { armed } from '$lib/actions/armed';
	import { enhance, deserialize } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types.js';
	import { autofocus } from '$lib/actions/autofocus.js';
	import MetaEditor from '$lib/components/MetaEditor.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import RatingPicker from '$lib/components/RatingPicker.svelte';
	import { RATINGS } from '$lib/ratings.js';
	import { MAX_INTERVAL, parseRecurrence } from '$lib/recurrence.js';
	import { parseSlotMeta } from '$lib/meta-keys.js';
	import { getAction } from '$lib/shortcuts';
	import { Calendar, DayGrid, TimeGrid, Interaction } from '@event-calendar/core';
	import '@event-calendar/core/index.css';
	import {
		baseGridOptions,
		addDaysStr,
		buildSlotEvents,
		buildSlotEventsForDates,
		buildExceptionalEvents,
		buildSubscribedEvents,
		placementFromDates,
		decodeEventId,
		weekdayToDate,
		formatLocalDate,
		describeGridEvent,
		GRID_ZOOM_LEVELS,
		GRID_DEFAULT_ZOOM_INDEX,
		GRID_DAYS_DESKTOP,
		GRID_DAYS_MOBILE,
		hourToTime,
		GRID_SNAP_DURATION,
		timeToMinutes,
		minutesToTime,
		type GridEventDetail,
		type GridEventKind
	} from '$lib/planner-grid.js';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type PlanView = 'day' | 'week' | 'month';

	let viewMode: PlanView = $state(data.view);

	/**
	 * A 7x24 grid needs roughly 90px per day column to stay readable, so below
	 * about 700px a week stops being a week and becomes seven strips of truncated
	 * text. Narrow screens fall back to the day, unless the URL asked for
	 * something else — an explicit `?view=week` is the user saying they want it.
	 */
	const NARROW_BREAKPOINT = 700;

	/**
	 * Whether the width question has been answered yet.
	 *
	 * The calendar must not be mounted before it has: mounting and then tearing
	 * it down in the same frame makes the library set scrollTop on an element it
	 * no longer has, which throws.
	 */
	let widthChecked = $state(false);
	let narrowScreen = $state(false);

	// One effect owns `viewMode`, because two of them assigning it is what makes
	// the calendar mount and unmount in the same frame.
	$effect(() => {
		if (typeof window === 'undefined') return;

		const query = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`);
		const apply = () => {
			narrowScreen = query.matches;
			widthChecked = true;
		};
		apply();
		query.addEventListener('change', apply);
		return () => query.removeEventListener('change', apply);
	});

	$effect(() => {
		viewMode = data.view;
	});

	/** What the grid actually shows, after the screen width has its say. */
	const effectiveView = $derived<PlanView>(
		narrowScreen && viewMode === 'week' && !data.viewExplicit ? 'day' : viewMode
	);

	const gridDays = $derived(effectiveView === 'day' ? GRID_DAYS_MOBILE : GRID_DAYS_DESKTOP);

	// The hours the account asked for, in Preferences. The geometry the drop
	// target reads back has to agree with what the calendar was told to draw.
	const gridMinTime = $derived(hourToTime(data.gridHours.start));
	const gridMaxTime = $derived(hourToTime(data.gridHours.end));

	/**
	 * Which day the single-day grid is showing.
	 *
	 * Tracks the day tabs, so moving between days and moving the grid are the
	 * same act rather than two independent cursors.
	 */
	const gridFrom = $derived(effectiveView === 'day' ? selectedDateStr() : data.range.from);
	/**
	 * The todo strip starts folded: it is a staging area, not the plan, and open
	 * by default it pushed the grid down the page on every load.
	 */
	let todosOpen = $state(false);

	let prefillTime = $state('09:00');
	let prefillDuration = $state(60);
	let gridError: string | null = $state(null);
	let createFormEl: HTMLElement | undefined = $state();
	/**
	 * The calendar itself, for the one thing done imperatively.
	 *
	 * Its published types describe the component as exporting nothing, though
	 * the component does export the calendar's own API — so the handle is held
	 * as `unknown` and narrowed once, here, rather than cast at each call.
	 */
	let ec: unknown = $state();
	const calendar = $derived(ec as { addEvent: (e: unknown) => unknown } | undefined);

	const ZOOM_STORAGE_KEY = 'ontoplano:planner-grid-zoom';

	function storedZoomIndex(): number {
		if (!browser) return GRID_DEFAULT_ZOOM_INDEX;
		const stored = localStorage.getItem(ZOOM_STORAGE_KEY);
		if (stored === null) return GRID_DEFAULT_ZOOM_INDEX;
		const raw = Number(stored);
		if (!Number.isInteger(raw) || raw < 0 || raw >= GRID_ZOOM_LEVELS.length) {
			return GRID_DEFAULT_ZOOM_INDEX;
		}
		return raw;
	}

	let zoomIndex = $state(storedZoomIndex());
	let hovered: (GridEventDetail & { top: number; left: number; flip: boolean }) | null =
		$state(null);

	const slotHeight = $derived(GRID_ZOOM_LEVELS[zoomIndex]);

	function setZoom(index: number) {
		const next = Math.min(Math.max(index, 0), GRID_ZOOM_LEVELS.length - 1);
		if (next === zoomIndex) return;
		zoomIndex = next;
		hovered = null;
		if (browser) localStorage.setItem(ZOOM_STORAGE_KEY, String(next));
	}

	// Ctrl/Cmd+wheel over the grid zooms the grid instead of the whole page. The listener
	// must be non-passive for preventDefault() to take effect, hence the manual binding.
	function gridZoomWheel(node: HTMLElement) {
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey && !e.metaKey) return;
			e.preventDefault();
			setZoom(zoomIndex + (e.deltaY < 0 ? 1 : -1));
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return {
			destroy() {
				node.removeEventListener('wheel', onWheel);
			}
		};
	}

	function showHover(info: { el: HTMLElement; event: Parameters<typeof describeGridEvent>[0] }) {
		const rect = info.el.getBoundingClientRect();
		const flip = rect.right + 260 > window.innerWidth;
		hovered = {
			...describeGridEvent(info.event),
			top: rect.top,
			left: flip ? rect.left : rect.right,
			flip
		};
	}

	// Sentinel value for the "+ New activity" option in the activity selects; the
	// server creates the activity as part of the same submission.
	const NEW_ACTIVITY = '__new__';

	// One form creates and edits both kinds of block. A recurring slot and a
	// one-off differ only in "which day" — weekday versus date — so splitting
	// them into two forms only ever made the user pick the storage table.
	type BlockKind = 'slot' | 'exceptional';

	let showForm = $state(false);
	let repeat: 'weekly' | 'once' = $state('weekly');
	let editingKind: BlockKind | null = $state(null);
	let editingBlockId: number | null = $state(null);
	let confirmingFormDelete = $state(false);
	let formDate = $state('');
	let formWeekday = $state(0);
	// The Repeats control extends the weekly/one-off toggle rather than replacing
	// it: "every week" is still one click, the rest unfold from it.
	let recurrenceKind: 'weekly' | 'weeks' | 'days' | 'monthly' = $state('weekly');
	let recurrenceInterval = $state(2);
	let recurrenceMonthDay = $state(1);
	/** Arrived here from first run; dismissed with a click and never stored. */
	let showWelcome = $state(page.url.searchParams.get('welcome') === '1');

	let formRatings: Record<string, number | null> = $state({
		urgency: null,
		interest: null,
		energy: null
	});

	/** How many of the folded-away ratings currently carry a value. */
	const ratingsSet = $derived(Object.values(formRatings).filter((v) => v !== null).length);
	let slotMode: 'category' | 'activity' = $state('activity');
	let activityChoice = $state(NEW_ACTIVITY);
	// Offset into the visible window (0 = the day it starts on, i.e. today by
	// default), not a Monday-indexed weekday. The weekday is derived from it.
	let selectedOffset: number = $state(0);
	let selectedIndex: number = $state(0);

	const selectedDayInfo = $derived(data.range.days[selectedOffset] ?? data.range.days[0]);
	const selectedWeekday = $derived(selectedDayInfo.weekday);

	let selectedIds: Set<number> = $state(new Set());
	let multiselect = $state(false);
	let showCopyPanel = $state(false);
	let copyTargetDays: Set<number> = $state(new Set());
	let confirmingDelete: string | null = $state(null);
	let confirmingBulkDelete = $state(false);
	let schemesExpanded = $state(false);
	let newSchemeName = $state('');
	let confirmingLoadSchemeId: number | null = $state(null);
	let confirmingDeleteSchemeId: number | null = $state(null);
	let confirmingClearAll = $state(false);
	let confirmingTemplate: string | null = $state(null);
	let showCsvImport = $state(false);

	let timeInput: HTMLInputElement | undefined = $state(undefined);

	type Slot = (typeof data.slots)[number];
	type Exceptional = (typeof data.exceptionals)[number];

	function findSlot(id: number): Slot | null {
		return data.slots.find((s: Slot) => s.id === id) ?? null;
	}

	function findExceptional(id: number): Exceptional | null {
		return data.exceptionals.find((e: Exceptional) => e.id === id) ?? null;
	}

	function selectedDateStr(): string {
		return selectedDayInfo.date;
	}

	function selectOffsetForDate(date: string) {
		const offset = data.range.days.findIndex((d: { date: string }) => d.date === date);
		if (offset >= 0) selectedOffset = offset;
	}

	function isSlotSuppressed(slotId: number): boolean {
		const date = selectedDateStr();
		return data.suppressions.some(
			(s: { slotId: number; date: string }) => s.slotId === slotId && s.date === date
		);
	}

	function slotsForDay(day: number): Slot[] {
		return data.slots.filter((s: Slot) => s.weekday === day);
	}

	function formatWeekDate(dateStr: string): string {
		const d = new Date(`${dateStr}T00:00:00`);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function defaultActivityChoice(activityId: number | null | undefined): string {
		if (activityId != null) return String(activityId);
		if (data.activities.length > 0) return String(data.activities[0].id);
		return NEW_ACTIVITY;
	}

	function openForm() {
		showForm = true;
		confirmingFormDelete = false;
		tick().then(() => timeInput?.focus());
	}

	function closeForm() {
		showForm = false;
		editingKind = null;
		editingBlockId = null;
		confirmingFormDelete = false;
	}

	function startEdit(slot: Slot) {
		const rec = parseRecurrence(slot.recurrence);
		recurrenceKind = rec.kind;
		if (rec.kind === 'weeks' || rec.kind === 'days') recurrenceInterval = rec.interval;
		if (rec.kind === 'monthly') recurrenceMonthDay = rec.day;
		formRatings = {
			urgency: slot.urgency ?? null,
			interest: slot.interest ?? null,
			energy: slot.energy ?? null
		};
		editingKind = 'slot';
		editingBlockId = slot.id;
		repeat = 'weekly';
		formWeekday = slot.weekday;
		slotMode = slot.mode as 'category' | 'activity';
		activityChoice = defaultActivityChoice(slot.activityId);
		openForm();
	}

	function startEditExceptional(exc: Exceptional) {
		formRatings = {
			urgency: exc.urgency ?? null,
			interest: exc.interest ?? null,
			energy: exc.energy ?? null
		};
		editingKind = 'exceptional';
		editingBlockId = exc.id;
		repeat = 'once';
		formDate = exc.date;
		slotMode = exc.mode as 'category' | 'activity';
		activityChoice = defaultActivityChoice(exc.activityId);
		openForm();
	}

	function startNew(mode: 'weekly' | 'once' = 'weekly') {
		recurrenceKind = 'weekly';
		recurrenceInterval = 2;
		recurrenceMonthDay = 1;
		formRatings = { urgency: null, interest: null, energy: null };
		editingKind = null;
		editingBlockId = null;
		repeat = mode;
		formWeekday = selectedWeekday;
		formDate = selectedDateStr();
		slotMode = 'activity';
		activityChoice = defaultActivityChoice(null);
		openForm();
	}

	/** Swap a block between repeating and one-off, keeping everything else. */
	async function convertRepeat() {
		if (editingBlockId === null || editingKind === null) return;

		const body = new FormData();
		body.set('id', String(editingBlockId));
		body.set('to', editingKind === 'slot' ? 'once' : 'weekly');
		// Which day a converted weekly block lands on: the one being looked at.
		body.set('date', editingKind === 'slot' ? selectedDateStr() : formDate || selectedDateStr());

		const result = await postGridAction(
			'convertRepeat',
			body,
			'Could not change how this repeats.'
		);
		if (!result) return;

		closeForm();
		await invalidateAll();
	}

	/**
	 * Where a drop or a tap landed on the grid, in calendar terms.
	 *
	 * The calendar has no external-drop support, so this reads the geometry
	 * back: which day column the pointer is over, and how far down the body it
	 * fell. Returns null when the pointer is outside the grid, which is how a
	 * drop onto the toolbar or the page margin gets ignored rather than
	 * scheduling something at a guessed time.
	 *
	 * The column is found by horizontal position rather than by what was under
	 * the pointer, because the events are drawn in a layer of their own beside
	 * the day columns rather than inside them — landing on an existing block
	 * used to find no day at all and silently do nothing.
	 */
	function dropTarget(e: {
		target: EventTarget | null;
		clientX: number;
		clientY: number;
	}): { date: string; startTime: string } | null {
		const root = (e.target as HTMLElement | null)?.closest('.ec');
		const bodyEl = root?.querySelector('.ec-body');
		if (!bodyEl) return null;

		const bodyRect = bodyEl.getBoundingClientRect();
		if (bodyRect.height === 0) return null;

		// The day columns in the body, in order, matched against the dates the
		// grid is currently showing.
		const columns = [...bodyEl.querySelectorAll('.ec-day:not(.ec-sidebar)')];
		const index = columns.findIndex((c) => {
			const r = c.getBoundingClientRect();
			return e.clientX >= r.left && e.clientX <= r.right;
		});
		if (index === -1) return null;

		const days =
			gridDays === 1 ? [selectedDateStr()] : data.range.days.map((d: { date: string }) => d.date);
		const date = days[index];
		if (!date) return null;

		const minMinutes = timeToMinutes(gridMinTime);
		const span = timeToMinutes(gridMaxTime) - minMinutes;
		const fraction = Math.min(Math.max((e.clientY - bodyRect.top) / bodyRect.height, 0), 1);

		// Snapped to the same step a drag uses, so a dropped todo lands on the
		// same gridlines as everything else.
		const snap = timeToMinutes(GRID_SNAP_DURATION);
		const minutes = Math.floor((minMinutes + fraction * span) / snap) * snap;

		return { date, startTime: minutesToTime(minutes) };
	}

	let dragTodoId: number | null = $state(null);
	let dropPreview: { date: string; startTime: string } | null = $state(null);

	/**
	 * The same thing as a drag, for a finger.
	 *
	 * HTML5 drag-and-drop does not exist on touch, so the rail's whole purpose —
	 * put this todo at that hour — was unreachable on a phone while the hint
	 * cheerfully said to drag one. Tapping a todo arms it and the next tap on
	 * the grid places it. It works with a mouse too, which is one behaviour
	 * fewer to explain.
	 */
	let placingTodoId: number | null = $state(null);
	const placingTodo = $derived(data.todos.find((t: { id: number }) => t.id === placingTodoId));

	async function scheduleTodoAt(todoId: number, target: { date: string; startTime: string }) {
		const body = new FormData();
		body.set('todoId', String(todoId));
		body.set('date', target.date);
		body.set('startTime', target.startTime);
		body.set('durationMinutes', '30');

		const result = await postGridAction('scheduleTodo', body, 'Could not schedule that todo.');
		if (!result) return;
		await invalidateAll();
	}

	/**
	 * Placing beats every other reading of a tap on the grid.
	 *
	 * It has to be pointer events rather than `click`: an existing block is
	 * draggable, and the calendar swallows the pointer to start its own drag, so
	 * a tap that lands on one never becomes a click at all. Capture-phase, and
	 * propagation stopped, so the calendar does not also read the tap as "make a
	 * block here".
	 *
	 * The down/up pair with a movement threshold is what keeps a scroll from
	 * counting as a placement — a finger dragging the grid up is not choosing a
	 * time.
	 */
	let placeStart: { x: number; y: number } | null = null;
	const PLACE_SLOP = 10;

	function onGridPointerDown(e: PointerEvent) {
		if (placingTodoId === null) return;
		placeStart = { x: e.clientX, y: e.clientY };
		e.stopPropagation();
	}

	async function onGridPointerUp(e: PointerEvent) {
		const start = placeStart;
		placeStart = null;
		if (placingTodoId === null || !start) return;
		if (Math.abs(e.clientX - start.x) > PLACE_SLOP || Math.abs(e.clientY - start.y) > PLACE_SLOP)
			return;

		const target = dropTarget(e);
		if (!target) return;

		e.preventDefault();
		e.stopPropagation();

		const todoId = placingTodoId;
		placingTodoId = null;
		await scheduleTodoAt(todoId, target);
	}

	async function onTodoDrop(e: DragEvent) {
		e.preventDefault();
		const todoId = dragTodoId;
		dragTodoId = null;
		dropPreview = null;
		if (todoId === null) return;

		const target = dropTarget(e);
		if (!target) return;

		await scheduleTodoAt(todoId, target);
	}

	/* ── Multi-select ──────────────────────────────────────────────────────────
	 *
	 * Shift-drag draws a rectangle over the grid and selects every block it
	 * touches; dragging any one of them then moves the whole set by the same
	 * amount.
	 *
	 * The rectangle has to intercept the mousedown before event-calendar sees
	 * it, because the calendar reads a plain drag on empty space as "create a
	 * block here". Hence capture-phase listeners that stop propagation while
	 * Shift is held, and leave every other gesture untouched.
	 */
	type Marquee = { x1: number; y1: number; x2: number; y2: number };

	let selectedEventIds: Set<string> = $state(new Set<string>());

	/**
	 * True from the start of a shift-drag until just after it ends.
	 *
	 * event-calendar decides a drag was a "select" once the pointer is released,
	 * and by then the shift key may already be up — so the flag, not the
	 * modifier, is what tells the two gestures apart.
	 */
	let marqueeJustFinished = false;
	let marquee: Marquee | null = $state<Marquee | null>(null);
	let gridEl: HTMLElement | undefined = $state();

	const marqueeRect = $derived(
		marquee
			? {
					left: Math.min(marquee.x1, marquee.x2),
					top: Math.min(marquee.y1, marquee.y2),
					width: Math.abs(marquee.x2 - marquee.x1),
					height: Math.abs(marquee.y2 - marquee.y1)
				}
			: null
	);

	function selectionSurface(node: HTMLElement) {
		gridEl = node;

		const onMouseDown = (e: MouseEvent) => {
			if (!e.shiftKey || e.button !== 0) return;
			// Keep the calendar from starting its own drag-to-create.
			e.preventDefault();
			e.stopPropagation();

			marqueeJustFinished = true;
			const rect = node.getBoundingClientRect();
			marquee = {
				x1: e.clientX - rect.left,
				y1: e.clientY - rect.top,
				x2: e.clientX - rect.left,
				y2: e.clientY - rect.top
			};

			const onMove = (move: MouseEvent) => {
				if (!marquee) return;
				marquee = { ...marquee, x2: move.clientX - rect.left, y2: move.clientY - rect.top };
			};

			const onUp = () => {
				window.removeEventListener('mousemove', onMove);
				window.removeEventListener('mouseup', onUp);
				commitMarquee(node);
				// Cleared after the calendar has had its turn at the same release.
				setTimeout(() => (marqueeJustFinished = false), 0);
			};

			window.addEventListener('mousemove', onMove);
			window.addEventListener('mouseup', onUp);
		};

		node.addEventListener('mousedown', onMouseDown, { capture: true });
		return {
			destroy() {
				node.removeEventListener('mousedown', onMouseDown, { capture: true });
			}
		};
	}

	/** Every block the rectangle touched, by event id. */
	function commitMarquee(node: HTMLElement) {
		if (!marqueeRect) return;

		const base = node.getBoundingClientRect();
		const box = {
			left: base.left + marqueeRect.left,
			top: base.top + marqueeRect.top,
			right: base.left + marqueeRect.left + marqueeRect.width,
			bottom: base.top + marqueeRect.top + marqueeRect.height
		};

		// A click rather than a drag clears the selection, which is what
		// clicking empty space is expected to do.
		const isClick = marqueeRect.width < 4 && marqueeRect.height < 4;
		marquee = null;

		if (isClick) {
			selectedEventIds = new Set();
			return;
		}

		// Not a SvelteSet: this is built locally and assigned wholesale to
		// selectedEventIds, so reactivity comes from the assignment. Nothing ever
		// mutates a Set in place here.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const found = new Set<string>();
		for (const el of node.querySelectorAll<HTMLElement>('.ec-event')) {
			const r = el.getBoundingClientRect();
			const overlaps =
				r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
			if (!overlaps) continue;

			const id = el.dataset.ogEventId;
			if (id) found.add(id);
		}
		selectedEventIds = found;
	}

	/**
	 * The id event-calendar does not put in the DOM.
	 *
	 * `eventDidMount` is the only hook that sees both the event and its element,
	 * so the id is stamped there and read back when the rectangle needs to know
	 * what it touched.
	 */
	function stampEventId(info: { el: HTMLElement; event: { id: string | number } }) {
		info.el.dataset.ogEventId = String(info.event.id);
		// Re-applied here as well as in the effect below, because a block that
		// mounts after a selection was made would otherwise miss it.
		info.el.classList.toggle('og-selected', selectedEventIds.has(String(info.event.id)));
	}

	// The calendar owns these elements and re-renders them, so the selected
	// class is written onto the DOM rather than expressed in markup.
	$effect(() => {
		// Both dependencies are read before anything can return early: a guard
		// that skips the read means the effect is never re-run when it changes.
		const ids = selectedEventIds;
		const root = gridEl;
		if (!root) return;

		for (const el of root.querySelectorAll<HTMLElement>('.ec-event')) {
			const id = el.dataset.ogEventId;
			el.classList.toggle('og-selected', !!id && ids.has(id));
		}
	});

	/* ── Undo ──────────────────────────────────────────────────────────────────
	 *
	 * Every grid edit records how to put things back, and Ctrl-Z runs the last
	 * one. Inverse operations rather than snapshots: the page reloads from the
	 * server after each change, so a stored snapshot would be stale the moment
	 * anything else touched the same data, whereas "put block 7 back on Tuesday
	 * at 18:00" stays true.
	 *
	 * Deliberately bounded and in-memory. Undo here is for taking back the drag
	 * you just made, not a document history — persisting it would raise
	 * questions (whose undo? across devices?) that the feature does not need to
	 * answer.
	 */
	type UndoStep = { label: string; run: () => Promise<void> };

	const UNDO_LIMIT = 25;
	let undoStack: UndoStep[] = [];
	let undoNotice: string | null = $state(null);

	function pushUndo(step: UndoStep) {
		undoStack.push(step);
		if (undoStack.length > UNDO_LIMIT) undoStack.shift();
	}

	/** Restore a block to a known placement. */
	function restorePlacement(
		kind: GridEventKind,
		source: Slot | Exceptional,
		placement: { weekday?: number; date?: string; startTime: string; durationMinutes: number }
	): () => Promise<void> {
		// The identity fields are captured now, because by the time this runs the
		// block may no longer be in `data`.
		const identity = {
			mode: source.mode,
			categoryId: source.categoryId,
			activityId: source.activityId,
			label: source.label ?? ''
		};
		const id = source.id;

		return async () => {
			const body = new FormData();
			body.set('id', String(id));
			body.set('startTime', placement.startTime);
			body.set('durationMinutes', String(placement.durationMinutes));
			body.set('mode', identity.mode);
			if (identity.categoryId != null) body.set('categoryId', String(identity.categoryId));
			if (identity.activityId != null) body.set('activityId', String(identity.activityId));
			body.set('label', identity.label);
			if (kind === 'slot') body.set('weekday', String(placement.weekday ?? 0));
			else body.set('date', placement.date ?? '');

			await postGridAction(
				kind === 'slot' ? 'update' : 'updateExceptional',
				body,
				'Could not undo that.'
			);
		};
	}

	async function undoLast() {
		const step = undoStack.pop();
		if (!step) {
			undoNotice = 'Nothing to undo';
			setTimeout(() => (undoNotice = null), 1500);
			return;
		}

		await step.run();
		undoNotice = `Undid: ${step.label}`;
		setTimeout(() => (undoNotice = null), 2000);
		await invalidateAll();
	}

	/**
	 * Which month a six-week grid is showing.
	 *
	 * The grid starts on the Monday on or before the first, so its first row can
	 * belong to the previous month; the fourth row never does.
	 */
	function monthLabel(from: string): string {
		return new Date(`${addDaysStr(from, 21)}T12:00:00`).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric'
		});
	}

	function goToRange(from: string | null) {
		const parts: string[] = [`view=${viewMode}`];
		if (from) parts.push(`from=${from}`);
		goto(`/planner/plan${parts.length ? `?${parts.join('&')}` : ''}`);
	}

	function goToPrevWeek() {
		if (data.range.prev) goToRange(data.range.prev);
	}

	function goToNextWeek() {
		goToRange(data.range.next);
	}

	function goToToday() {
		goToRange(null);
	}

	function toggleSlotSelection(id: number) {
		if (selectedIds.has(id)) {
			selectedIds = new Set([...selectedIds].filter((x) => x !== id));
		} else {
			selectedIds = new Set([...selectedIds, id]);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		// Before the input guard: Ctrl-Z is expected to work regardless of what
		// happens to hold focus, and the grid has no text field of its own.
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
			e.preventDefault();
			undoLast();
			return;
		}

		if (e.key === 'Escape') {
			e.preventDefault();
			showCopyPanel = false;
			confirmingDelete = null;
			confirmingBulkDelete = false;
			multiselect = false;
			selectedIds = new Set();
			selectedEventIds = new Set();
			closeForm();
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const action = getAction('/planner/plan', e.key);
		if (!action) {
			if (showCopyPanel) {
				return;
			}
			return;
		}
		e.preventDefault();

		if (action === 'toggle-view') {
			setView(viewMode === 'day' ? 'week' : viewMode === 'week' ? 'month' : 'day');
			return;
		}

		if (action === 'zoom-in' || action === 'zoom-out' || action === 'zoom-reset') {
			// Zoom is a time-grid idea; a month has no hour to make taller.
			if (effectiveView === 'month') return;
			if (action === 'zoom-reset') setZoom(GRID_DEFAULT_ZOOM_INDEX);
			else setZoom(zoomIndex + (action === 'zoom-in' ? 1 : -1));
			return;
		}

		if (showCopyPanel) {
			return;
		}

		const slots = slotsForDay(selectedWeekday);

		if (multiselect) {
			switch (action) {
				case 'toggle-multiselect':
					confirmingDelete = null;
					confirmingBulkDelete = false;
					multiselect = false;
					selectedIds = new Set();
					return;
				case 'toggle-select':
					if (slots.length > 0 && slots[selectedIndex]) {
						toggleSlotSelection(slots[selectedIndex].id);
					}
					return;
				case 'delete-selected':
					if (selectedIds.size > 0) {
						if (confirmingBulkDelete) {
							const form = document.getElementById('bulk-delete-form');
							if (form instanceof HTMLFormElement) form.requestSubmit();
							confirmingBulkDelete = false;
						} else {
							confirmingBulkDelete = true;
						}
					}
					return;
				case 'copy-to-days':
					if (selectedIds.size > 0) {
						showCopyPanel = true;
						copyTargetDays = new Set();
					}
					return;
				case 'prev-day':
					confirmingDelete = null;
					confirmingBulkDelete = false;
					selectedOffset = Math.max(selectedOffset - 1, 0);
					selectedIndex = 0;
					return;
				case 'next-day':
					confirmingDelete = null;
					confirmingBulkDelete = false;
					selectedOffset = Math.min(selectedOffset + 1, data.range.days.length - 1);
					selectedIndex = 0;
					return;
				case 'navigate-down':
					confirmingDelete = null;
					confirmingBulkDelete = false;
					if (slots.length > 0) {
						selectedIndex = Math.min(selectedIndex + 1, slots.length - 1);
					}
					return;
				case 'navigate-up':
					confirmingDelete = null;
					confirmingBulkDelete = false;
					if (slots.length > 0) {
						selectedIndex = Math.max(selectedIndex - 1, 0);
					}
					return;
			}
			return;
		}

		switch (action) {
			case 'prev-week':
				goToPrevWeek();
				break;
			case 'next-week':
				goToNextWeek();
				break;
			case 'toggle-multiselect':
				multiselect = true;
				break;
			case 'prev-day':
				confirmingDelete = null;
				confirmingBulkDelete = false;
				selectedOffset = Math.max(selectedOffset - 1, 0);
				selectedIndex = 0;
				break;
			case 'next-day':
				confirmingDelete = null;
				confirmingBulkDelete = false;
				selectedOffset = Math.min(selectedOffset + 1, data.range.days.length - 1);
				selectedIndex = 0;
				break;
			case 'navigate-down':
				confirmingDelete = null;
				confirmingBulkDelete = false;
				if (slots.length > 0) {
					selectedIndex = Math.min(selectedIndex + 1, slots.length - 1);
				}
				break;
			case 'navigate-up':
				confirmingDelete = null;
				confirmingBulkDelete = false;
				if (slots.length > 0) {
					selectedIndex = Math.max(selectedIndex - 1, 0);
				}
				break;
			case 'edit':
				if (slots.length > 0 && slots[selectedIndex]) {
					startEdit(slots[selectedIndex]);
				}
				break;
			case 'toggle-active':
				if (slots.length > 0 && slots[selectedIndex]) {
					const form = document.getElementById(`toggle-form-${slots[selectedIndex].id}`);
					if (form instanceof HTMLFormElement) form.requestSubmit();
				}
				break;
			case 'delete':
				if (slots.length > 0 && slots[selectedIndex]) {
					const slot = slots[selectedIndex];
					const key = `slot-${slot.id}`;
					if (confirmingDelete === key) {
						const form = document.getElementById(`delete-form-${slot.id}`);
						if (form instanceof HTMLFormElement) form.requestSubmit();
						confirmingDelete = null;
					} else {
						confirmingDelete = key;
					}
				}
				break;
			case 'new':
				startNew();
				break;
			case 'new-exceptional':
				startNew('once');
				break;
		}
	}

	// The block currently open in the form, whichever kind it is. Only the fields
	// both kinds share are read through this; the day/date field is rendered from
	// `formWeekday` / `formDate` instead.
	const editingBlock = $derived.by((): Slot | Exceptional | null => {
		if (editingBlockId === null) return null;
		return editingKind === 'slot' ? findSlot(editingBlockId) : findExceptional(editingBlockId);
	});

	const formAction = $derived.by(() => {
		if (editingKind === 'slot') return '?/update';
		if (editingKind === 'exceptional') return '?/updateExceptional';
		return repeat === 'once' ? '?/createExceptional' : '?/create';
	});

	function setView(mode: PlanView) {
		viewMode = mode;
		const parts: string[] = [`view=${mode}`];
		if (!data.range.isCurrent) parts.push(`from=${data.range.from}`);
		const qs = parts.join('&');
		goto(`/planner/plan${qs ? `?${qs}` : ''}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	/**
	 * Occurrences skipped on the day the grid is showing them.
	 *
	 * Split by reason: a skip stays visible and greyed so it can be put back, a
	 * move is hidden because its replacement is already on screen and showing
	 * both makes one block look like two.
	 */
	const suppressionsHere = $derived(
		data.suppressions.filter((sup: { slotId: number; date: string }) => {
			const slot = data.slots.find((s: Slot) => s.id === sup.slotId);
			if (!slot) return false;
			return formatLocalDate(weekdayToDate(data.range.from, slot.weekday)) === sup.date;
		})
	);

	const suppressedSlotIds = $derived(
		new Set<number>(
			suppressionsHere
				.filter((sup: { movedToId: number | null }) => sup.movedToId === null)
				.map((sup: { slotId: number }) => sup.slotId)
		)
	);

	/** Moved away from this day — drawn at its new time instead. */
	const movedSlotIds = $derived(
		new Set<number>(
			suppressionsHere
				.filter((sup: { movedToId: number | null }) => sup.movedToId !== null)
				.map((sup: { slotId: number }) => sup.slotId)
		)
	);

	/**
	 * A weekly block means "every week", so a month needs it on each week shown.
	 * The dates come from the server's own window, which is what the calendar is
	 * rendering — anything computed separately can drift by a row.
	 */
	const gridEvents = $derived([
		...buildSlotEventsForDates(
			data.slots.filter((s: Slot) => !movedSlotIds.has(s.id)),
			effectiveView === 'month'
				? data.range.days.map((d: { date: string }) => d.date)
				: [data.range.from],
			data.categories,
			{ suppressedSlotIds }
		),
		...buildExceptionalEvents(data.exceptionals, data.categories),
		// Somebody else's meetings, drawn where they get in the way and immovable
		// because they are not ours to move.
		...buildSubscribedEvents(data.subscribed)
	]);

	/**
	 * The month a six-week window belongs to.
	 *
	 * The window starts on the Monday on or before the first, so its own first
	 * date can be in the previous month — handing that to the calendar renders
	 * the wrong month. Three weeks in is always the right one.
	 */
	const monthAnchor = $derived(addDaysStr(data.range.from, 21));

	const gridOptions = $derived({
		...baseGridOptions(effectiveView === 'month' ? monthAnchor : gridFrom, {
			minTime: gridMinTime,
			maxTime: gridMaxTime,
			slotHeight,
			days: gridDays,
			month: effectiveView === 'month'
		}),
		events: gridEvents,
		editable: true,
		selectable: true,
		eventClick: handleEventClick,
		eventDrop: handleEventDrop,
		eventResize: handleEventResize,
		select: handleGridSelect,
		eventDidMount: stampEventId,
		eventMouseEnter: showHover,
		eventMouseLeave: () => (hovered = null),
		eventDragStart: () => (hovered = null),
		eventResizeStart: () => (hovered = null)
	});

	function handleEventClick(info: { event: { id: string | number; start: Date } }) {
		const decoded = decodeEventId(info.event.id);
		if (!decoded) return;
		if (decoded.kind === 'slot') {
			const slot = findSlot(decoded.refId);
			if (!slot) return;
			// The occurrence that was clicked is what "skip this day" acts on.
			selectOffsetForDate(formatLocalDate(info.event.start));
			startEdit(slot);
		} else {
			const exc = findExceptional(decoded.refId);
			if (exc) startEditExceptional(exc);
		}
	}

	function handleGridSelect(info: {
		start: Date;
		end: Date;
		jsEvent?: Calendar.DomEvent | Modifiers;
	}) {
		// A shift-drag is a selection rectangle, not "create a block here".
		// The calendar starts its own drag from a pointer event this code cannot
		// always intercept first, so the intent is re-checked at the end.
		if (modifiers(info.jsEvent).shiftKey || marqueeJustFinished) return;

		const placement = placementFromDates(info.start, info.end);
		selectOffsetForDate(formatLocalDate(info.start));
		prefillTime = placement.startTime;
		prefillDuration = placement.durationMinutes;
		startNew(repeat);
		tick().then(() => createFormEl?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
	}

	/** Fields that identify what a block *is*, as opposed to where it sits. */
	function setIdentityFields(body: FormData, source: Slot | Exceptional) {
		body.set('mode', source.mode);
		if (source.categoryId != null) body.set('categoryId', String(source.categoryId));
		if (source.activityId != null) body.set('activityId', String(source.activityId));
		body.set('label', source.label ?? '');
	}

	async function postGridAction(
		action: string,
		body: FormData,
		fallbackMessage: string
	): Promise<Record<string, unknown> | null> {
		try {
			const res = await fetch(`${location.pathname}?/${action}`, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
			const result = deserialize(await res.text());
			if (result.type === 'failure' || result.type === 'error') {
				gridError =
					(result.type === 'failure' && (result.data?.message as string)) || fallbackMessage;
				return null;
			}
			gridError = null;
			return result.type === 'success' ? ((result.data as Record<string, unknown>) ?? {}) : {};
		} catch {
			gridError = fallbackMessage;
			return null;
		}
	}

	/**
	 * The keys held down during a drag.
	 *
	 * The calendar types `jsEvent` as any DOM event, and most members of that
	 * union have no modifier keys on them — so they are read through here rather
	 * than off the union, in the one place that has to know it is a mouse event.
	 */
	type Modifiers = { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean };

	const modifiers = (e: Calendar.DomEvent | Modifiers | undefined): Modifiers =>
		(e ?? {}) as Modifiers;

	/**
	 * What a drag or a resize hands back.
	 *
	 * The part of the calendar's info object this page uses, stated rather than
	 * imported whole, because these handlers are also called with objects the
	 * page builds itself when a selection moves.
	 */
	type DragInfo = {
		event: { id: string | number; start: Date; end: Date };
		revert: () => void;
		oldEvent?: { start: Date };
		jsEvent?: Calendar.DomEvent | Modifiers;
	};

	async function handleEventDrop(info: DragInfo) {
		const keys = modifiers(info.jsEvent);
		if (keys.ctrlKey || keys.metaKey) {
			await duplicateBlock(info);
			return;
		}
		// Alt moves this occurrence only, leaving the recurring block where it is.
		if (keys.altKey) {
			await detachOccurrence(info);
			return;
		}

		// Dragging one of a selected set moves the set.
		const draggedId = String(info.event.id);
		if (selectedEventIds.size > 1 && selectedEventIds.has(draggedId)) {
			await moveSelection(info);
			return;
		}

		await handleEventPersist(info);
	}

	/**
	 * Move every selected block by the amount the dragged one moved.
	 *
	 * The delta is taken from the dragged block rather than from the pointer, so
	 * the whole group lands on the same gridlines the calendar already snapped
	 * that one to.
	 */
	async function moveSelection(info: DragInfo) {
		if (!info.oldEvent) {
			await handleEventPersist(info);
			return;
		}

		const deltaMs = info.event.start.getTime() - info.oldEvent.start.getTime();
		// The calendar has already drawn the dragged one where it belongs; the
		// rest arrive from the server, so put it back and let the reload speak.
		info.revert();

		if (deltaMs === 0) return;

		let failed = 0;
		const restores: (() => Promise<void>)[] = [];

		for (const id of selectedEventIds) {
			const decoded = decodeEventId(id);
			if (!decoded) continue;

			const source =
				decoded.kind === 'slot' ? findSlot(decoded.refId) : findExceptional(decoded.refId);
			if (!source) continue;

			// Where this block currently sits, as a real instant, so the delta can
			// carry it across midnight or into another day correctly.
			// A scratch value used to compute one new time and then discarded —
			// nothing reads it reactively.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const currentDate =
				decoded.kind === 'slot'
					? weekdayToDate(data.range.from, (source as Slot).weekday)
					: // eslint-disable-next-line svelte/prefer-svelte-reactivity
						new Date(`${(source as Exceptional).date}T00:00:00`);
			const [hh, mm] = source.startTime.split(':').map(Number);
			currentDate.setHours(hh, mm, 0, 0);

			const moved = new Date(currentDate.getTime() + deltaMs);
			const placement = placementFromDates(
				moved,
				new Date(moved.getTime() + source.durationMinutes * 60_000)
			);

			restores.push(
				restorePlacement(decoded.kind, source, {
					weekday: decoded.kind === 'slot' ? (source as Slot).weekday : undefined,
					date: decoded.kind === 'slot' ? undefined : (source as Exceptional).date,
					startTime: source.startTime,
					durationMinutes: source.durationMinutes
				})
			);

			const body = new FormData();
			body.set('id', String(source.id));
			body.set('startTime', placement.startTime);
			body.set('durationMinutes', String(source.durationMinutes));
			setIdentityFields(body, source);
			if (decoded.kind === 'slot') body.set('weekday', String(placement.weekday));
			else body.set('date', formatLocalDate(moved));

			const result = await postGridAction(
				decoded.kind === 'slot' ? 'update' : 'updateExceptional',
				body,
				'Failed to move the selection.'
			);
			if (!result) failed++;
		}

		// One entry for the whole group, so Ctrl-Z undoes the gesture rather than
		// one block of it.
		pushUndo({
			label: `move ${restores.length} blocks`,
			run: async () => {
				for (const restore of restores) await restore();
			}
		});

		if (failed > 0) gridError = `${failed} block(s) could not be moved.`;
		// The selection survives the move: nudging a group into place usually
		// takes more than one drag, and reselecting between each is the tedious
		// part of doing it by hand.
		await invalidateAll();
	}

	async function handleEventResize(info: DragInfo) {
		// Alt retimes this occurrence only, leaving the recurring block's own
		// hours alone — the same bargain alt-drag makes, for the other edge.
		if (modifiers(info.jsEvent).altKey) {
			await detachOccurrence(info);
			return;
		}

		await handleEventPersist(info);
	}

	/**
	 * Give a single occurrence of a recurring block its own time.
	 *
	 * The block keeps its schedule; this week's instance of it moves or changes
	 * length. The server models that as a skip on the original date plus a
	 * one-off at the new time, so the grid shows exactly one of them and both
	 * halves stay undoable. Drag and resize differ only in which edge moved,
	 * and both arrive here as a start and an end.
	 *
	 * A one-off has no recurrence to diverge from, so alt on one is just an edit.
	 */
	async function detachOccurrence(info: DragInfo) {
		const decoded = decodeEventId(info.event.id);
		if (!decoded) {
			info.revert();
			return;
		}

		if (decoded.kind !== 'slot') {
			await handleEventPersist(info);
			return;
		}

		const slot = findSlot(decoded.refId);
		if (!slot) {
			info.revert();
			return;
		}

		const placement = placementFromDates(info.event.start, info.event.end);
		const toDate = formatLocalDate(info.event.start);

		// Where the occurrence was before the drag. Taken from the event rather
		// than derived from the slot's weekday: with non-weekly recurrence a
		// block can appear on several dates in the window, and only the calendar
		// knows which one was picked up.
		const fromDate = info.oldEvent
			? formatLocalDate(info.oldEvent.start)
			: formatLocalDate(weekdayToDate(data.range.from, slot.weekday));

		// The original disappears and a one-off appears; both arrive from the
		// server rather than being guessed at here.
		info.revert();

		const body = new FormData();
		body.set('slotId', String(slot.id));
		body.set('fromDate', fromDate);
		body.set('date', toDate);
		body.set('startTime', placement.startTime);
		body.set('durationMinutes', String(placement.durationMinutes));

		const result = await postGridAction('moveOccurrence', body, 'Failed to move this occurrence.');
		if (!result) return;

		await invalidateAll();
	}

	async function duplicateBlock(info: DragInfo) {
		const decoded = decodeEventId(info.event.id);
		const placement = placementFromDates(info.event.start, info.event.end);
		const date = formatLocalDate(info.event.start);
		// The dragged copy is only a gesture; the original stays put and the new
		// block arrives from the server.
		info.revert();
		if (!decoded) return;

		const source =
			decoded.kind === 'slot' ? findSlot(decoded.refId) : findExceptional(decoded.refId);
		if (!source) return;

		const body = new FormData();
		body.set('startTime', placement.startTime);
		body.set('durationMinutes', String(placement.durationMinutes));
		setIdentityFields(body, source);
		if (decoded.kind === 'slot') body.set('weekday', String(placement.weekday));
		else body.set('date', date);

		const data_ = await postGridAction(
			decoded.kind === 'slot' ? 'create' : 'createExceptional',
			body,
			'Failed to duplicate block.'
		);
		if (!data_) return;

		const newId = data_.id as number | undefined;
		if (newId == null) return;

		if (decoded.kind === 'slot') {
			const copy: Slot = {
				...(source as Slot),
				id: newId,
				weekday: placement.weekday,
				startTime: placement.startTime,
				durationMinutes: placement.durationMinutes
			};
			const [event] = buildSlotEvents([copy], data.range.from, data.categories, {
				suppressedSlotIds
			});
			calendar?.addEvent(event);
			data.slots.push(copy);
		} else {
			const copy: Exceptional = {
				...(source as Exceptional),
				id: newId,
				date,
				startTime: placement.startTime,
				durationMinutes: placement.durationMinutes
			};
			const [event] = buildExceptionalEvents([copy], data.categories);
			calendar?.addEvent(event);
			data.exceptionals.push(copy);
		}
	}

	async function handleEventPersist(info: DragInfo) {
		const decoded = decodeEventId(info.event.id);
		if (!decoded) {
			info.revert();
			return;
		}
		const source =
			decoded.kind === 'slot' ? findSlot(decoded.refId) : findExceptional(decoded.refId);
		if (!source) {
			info.revert();
			return;
		}

		const placement = placementFromDates(info.event.start, info.event.end);
		const date = formatLocalDate(info.event.start);

		// Captured before the write, while `source` still says where it was.
		pushUndo({
			label: 'move',
			run: restorePlacement(decoded.kind, source, {
				weekday: decoded.kind === 'slot' ? (source as Slot).weekday : undefined,
				date: decoded.kind === 'slot' ? undefined : (source as Exceptional).date,
				startTime: source.startTime,
				durationMinutes: source.durationMinutes
			})
		});

		const body = new FormData();
		body.set('id', String(source.id));
		body.set('startTime', placement.startTime);
		body.set('durationMinutes', String(placement.durationMinutes));
		setIdentityFields(body, source);
		if (decoded.kind === 'slot') body.set('weekday', String(placement.weekday));
		else body.set('date', date);

		// No `meta` fields go out with a move, so the server leaves the block's
		// options alone -- see metaPatchFromFormData.
		const result = await postGridAction(
			decoded.kind === 'slot' ? 'update' : 'updateExceptional',
			body,
			'Failed to move block.'
		);
		if (!result) {
			info.revert();
			return;
		}

		source.startTime = placement.startTime;
		source.durationMinutes = placement.durationMinutes;
		if (decoded.kind === 'slot') (source as Slot).weekday = placement.weekday;
		else (source as Exceptional).date = date;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	{#if showWelcome}
		<!-- Shown once, on the way in from first run: the grid's two gestures are
		     not discoverable by looking at it. -->
		<div
			class="rise flex items-start justify-between gap-4 border border-gray-200 bg-white p-4 shadow-card"
		>
			<div>
				<h2 class="text-sm font-semibold text-gray-900">This is your week</h2>
				<ul class="mt-2 space-y-1 text-sm text-gray-600">
					<li>Drag across an empty stretch of a day to make a block.</li>
					<li>
						Press <kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">?</kbd> for everything
						the keyboard can do.
					</li>
				</ul>
			</div>
			<button type="button" class="btn btn-sm" onclick={() => (showWelcome = false)}>Got it</button>
		</div>
	{/if}

	<!--
		Three groups of full-size buttons is three stacked rows on a phone, which
		spent two hundred pixels before the grid began. The buttons are compact
		below `sm` so where-you-are and what-shape-you-want share one line, and
		the two ways to add a block share the next with the date.
	-->
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-1 sm:gap-2">
			<button
				onclick={goToPrevWeek}
				disabled={!data.range.prev}
				class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 sm:text-sm"
				title={data.range.prev ? 'Back 7 days ([)' : 'Already starting today'}>&larr;</button
			>
			<button
				onclick={goToToday}
				disabled={data.range.isCurrent}
				class="border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed sm:px-3 sm:text-sm"
				class:border-gray-900={data.range.isCurrent}
				class:text-gray-900={data.range.isCurrent}
			>
				Today
			</button>
			<button
				onclick={goToNextWeek}
				class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50 sm:text-sm"
				title="Forward 7 days (])">&rarr;</button
			>
		</div>
		<!-- The span you are looking at, in the middle, where the eye already is. -->
		<div class="flex">
			{#each [['day', 'Day'], ['week', 'Week'], ['month', 'Month']] as [mode, label] (mode)}
				<button
					onclick={() => setView(mode as PlanView)}
					class="px-2 py-1 text-xs sm:px-3 sm:text-sm {effectiveView === mode
						? 'bg-gray-900 font-medium text-white hover:bg-gray-800'
						: 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50'}"
					title="{label} view (g cycles)">{label}</button
				>
			{/each}
		</div>

		<!-- On a phone this shares its line with the date; on a wide screen the
		     date has the middle to itself, as before. -->
		<div class="flex flex-1 items-center justify-between gap-2 sm:flex-none sm:justify-end">
			<span class="text-xs text-gray-500 sm:hidden">
				{#if effectiveView === 'month'}
					{monthLabel(data.range.from)}
				{:else}
					{formatWeekDate(data.range.from)} &mdash; {formatWeekDate(data.range.last)}
				{/if}
			</span>
			<div class="flex gap-2">
				<button
					onclick={() => (showForm && repeat === 'once' ? closeForm() : startNew('once'))}
					class="border border-blue-200 bg-white px-2 py-1 text-xs text-blue-600 shadow-sm transition hover:bg-blue-50 sm:text-sm"
					title="One-off block (N)"
				>
					{showForm && repeat === 'once' ? 'Cancel' : '+ One-off'}
				</button>
				<button
					onclick={() => (showForm && repeat === 'weekly' ? closeForm() : startNew('weekly'))}
					class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-50 sm:text-sm"
					title="Weekly block (n)"
				>
					{showForm && repeat === 'weekly' ? 'Cancel' : '+ Weekly'}
				</button>
			</div>
		</div>
	</div>

	<div class="hidden text-center text-sm text-gray-500 sm:block">
		{#if effectiveView === 'month'}
			{monthLabel(data.range.from)}
		{:else}
			{formatWeekDate(data.range.from)} &mdash; {formatWeekDate(data.range.last)}
			{#if data.range.isCurrent}
				<span class="text-gray-500">
					· {effectiveView === 'day' ? 'today' : 'next 7 days'}
				</span>
			{/if}
		{/if}
	</div>

	<FormError message={form?.message} />

	{#if gridError}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{gridError}
		</div>
	{/if}

	<div class="border border-gray-200 bg-white shadow-card">
		<button
			type="button"
			onclick={() => {
				schemesExpanded = !schemesExpanded;
				if (!schemesExpanded) {
					confirmingLoadSchemeId = null;
					confirmingDeleteSchemeId = null;
					confirmingClearAll = false;
				}
			}}
			class="eyebrow flex w-full items-center justify-between px-4 py-3 text-left text-gray-500 hover:bg-gray-50"
		>
			<span>Schemes</span>
			<span class="text-xs text-gray-500">{schemesExpanded ? 'Hide' : 'Show'}</span>
		</button>

		{#if schemesExpanded}
			<div class="space-y-4 border-t border-gray-200 px-4 py-4">
				<form
					method="post"
					action="?/saveScheme"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update();
							if (result.type === 'success') {
								newSchemeName = '';
							}
						};
					}}
					class="space-y-2"
				>
					<div class="text-sm font-medium text-gray-900">Save current plan as scheme</div>
					<div class="flex gap-2">
						<input
							name="name"
							type="text"
							autocomplete="off"
							bind:value={newSchemeName}
							placeholder="Scheme name"
							required
							use:autofocus
							class="flex-1 border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
						<button type="submit" class="btn btn-primary"> Save </button>
					</div>
				</form>

				<div class="border border-gray-200 bg-white shadow-card">
					<div class="eyebrow border-b border-gray-200 px-4 py-2.5 text-gray-500">
						Saved schemes
					</div>
					{#if data.schemes.length === 0}
						<div class="px-3">
							<EmptyState icon="calendar" title="No schemes saved yet" compact />
						</div>
					{:else}
						<div class="divide-y divide-gray-200">
							{#each data.schemes as scheme (scheme.id)}
								<div class="flex items-center gap-4 px-4 py-3">
									<form method="post" action="?/renameScheme" use:enhance class="min-w-0 flex-1">
										<input type="hidden" name="schemeId" value={scheme.id} />
										<div class="flex gap-2">
											<input
												name="name"
												type="text"
												autocomplete="off"
												value={scheme.name}
												required
												class="w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											/>
											<button type="submit" class="btn"> Rename </button>
										</div>
									</form>
									<div class="flex shrink-0 items-center gap-2">
										<form
											method="post"
											action="?/loadScheme"
											use:enhance={() => {
												return async ({ update }) => {
													await update();
													confirmingLoadSchemeId = null;
												};
											}}
										>
											<input type="hidden" name="schemeId" value={scheme.id} />
											{#if confirmingLoadSchemeId === scheme.id}
												<button
													type="submit"
													class="btn border-blue-200 text-blue-600 hover:bg-blue-50"
												>
													This will replace your current plan. Continue?
												</button>
											{:else}
												<button
													type="button"
													onclick={() => {
														confirmingLoadSchemeId = scheme.id;
														confirmingDeleteSchemeId = null;
														confirmingClearAll = false;
													}}
													class="btn"
												>
													Load
												</button>
											{/if}
										</form>

										{#if confirmingDeleteSchemeId === scheme.id}
											<div class="flex items-center gap-2">
												<form
													method="post"
													action="?/deleteScheme"
													use:enhance={() => {
														return async ({ update }) => {
															await update();
															confirmingDeleteSchemeId = null;
														};
													}}
												>
													<input type="hidden" name="schemeId" value={scheme.id} />
													<button
														type="submit"
														class="border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-100"
														use:armed
													>
														Confirm?
													</button>
												</form>
												<button
													type="button"
													onclick={() => (confirmingDeleteSchemeId = null)}
													class="btn"
												>
													Cancel
												</button>
											</div>
										{:else}
											<button
												title="Delete"
												aria-label="Delete"
												type="button"
												onclick={() => {
													confirmingDeleteSchemeId = scheme.id;
													confirmingLoadSchemeId = null;
													confirmingClearAll = false;
												}}
												class="btn btn-danger"
											>
												<Icon name="trash" />
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!--
					Calendars somebody else controls.

					Read-only and one-way on purpose: an `.ics` address needs no OAuth
					and stores no token that could be stolen, and it is the one thing
					Google, Outlook, Fastmail and Nextcloud all agree on. In Google
					Calendar it is Settings → your calendar → "Secret address in iCal
					format".
				-->
				<div class="border border-gray-200 bg-white shadow-card">
					<div class="eyebrow border-b border-gray-200 px-4 py-2.5 text-gray-500">
						Calendars you subscribe to
					</div>

					{#if data.feeds.length === 0}
						<div class="px-3">
							<EmptyState icon="calendar" title="No calendars subscribed yet" compact />
						</div>
					{:else}
						<ul class="divide-y divide-gray-200">
							{#each data.feeds as feed (feed.id)}
								<li class="flex flex-wrap items-center gap-3 px-4 py-3">
									<span class="h-3 w-1 shrink-0 rounded-full" style="background-color: {feed.color}"
									></span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm text-gray-900">{feed.name}</p>
										{#if feed.lastError}
											<p class="truncate text-xs text-amber-700">
												Last fetch failed: {feed.lastError}
											</p>
										{:else if feed.fetchedAt}
											<p class="text-xs text-gray-500">
												Read {feed.fetchedAt.slice(0, 16).replace('T', ' ')}
											</p>
										{/if}
									</div>
									<form method="post" action="?/removeCalendar" use:enhance class="shrink-0">
										<input type="hidden" name="id" value={feed.id} />
										<button
											class="btn btn-danger btn-sm"
											title="Stop subscribing"
											aria-label="Stop subscribing to {feed.name}"
											use:armed
										>
											<Icon name="trash" size={14} />
										</button>
									</form>
								</li>
							{/each}
						</ul>
					{/if}

					<form
						method="post"
						action="?/addCalendar"
						use:enhance
						class="border-t border-gray-200 p-4"
					>
						<div class="flex flex-wrap gap-2">
							<input
								name="name"
								placeholder="Work"
								autocomplete="off"
								required
								class="input w-32"
								aria-label="What to call it"
							/>
							<input
								name="url"
								type="url"
								placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
								required
								class="input min-w-0 flex-1"
								aria-label="The calendar's iCal address"
							/>
							<input
								name="color"
								type="color"
								value="#6b7280"
								class="h-10 w-12 border border-gray-300"
								aria-label="Colour"
							/>
							<button class="btn btn-primary" title="Subscribe" aria-label="Subscribe">
								<Icon name="plus" />
							</button>
						</div>
						<p class="mt-2 text-xs text-gray-500">
							In Google Calendar: Settings → the calendar → “Secret address in iCal format”.
							Read-only — nothing here is ever written back.
						</p>
					</form>
				</div>

				<!--
					The starter weeks, still available.

					These were offered once during onboarding and then never again, so
					anybody who skipped that step — or whose life changed in March — had
					no way back to them. Same three weeks, same application, behind the
					same confirmation as loading a scheme, because it replaces the plan.
				-->
				<div class="border border-gray-200 bg-white shadow-card">
					<div class="eyebrow border-b border-gray-200 px-4 py-2.5 text-gray-500">
						Start from a template
					</div>
					<div class="divide-y divide-gray-200">
						{#each data.templates as template (template.key)}
							<div class="flex items-center gap-4 px-4 py-3">
								<div class="min-w-0 flex-1">
									<p class="text-sm font-medium text-gray-900">{template.label}</p>
									<p class="text-xs text-gray-500">{template.description}</p>
								</div>
								<form
									method="post"
									action="?/applyTemplate"
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											confirmingTemplate = null;
										};
									}}
									class="shrink-0"
								>
									<input type="hidden" name="key" value={template.key} />
									{#if confirmingTemplate === template.key}
										<button type="submit" class="btn btn-danger" use:armed>
											This replaces your plan. Continue?
										</button>
									{:else}
										<button
											type="button"
											onclick={() => {
												confirmingTemplate = template.key;
												confirmingLoadSchemeId = null;
												confirmingDeleteSchemeId = null;
												confirmingClearAll = false;
											}}
											class="btn"
										>
											Use
										</button>
									{/if}
								</form>
							</div>
						{/each}
					</div>
				</div>

				<div class="border-t border-gray-200 pt-4">
					{#if confirmingClearAll}
						<div class="flex items-center gap-3">
							<span class="text-sm text-red-600">Delete every block?</span>
							<form
								method="post"
								action="?/clearAll"
								use:enhance={() => {
									return async ({ update }) => {
										await update();
										confirmingClearAll = false;
									};
								}}
							>
								<button
									type="submit"
									class="border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-100"
								>
									Yes, clear all
								</button>
							</form>
							<button type="button" onclick={() => (confirmingClearAll = false)} class="btn">
								Cancel
							</button>
						</div>
					{:else}
						<button
							type="button"
							onclick={() => {
								confirmingClearAll = true;
								confirmingLoadSchemeId = null;
								confirmingDeleteSchemeId = null;
							}}
							class="btn btn-danger"
						>
							Clear all slots
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	{#if showCopyPanel}
		<div class="border border-gray-200 bg-white p-4 shadow-sm">
			<h3 class="mb-3 text-sm font-medium text-gray-900">Copy to days</h3>
			<form
				method="post"
				action="?/copyToWeekdays"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						showCopyPanel = false;
						multiselect = false;
						selectedIds = new Set();
					};
				}}
			>
				<input type="hidden" name="ids" value={[...selectedIds].join(',')} />
				<input type="hidden" name="targetDays" value={[...copyTargetDays].join(',')} />
				<div class="mb-3 flex flex-wrap gap-2">
					{#each data.weekdays as day, i (i)}
						<label
							class="flex items-center gap-1.5 px-2 py-1 text-sm {selectedWeekday === i
								? 'cursor-not-allowed text-gray-500'
								: 'cursor-pointer text-gray-700 hover:bg-gray-50'}"
						>
							<input
								type="checkbox"
								checked={copyTargetDays.has(i)}
								disabled={selectedWeekday === i}
								onchange={() => {
									if (copyTargetDays.has(i)) {
										copyTargetDays = new Set([...copyTargetDays].filter((x) => x !== i));
									} else {
										copyTargetDays = new Set([...copyTargetDays, i]);
									}
								}}
								class="sr-only"
							/>
							<span
								class="inline-block h-4 w-4 border border-gray-400 {copyTargetDays.has(i)
									? 'bg-gray-900'
									: 'bg-white'}"
							></span>
							{day}
						</label>
					{/each}
				</div>
				<div class="flex gap-2">
					<button
						type="submit"
						class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
						disabled={copyTargetDays.size === 0}
					>
						Copy
					</button>
					<button
						type="button"
						onclick={() => (showCopyPanel = false)}
						class="border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
					>
						Cancel
					</button>
				</div>
			</form>
		</div>
	{/if}

	{#if multiselect && selectedIds.size > 0}
		<div class="fixed right-0 bottom-0 left-0 z-50 border-t border-blue-200 bg-blue-50 px-4 py-2">
			<div class="mx-auto flex w-full max-w-page items-center justify-between">
				<span class="text-sm font-medium text-blue-900">{selectedIds.size} selected</span>
				<div class="flex gap-2">
					<form
						id="bulk-delete-form"
						method="post"
						action="?/bulkDelete"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								confirmingBulkDelete = false;
								multiselect = false;
								selectedIds = new Set();
							};
						}}
					>
						<input type="hidden" name="ids" value={[...selectedIds].join(',')} />
						{#if confirmingBulkDelete}
							<button
								type="submit"
								class="border border-red-300 bg-red-50 px-3 py-1 text-sm font-medium text-red-700 transition hover:bg-red-100"
							>
								Confirm delete?
							</button>
						{:else}
							<button
								type="button"
								onclick={() => {
									confirmingBulkDelete = true;
								}}
								class="border border-red-200 bg-white px-3 py-1 text-sm text-red-600 transition hover:bg-red-50"
							>
								Delete selected
							</button>
						{/if}
					</form>
					<button
						onclick={() => (showCopyPanel = true)}
						class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-50"
					>
						Copy to...
					</button>
				</div>
			</div>
		</div>
	{/if}

	<Modal
		bind:open={showForm}
		error={form?.message}
		onclose={closeForm}
		size="lg"
		title={editingBlockId !== null ? 'Edit block' : 'New block'}
		description={repeat === 'once' ? 'Happens once, on one day.' : 'Repeats every week.'}
	>
		<div bind:this={createFormEl} class="space-y-3">
			<form
				id="block-form"
				method="post"
				action={formAction}
				use:enhance={() => {
					return async ({ result, update }) => {
						await update();
						if (result.type === 'success') closeForm();
					};
				}}
				class="space-y-3"
			>
				{#if editingBlockId !== null}
					<input type="hidden" name="id" value={editingBlockId} />
				{/if}

				<div class="flex items-center gap-3">
					<span class="text-sm font-medium text-gray-700">Repeats</span>
					{#if editingKind}
						<span class="text-sm text-gray-500">
							{editingKind === 'slot' ? 'Every week' : 'Once only'}
						</span>
						<!-- The two differ only in which day they name, so changing your
						     mind should not mean deleting one and retyping the other. -->
						<button
							type="button"
							onclick={convertRepeat}
							class="border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm hover:bg-gray-50"
							title={editingKind === 'slot'
								? 'Keep only this occurrence and stop repeating'
								: 'Repeat this every week from now on'}
						>
							{editingKind === 'slot' ? 'Make it once only' : 'Make it weekly'}
						</button>
					{:else}
						<div class="flex">
							{#each [{ value: 'weekly', label: 'Every week' }, { value: 'once', label: 'Once only' }] as choice (choice.value)}
								<button
									type="button"
									onclick={() => (repeat = choice.value as 'weekly' | 'once')}
									class="px-3 py-1 text-sm {repeat === choice.value
										? 'bg-gray-900 font-medium text-white'
										: 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50'}"
								>
									{choice.label}
								</button>
							{/each}
						</div>
						{#if repeat === 'once'}
							<span class="text-xs text-gray-500">Won't come back next week.</span>
						{/if}
					{/if}
				</div>

				<!-- Recurrent but not weekly: the bins are fortnightly, rent is the
				     first of the month, a stretch routine is every third day. -->
				{#if repeat === 'weekly'}
					<div class="flex flex-wrap items-center gap-3 border border-gray-200 bg-gray-50 p-3">
						<span class="eyebrow shrink-0 text-gray-500">How often</span>
						<input type="hidden" name="recurrenceKind" value={recurrenceKind} />
						<input type="hidden" name="recurrenceAnchor" value={selectedDateStr()} />

						<div class="flex">
							{#each [{ v: 'weekly', l: 'Every week' }, { v: 'weeks', l: 'Every N weeks' }, { v: 'days', l: 'Every N days' }, { v: 'monthly', l: 'Monthly' }] as opt (opt.v)}
								<button
									type="button"
									onclick={() => (recurrenceKind = opt.v as typeof recurrenceKind)}
									class="px-3 py-1 text-sm {recurrenceKind === opt.v
										? 'bg-gray-900 font-medium text-white'
										: 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50'}"
								>
									{opt.l}
								</button>
							{/each}
						</div>

						{#if recurrenceKind === 'weeks' || recurrenceKind === 'days'}
							<label class="flex items-center gap-2 text-sm text-gray-700">
								Every
								<input
									name="recurrenceInterval"
									type="number"
									min="1"
									max={MAX_INTERVAL}
									bind:value={recurrenceInterval}
									class="tabular w-16 border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								/>
								{recurrenceKind === 'weeks' ? 'weeks' : 'days'}
							</label>
							<span class="text-xs text-gray-500">counting from {selectedDateStr()}</span>
						{:else if recurrenceKind === 'monthly'}
							<label class="flex items-center gap-2 text-sm text-gray-700">
								Day
								<input
									name="recurrenceMonthDay"
									type="number"
									min="1"
									max="31"
									bind:value={recurrenceMonthDay}
									class="tabular w-16 border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
								/>
								of each month
							</label>
							{#if recurrenceMonthDay > 28}
								<span class="text-xs text-gray-500">
									Falls on the last day in shorter months.
								</span>
							{/if}
						{/if}
					</div>
				{/if}

				<div class="flex gap-3">
					{#if repeat === 'weekly'}
						<label class="w-36">
							<span class="text-sm font-medium text-gray-700">Day</span>
							<select
								name="weekday"
								required
								bind:value={formWeekday}
								class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
							>
								{#each data.weekdays as day, i (i)}
									<option value={i}>{day}</option>
								{/each}
							</select>
						</label>
					{:else}
						<label class="w-40">
							<span class="text-sm font-medium text-gray-700">Date</span>
							<input
								name="date"
								type="date"
								required
								min={data.today}
								bind:value={formDate}
								class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
							/>
						</label>
					{/if}
					<label class="w-28">
						<span class="text-sm font-medium text-gray-700">Time</span>
						<input
							bind:this={timeInput}
							name="startTime"
							type="time"
							required
							value={editingBlock?.startTime ?? prefillTime}
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
					</label>
					<label class="w-24">
						<span class="text-sm font-medium text-gray-700">Duration</span>
						<input
							name="durationMinutes"
							type="number"
							min="15"
							step="15"
							value={editingBlock?.durationMinutes ?? prefillDuration}
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
					</label>
				</div>

				<div class="flex gap-3">
					<label class="w-36">
						<span class="text-sm font-medium text-gray-700">Mode</span>
						<select
							name="mode"
							required
							bind:value={slotMode}
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						>
							<option value="activity">Activity</option>
							<option value="category">Category</option>
						</select>
					</label>
					{#if slotMode === 'category'}
						<label class="flex-1">
							<span class="text-sm font-medium text-gray-700">Category</span>
							<select
								name="categoryId"
								required
								class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
							>
								{#each data.categories as cat (cat.id)}
									<option value={cat.id} selected={editingBlock?.categoryId === cat.id}
										>{cat.name}</option
									>
								{/each}
							</select>
						</label>
					{:else}
						<label class="flex-1">
							<span class="text-sm font-medium text-gray-700">Activity</span>
							<select
								name="activityId"
								required
								bind:value={activityChoice}
								class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
							>
								{#each data.activities as act (act.id)}
									<option value={String(act.id)}>{act.name}</option>
								{/each}
								<option value={NEW_ACTIVITY}>+ New activity...</option>
							</select>
						</label>
					{/if}
					<label class="flex-1">
						<span class="text-sm font-medium text-gray-700">
							Label {slotMode === 'category' ? '' : '(optional)'}
						</span>
						<input
							name="label"
							type="text"
							autocomplete="off"
							placeholder={slotMode === 'category' ? 'e.g. dentist' : ''}
							value={editingBlock?.label ?? ''}
							class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
						/>
					</label>
				</div>

				{#if slotMode === 'activity' && activityChoice === NEW_ACTIVITY}
					<div class="flex gap-3 border border-gray-200 bg-gray-50 p-3">
						<label class="flex-1">
							<span class="text-sm font-medium text-gray-700">New activity name</span>
							<input
								name="newActivityName"
								type="text"
								required
								autocomplete="off"
								use:autofocus
								placeholder="e.g. learn russian"
								class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
							/>
						</label>
						<label class="w-44">
							<span class="text-sm font-medium text-gray-700">Its category</span>
							<select
								name="newActivityCategoryId"
								required
								class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
							>
								{#each data.categories as cat (cat.id)}
									<option value={cat.id}>{cat.name}</option>
								{/each}
							</select>
						</label>
					</div>
				{/if}

				<MoreOptions label="Urgency, interest, energy" count={ratingsSet}>
					{#each RATINGS as r (r)}
						<div class="col-span-12 sm:col-span-4">
							<RatingPicker rating={r} bind:value={formRatings[r]} />
						</div>
					{/each}
				</MoreOptions>

				<MetaEditor initial={parseSlotMeta(editingBlock?.meta)} plugins={data.plugins} />
			</form>

			<!-- Skip and delete belong to a block that already exists; a new one has
			     nothing to show here. -->
			{#if editingKind}
				<div class="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
					{#if editingKind === 'slot' && editingBlockId !== null}
						<!-- Skipping and deleting are different intentions on a recurring block:
					     one drops a single occurrence, the other stops it happening at all.
					     The skip is reversible from the same spot, so a misclick costs nothing. -->
						{@const skipped = isSlotSuppressed(editingBlockId)}
						<form
							method="post"
							action={skipped ? '?/unsuppress' : '?/suppress'}
							use:enhance={() =>
								async ({ update }) =>
									update()}
						>
							<input type="hidden" name="slotId" value={editingBlockId} />
							<input type="hidden" name="date" value={selectedDateStr()} />
							<button
								type="submit"
								title={skipped
									? 'Put this occurrence back'
									: 'Drop just this one occurrence; the block still repeats'}
								class="border px-3 py-2 text-sm transition {skipped
									? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
									: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
							>
								{skipped ? 'Restore' : 'Skip'} on {formatWeekDate(selectedDateStr())}
							</button>
						</form>
					{/if}

					{#if editingKind}
						<div class="ml-auto">
							{#if confirmingFormDelete}
								<form
									method="post"
									action={editingKind === 'slot' ? '?/delete' : '?/deleteExceptional'}
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											closeForm();
										};
									}}
								>
									<input type="hidden" name="id" value={editingBlockId} />
									<button
										type="submit"
										class="border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
									>
										{editingKind === 'slot' ? 'Delete every week — confirm?' : 'Delete — confirm?'}
									</button>
								</form>
							{:else}
								<button
									title="Delete"
									aria-label="Delete"
									type="button"
									onclick={() => (confirmingFormDelete = true)}
									class="btn btn-danger btn-sm"
								>
									<Icon name="trash" />
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#snippet footer()}
			<button type="button" class="btn" onclick={closeForm}>Cancel</button>
			<button type="submit" form="block-form" class="btn btn-primary">
				{editingKind ? 'Save block' : repeat === 'once' ? 'Add one-off' : 'Add weekly block'}
			</button>
		{/snippet}
	</Modal>

	<!-- Also shown over the day grid, which needs a way to move between days;
	     the full week grid already shows all seven at once. -->
	{#if effectiveView === 'day'}
		<div class="flex gap-1">
			{#each data.range.days as day, i (day.date)}
				<button
					onclick={() => (selectedOffset = i)}
					class="flex-1 border px-2 py-2 text-center text-xs font-medium transition {selectedOffset ===
					i
						? 'border-gray-900 bg-gray-900 text-white'
						: 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}"
					title={day.date}
				>
					{day.isToday ? 'Today' : day.name.slice(0, 3)}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Undated todos, so one can be dragged straight onto an hour instead of
		     being scheduled on the board and then found here. -->
	{#if data.todos.length > 0}
		<details bind:open={todosOpen} class="mb-2">
			<summary
				class="flex cursor-pointer list-none items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
			>
				<span class="text-xs text-gray-500">{todosOpen ? '▾' : '▸'}</span>
				<span class="eyebrow text-gray-600">Todo</span>
				<span
					class="tabular border border-gray-300 bg-gray-50 px-1 text-xs text-gray-600 text-gray-700"
				>
					{data.todos.length}
				</span>
				{#if !todosOpen}
					<span class="hidden text-xs text-gray-500 sm:inline">
						drag one onto the grid to give it a time
					</span>
					<span class="text-xs text-gray-500 sm:hidden">tap one, then tap a time</span>
				{/if}
			</summary>

			<div class="mt-2 flex flex-wrap items-center gap-2">
				{#each data.todos as todo (todo.id)}
					<button
						type="button"
						draggable="true"
						onclick={() => (placingTodoId = placingTodoId === todo.id ? null : todo.id)}
						ondragstart={(e) => {
							placingTodoId = null;
							dragTodoId = todo.id;
							e.dataTransfer?.setData('text/plain', String(todo.id));
							if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
						}}
						ondragend={() => {
							dragTodoId = null;
							dropPreview = null;
						}}
						class="lift cursor-grab border px-2 py-1 text-xs shadow-card {placingTodoId === todo.id
							? 'border-gray-900 bg-gray-900 text-white'
							: 'border-gray-200 bg-white text-gray-700'} {dragTodoId === todo.id
							? 'opacity-40'
							: ''}"
						title="Drag onto the grid, or tap and then tap a time"
					>
						{#if todo.categoryColor}
							<span
								class="mr-1 inline-block h-2 w-1 align-middle"
								style="background-color: {todo.categoryColor}"
							></span>
						{/if}
						{todo.title}
					</button>
				{/each}
				{#if placingTodo}
					<span class="text-xs text-gray-600">
						now tap a time for “{placingTodo.title}”
					</span>
					<button
						type="button"
						class="text-xs text-gray-500 underline"
						onclick={() => (placingTodoId = null)}>cancel</button
					>
				{:else}
					<span class="hidden text-xs text-gray-500 sm:inline">
						drag onto the grid to give it a time
					</span>
					<span class="text-xs text-gray-500 sm:hidden">tap one, then tap a time</span>
				{/if}
			</div>
		</details>
	{/if}

	<!--
		A month gets more height than the window, on purpose.

		Six rows inside 70vh is about a hundred pixels each, which fits three
		events and then says "+2 more" for the rest of what the day holds — the
		grid ends up describing itself instead of the month. It is taller than the
		viewport and the page scrolls, which is the trade every calendar makes.
	-->
	<div
		class="relative border border-gray-200 bg-white shadow-sm {effectiveView === 'month'
			? 'h-[calc(100dvh-12rem)] min-h-[54rem]'
			: gridDays === 1
				? 'h-[62vh]'
				: 'h-[70vh]'}"
		use:gridZoomWheel
		use:selectionSurface
		ondragover={(e) => {
			if (dragTodoId === null) return;
			e.preventDefault();
			dropPreview = dropTarget(e);
		}}
		ondragleave={() => (dropPreview = null)}
		ondrop={onTodoDrop}
		onpointerdowncapture={onGridPointerDown}
		onpointerupcapture={onGridPointerUp}
		role="application"
	>
		{#if marqueeRect}
			<!-- Drawn over the grid rather than inside it, so it can span
				     columns without the calendar reflowing anything. -->
			<div
				class="pointer-events-none absolute z-30 border-2 border-gray-900 bg-gray-900/10"
				style="left:{marqueeRect.left}px; top:{marqueeRect.top}px; width:{marqueeRect.width}px; height:{marqueeRect.height}px"
			></div>
		{/if}

		{#if undoNotice}
			<div
				class="pointer-events-none absolute top-2 left-2 z-30 border border-gray-900 bg-gray-900 px-2 py-1 text-xs text-white"
			>
				{undoNotice}
			</div>
		{/if}

		{#if selectedEventIds.size > 1}
			<div
				class="pointer-events-none absolute bottom-2 left-2 z-30 border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-card"
			>
				{selectedEventIds.size} selected · drag one to move them · Esc to clear
			</div>
		{/if}

		{#if dropPreview}
			<!-- Says exactly where it will land, since the grid gives no other
				     feedback for a drop it does not itself handle. -->
			<div
				class="tabular pointer-events-none absolute top-2 right-2 z-20 border border-gray-900 bg-gray-900 px-2 py-1 text-xs text-white"
			>
				{dropPreview.date} · {dropPreview.startTime}
			</div>
		{/if}
		{#if browser && widthChecked}
			<Calendar bind:this={ec} plugins={[TimeGrid, DayGrid, Interaction]} options={gridOptions} />
		{/if}
	</div>
	<div class="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
		<!--
			All of this is mouse-and-keyboard advice — drag, Ctrl, scroll — so a
			touch screen has no use for it, and `kbd-hint` is what hides a thing on a
			coarse pointer. It was squeezing the zoom control beside it into a
			one-letter-per-line ribbon on a phone, to say something the phone cannot
			do.
		-->
		<p class="kbd-hint min-w-0 flex-1 text-xs text-gray-500">
			Drag to create · drag a block to move · click it to edit, skip or delete · hold <kbd
				class="border border-gray-300 bg-gray-50 px-1 text-gray-700">Ctrl</kbd
			>
			while dragging to duplicate, or
			<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">Alt</kbd>
			to move or resize just this day's occurrence ·
			<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">Shift</kbd>
			drag to select several, then drag one to move them all ·
			<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">Ctrl</kbd>+<kbd
				class="border border-gray-300 bg-gray-50 px-1 text-gray-700">Z</kbd
			> undoes · snaps to 15min
		</p>
		<div class="flex shrink-0 items-center gap-1">
			<span class="mr-1 text-xs whitespace-nowrap text-gray-500">
				Zoom
				<span class="kbd-hint"
					>(<kbd class="border border-gray-300 bg-gray-50 px-1 text-gray-700">Ctrl</kbd
					>+scroll)</span
				>
			</span>
			<button
				type="button"
				onclick={() => setZoom(zoomIndex - 1)}
				disabled={zoomIndex === 0}
				title="Zoom out (-)"
				aria-label="Zoom out"
				class="border border-gray-300 bg-white px-2 py-0.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
				>&minus;</button
			>
			<button
				type="button"
				onclick={() => setZoom(GRID_DEFAULT_ZOOM_INDEX)}
				title="Reset zoom (0)"
				class="border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
				>{Math.round((slotHeight / GRID_ZOOM_LEVELS[GRID_DEFAULT_ZOOM_INDEX]) * 100)}%</button
			>
			<button
				type="button"
				onclick={() => setZoom(zoomIndex + 1)}
				disabled={zoomIndex === GRID_ZOOM_LEVELS.length - 1}
				title="Zoom in (+)"
				aria-label="Zoom in"
				class="border border-gray-300 bg-white px-2 py-0.5 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
				>+</button
			>
		</div>
	</div>
	{#if hovered}
		<div
			class="pointer-events-none fixed z-50 max-w-[240px] border border-gray-200 bg-white px-3 py-2 shadow-sm"
			style:top="{hovered.top}px"
			style:left="{hovered.left}px"
			style:transform={hovered.flip ? 'translateX(-100%) translateX(-8px)' : 'translateX(8px)'}
		>
			<p class="text-sm font-medium text-gray-900">{hovered.title}</p>
			<p class="mt-0.5 text-xs text-gray-600">
				{hovered.timeText} · {hovered.durationText}
			</p>
			{#if hovered.categoryName}
				<p class="text-xs text-gray-500">{hovered.categoryName}</p>
			{/if}
			{#if hovered.label}
				<p class="text-xs text-gray-500">Label: {hovered.label}</p>
			{/if}
			{#if hovered.state}
				<p class="mt-0.5 text-xs font-medium text-gray-500">{hovered.state}</p>
			{/if}
		</div>
	{/if}

	<div class="mt-6 border border-gray-200 bg-white shadow-sm">
		<button
			type="button"
			onclick={() => (showCsvImport = !showCsvImport)}
			class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
		>
			Import CSV
			<span class="text-xs text-gray-500">{showCsvImport ? '▲' : '▼'}</span>
		</button>
		{#if showCsvImport}
			<form
				method="post"
				action="?/importCsv"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
					};
				}}
				class="space-y-3 border-t border-gray-200 px-4 py-4"
			>
				<p class="text-xs text-gray-500">
					Format: h (time), d (duration in min), then Mon-Sun activity names. Time: 610 = 06:10,
					1810 = 18:10.
				</p>
				<textarea
					name="csv"
					rows="8"
					placeholder={'h,d,m,t,w,t,f,s,s\n610,30,wake up,wake up,wake up,wake up,wake up,,\n630,60,alongar,regar plantas,alongar,regar plantas,alongar,,'}
					class="block w-full border border-gray-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				></textarea>
				<div class="flex items-center gap-4">
					<label class="flex items-center gap-2 text-sm text-gray-700">
						<input type="checkbox" name="clearExisting" class="border-gray-300" />
						Clear existing plan
					</label>
				</div>
				<button
					type="submit"
					class="bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					Import
				</button>
			</form>
		{/if}
	</div>
</div>

<style>
	:global(.og-event--inactive) {
		opacity: 0.5;
	}
	:global(.og-event--exceptional) {
		border-left: 3px solid #3b82f6;
	}
</style>
