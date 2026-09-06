<script lang="ts">
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { armed } from '$lib/actions/armed';
	import { enhance, deserialize } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { SECTION_COLORS } from '$lib/colors';
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
		buildBillEvents,
		placementFromDates,
		decodeEventId,
		weekdayToDate,
		formatLocalDate,
		describeGridEvent,
		eventFitsText,
		GRID_ZOOM_LEVELS,
		GRID_DEFAULT_ZOOM_INDEX,
		GRID_DAYS_DESKTOP,
		GRID_DAYS_MOBILE,
		hourToTime,
		windowForEvents,
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
	/*
	 * Read synchronously where there is a window to read it from, so the first
	 * client render already agrees with the screen. The effect below still runs
	 * — it is what notices a resize — but by then there is nothing to correct.
	 */
	let narrowScreen = $state(
		browser ? window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`).matches : false
	);

	// One effect owns `viewMode`, because two of them assigning it is what makes
	// the calendar mount and unmount in the same frame.
	$effect(() => {
		if (typeof window === 'undefined') return;

		const query = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`);
		const apply = () => {
			narrowScreen = query.matches;
			widthChecked = true;
			/*
			 * Tell the server, for the next request.
			 *
			 * It cannot measure a screen, and without this a phone was served the
			 * week view, painted it, and switched to the day view as soon as the
			 * script ran — the Week button lighting up and going out on every
			 * visit. A year, `Lax`, and no personal information in it: which of
			 * two layouts to draw first.
			 */
			document.cookie = `onto_narrow=${query.matches ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
		};
		apply();
		query.addEventListener('change', apply);
		return () => query.removeEventListener('change', apply);
	});

	/**
	 * What the buttons show while the new view is still loading.
	 *
	 * Separate from `viewMode`, and that separation is the fix: setting the view
	 * optimistically redrew the grid in the new shape against the OLD data — a
	 * day grid holding a week's blocks, or a month holding one day's — for as
	 * long as the navigation took. On a phone that is a visible second of wrong
	 * information every time you change view.
	 *
	 * So the grid changes only when its data does, and the only thing that moves
	 * immediately is the pressed button, which is what makes a tap feel answered.
	 */
	let pendingView: PlanView | null = $state(null);

	$effect(() => {
		viewMode = data.view;
		pendingView = null;
	});

	/** What the grid actually shows, after the screen width has its say. */
	const effectiveView = $derived<PlanView>(
		narrowScreen && viewMode === 'week' && !data.viewExplicit ? 'day' : viewMode
	);

	const gridDays = $derived(effectiveView === 'day' ? GRID_DAYS_MOBILE : GRID_DAYS_DESKTOP);

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

		/*
		 * Zooming keeps the hour you were looking at, not the pixel.
		 *
		 * Every hour gets taller or shorter under the viewport, and left alone the
		 * scroller kept its pixel offset — which after a zoom is a different time,
		 * so examining a busy evening and pressing + threw the view back towards
		 * the morning. What is remembered is therefore a fraction of the day, not
		 * a number of pixels, and the anchor is the middle of the viewport rather
		 * than its top, because that is where somebody is looking.
		 *
		 * Put back by the effect below rather than here: the grid has not been
		 * laid out at the new height yet, and a scrollTop written now is
		 * overwritten by the calendar's own render.
		 */
		const el = scroller();
		zoomAnchor =
			el && el.scrollHeight > 0 ? (el.scrollTop + el.clientHeight / 2) / el.scrollHeight : null;

		zoomIndex = next;
		hovered = null;
		if (browser) localStorage.setItem(ZOOM_STORAGE_KEY, String(next));
	}

	/** Where in the day we were, kept across a zoom. Null when nothing is owed. */
	let zoomAnchor: number | null = null;

	/*
	 * Put the day back where it was, once the grid is the new height.
	 *
	 * Re-applied over a handful of frames on purpose. The calendar re-renders in
	 * stages after a slot height changes and resets its scroller as it goes, so
	 * a single write — even one deferred by a frame — is landed on and lost. Six
	 * frames is a tenth of a second, invisible, and the only version of this that
	 * actually holds.
	 */
	$effect(() => {
		// The dependency: read into a variable, since a bare expression is a value
		// thrown away and the dependency goes with it.
		const height = slotHeight;
		if (zoomAnchor === null || height <= 0) return;

		const wanted = zoomAnchor;
		zoomAnchor = null;
		let frames = 0;
		let frame = requestAnimationFrame(function settle() {
			const el = scroller();
			if (el && el.scrollHeight > 0) {
				const top = wanted * el.scrollHeight - el.clientHeight / 2;
				el.scrollTop = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight));
				keptScroll = el.scrollTop;
			}
			if (frames++ < 6) frame = requestAnimationFrame(settle);
		});

		return () => cancelAnimationFrame(frame);
	});

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
		/*
		 * Never on a touch screen.
		 *
		 * A tap synthesises `mouseenter`, and no `mouseleave` ever follows it —
		 * so the card appeared on the first tap and then sat over the grid for
		 * the rest of the session, including after the editor it opened was
		 * cancelled. It is a hover affordance and a phone does not hover; tapping
		 * a block opens the editor, which says everything this does and more.
		 */
		if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) return;

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
	let confirmingTemplate: string | null = $state(null);
	/*
	 * The subscribed-calendars panel, folded to begin with. It is set up once
	 * and then read never, and the drawer it lives in is opened for the schemes
	 * above it.
	 */
	let calendarsOpen = $state(false);
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
		remindLead = slot.remindLeadMinutes ?? 0;
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
		remindLead = exc.remindLeadMinutes ?? 0;
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
		remindLead = 0;
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
	}): DropSpot | null {
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

		/*
		 * And where that lands on screen, so the drop can be drawn rather than
		 * described.
		 *
		 * A chip in the corner reading "2026-09-02 · 09:30" is a sentence to read
		 * while your hand is holding a drag. The block itself, drawn where it
		 * would go, is the answer to the same question with nothing to read.
		 * Measured against the grid wrapper because that is what the ghost is
		 * positioned inside.
		 */
		let box: DropSpot['box'];
		const wrap = gridWrap?.getBoundingClientRect();
		if (wrap) {
			const column = columns[index].getBoundingClientRect();
			const top = bodyRect.top + ((minutes - minMinutes) / span) * bodyRect.height;
			box = {
				left: column.left - wrap.left,
				width: column.width,
				top: top - wrap.top,
				height: Math.max((NEW_TODO_MINUTES / span) * bodyRect.height, 12)
			};
		}

		return { date, startTime: minutesToTime(minutes), box };
	}

	/** Where a drop would land, and the rectangle it would occupy there. */
	type DropSpot = {
		date: string;
		startTime: string;
		box?: { left: number; top: number; width: number; height: number };
	};

	/** What a todo dropped on the grid is given, in minutes. */
	const NEW_TODO_MINUTES = 30;

	let gridWrap: HTMLElement | undefined = $state();
	let dragTodoId: number | null = $state(null);
	let dropPreview: DropSpot | null = $state(null);
	/** The todo being dragged or placed, so the ghost can carry its name. */
	const dragTodoTitle = $derived(
		data.todos.find((t: { id: number }) => t.id === (dragTodoId ?? placingTodoId))?.title ?? ''
	);

	/**
	 * Dragging a block back off the grid.
	 *
	 * The calendar drags with pointer events rather than HTML5 drag-and-drop, so
	 * the strip cannot be a `dragover` target — nothing would ever fire. What it
	 * gets instead is the coordinates the drag ended at, and whether they land
	 * inside it. `draggingBlock` is only for showing the strip while a drag is in
	 * the air: an affordance nobody can see is one nobody uses.
	 */
	let trayEl: HTMLElement | undefined = $state();
	let draggingBlock = $state(false);
	/** The name of the block in the air, so the strip can show it arriving. */
	let draggingBlockTitle = $state('');
	/** Whether that drag is currently over the strip. */
	let overTrayNow = $state(false);
	/** Set when a drag ended on the strip, so `eventDrop` does not also act. */
	let takenOffGrid = false;

	const dueToday = $derived(
		data.todos.filter((t: { due: string | null }) => t.due === 'today').length
	);

	function overTray(jsEvent: Calendar.DomEvent | undefined): boolean {
		const point = jsEvent as { clientX?: number; clientY?: number } | undefined;
		if (!trayEl || point?.clientX === undefined || point.clientY === undefined) return false;
		const el = document.elementFromPoint(point.clientX, point.clientY);
		return el !== null && trayEl.contains(el);
	}

	/*
	 * Whether the drag is over the strip, while it is still in the air.
	 *
	 * The calendar drags with pointer events and reports only start and stop, so
	 * "it will land here" has to be watched for. Attached only while a block is
	 * being dragged, and detached the moment it is dropped.
	 */
	let trayWatcher: ((e: PointerEvent) => void) | null = null;

	function watchTray() {
		stopWatchingTray();
		trayWatcher = (e: PointerEvent) => (overTrayNow = overTray(e));
		window.addEventListener('pointermove', trayWatcher);
	}

	function stopWatchingTray() {
		if (trayWatcher) window.removeEventListener('pointermove', trayWatcher);
		trayWatcher = null;
	}

	async function unscheduleBlock(slotId: number) {
		const body = new FormData();
		body.set('id', String(slotId));
		const result = await postGridAction(
			'unscheduleBlock',
			body,
			'Could not take that off the day.'
		);
		if (!result) return;
		await invalidateAll();
	}

	/**
	 * A drag that ended on the todo strip means "not on a day after all".
	 *
	 * One-off blocks only. A weekly block is a shape of the week rather than a
	 * task, and pulling one off the grid would quietly end every future
	 * occurrence of it — so it says so instead, and the block springs back.
	 */
	function handleEventDragStop(info: Calendar.EventDragInfo) {
		draggingBlock = false;
		overTrayNow = false;
		stopWatchingTray();
		if (!overTray(info.jsEvent)) return;

		const decoded = decodeEventId(info.event.id);
		if (!decoded) return;
		takenOffGrid = true;

		if (decoded.kind !== 'exceptional') {
			gridError =
				'That block repeats every week. Skip it for this day, or remove it from the week.';
			return;
		}

		void unscheduleBlock(decoded.refId);
	}

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
		body.set('durationMinutes', String(NEW_TODO_MINUTES));

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

	/* ── Press and hold, on a finger ────────────────────────────────────────────
	 *
	 * The grid's way of making a block is to drag out a shape on empty space,
	 * and on a touch screen that gesture belongs to the page: a finger dragging
	 * the grid is scrolling, so there was no way at all to create a block by
	 * touching the calendar. The hint under it said "drag to create" to a phone
	 * that could not.
	 *
	 * A press that stays still is the one gesture a scroll cannot be mistaken
	 * for. Hold for `HOLD_MS` on empty grid and the new-block form opens on the
	 * day and hour under the finger, exactly as a drag does with a mouse.
	 *
	 * Cancelled by movement, by lifting early, and by the pointer being taken
	 * away — and it never arms on an existing block, which has its own gestures.
	 */
	const HOLD_MS = 450;
	const HOLD_SLOP = 12;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let holdFrom: { x: number; y: number } | null = null;
	/** Set when a hold created something, so the release is not read again. */
	let holdFired = false;

	function cancelHold() {
		if (holdTimer !== null) clearTimeout(holdTimer);
		holdTimer = null;
		holdFrom = null;
	}

	function armHold(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;
		// An existing block answers to its own press; only empty grid creates.
		if ((e.target as HTMLElement | null)?.closest('.ec-event')) return;

		const target = dropTarget(e);
		if (!target) return;

		holdFrom = { x: e.clientX, y: e.clientY };
		holdFired = false;
		holdTimer = setTimeout(() => {
			holdTimer = null;
			holdFrom = null;
			holdFired = true;
			selectOffsetForDate(target.date);
			prefillTime = target.startTime;
			prefillDuration = timeToMinutes(GRID_SNAP_DURATION) * 2;
			startNew(repeat);
			tick().then(() => createFormEl?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
		}, HOLD_MS);
	}

	function onGridPointerMove(e: PointerEvent) {
		if (!holdFrom) return;
		if (
			Math.abs(e.clientX - holdFrom.x) > HOLD_SLOP ||
			Math.abs(e.clientY - holdFrom.y) > HOLD_SLOP
		)
			cancelHold();
	}

	function onGridPointerDown(e: PointerEvent) {
		if (placingTodoId === null) {
			armHold(e);
			return;
		}
		cancelHold();
		placeStart = { x: e.clientX, y: e.clientY };
		e.stopPropagation();
	}

	async function onGridPointerUp(e: PointerEvent) {
		cancelHold();
		if (holdFired) {
			// The form is already open on this spot; the release must not also
			// reach the calendar as a tap.
			holdFired = false;
			e.preventDefault();
			e.stopPropagation();
			return;
		}
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

	/**
	 * Where the grid was scrolled to, kept across a change.
	 *
	 * Everything that edits a block reloads the page's data, the calendar
	 * re-renders, and event-calendar scrolls back to its `scrollTime` — the
	 * first hour of the day. So finishing a block at eight in the evening threw
	 * you back to six in the morning, and every edit cost a scroll.
	 *
	 * Kept, not fought: the position is recorded as it changes and put back
	 * after a re-render that did not mean to move it. A re-render that *did* —
	 * a different week, a different view — clears it, because landing where you
	 * were looking at the last week is not helpful.
	 */
	let keptScroll = 0;

	/** What a scroll position belongs to. Changing this is a deliberate jump. */
	const gridKey = $derived(`${effectiveView}:${data.range.from}`);

	function scroller(): HTMLElement | null {
		return gridEl?.querySelector('.ec-main') ?? null;
	}

	/*
	 * Recorded on the way past. `capture: true` because the scroller is inside
	 * the calendar's own tree and scroll does not bubble.
	 */
	$effect(() => {
		const root = gridEl;
		if (!root) return;

		const onScroll = (event: Event) => {
			const target = event.target;
			if (target instanceof HTMLElement && target.classList.contains('ec-main')) {
				keptScroll = target.scrollTop;
			}
		};

		root.addEventListener('scroll', onScroll, true);
		return () => root.removeEventListener('scroll', onScroll, true);
	});

	// A deliberate jump: forget where we were.
	$effect(() => {
		// Read into something, not as a bare expression: an expression whose value
		// is thrown away is one a compiler is free to drop, and the dependency
		// would go with it.
		if (gridKey) keptScroll = 0;
	});

	/*
	 * Put it back after the data changed.
	 *
	 * `data` is the dependency, so this runs on the reload every edit causes.
	 * `requestAnimationFrame` because the calendar sets its own scrollTop while
	 * rendering, and setting ours first would be overwritten by it.
	 */
	$effect(() => {
		// `gridEvents`, not `data`: it is what the calendar is actually given, and
		// it is recomputed whenever anything on the day changes. Read into a
		// variable rather than named as a bare expression, which is a value
		// thrown away and a dependency with it.
		const onTheGrid = gridEvents.length;
		if (keptScroll <= 0 || onTheGrid < 0) return;

		const wanted = keptScroll;
		const frame = requestAnimationFrame(() => {
			const el = scroller();
			if (!el) return;
			// Never past the end: a day that lost its last block is shorter than
			// it was, and scrolling to where the bottom used to be is a blank.
			el.scrollTop = Math.min(wanted, el.scrollHeight - el.clientHeight);
		});

		return () => cancelAnimationFrame(frame);
	});

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
	function stampEventId(info: {
		el: HTMLElement;
		event: { id: string | number; start: Date; end: Date };
	}) {
		info.el.dataset.ogEventId = String(info.event.id);
		/*
		 * A block too short for a word is drawn differently, and the class says so.
		 *
		 * A fifteen-minute block at the default zoom is fifteen pixels tall. As a
		 * pale tinted pill with a three-pixel spine it read as a rendering
		 * artefact — a smudge on the seven o'clock line rather than the thing
		 * somebody put there. The treatment inverts below this size: no room for
		 * text means no contrast to protect, so the block goes solid and reads as
		 * a mark. See `.og-event--tiny` in `layout.css`.
		 *
		 * Decided here rather than in CSS because it depends on the zoom, which
		 * is this page's state, and computed from the duration rather than
		 * measured because at mount the element has not been laid out yet.
		 */
		info.el.classList.toggle('og-event--tiny', !eventFitsText(info.event, slotHeight));
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
		goto(resolve(`/tasks/plan?${parts.join('&')}`));
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

		const action = getAction('/tasks/plan', e.key);
		if (!action) {
			if (showCopyPanel) {
				return;
			}
			return;
		}
		e.preventDefault();

		if (action === 'toggle-view') {
			// From what the buttons show rather than from the grid: pressing `g`
			// twice before the first load lands should step two views on, not
			// twice off the same one.
			{
				const shown = pendingView ?? viewMode;
				setView(shown === 'day' ? 'week' : shown === 'week' ? 'month' : 'day');
			}
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
	/**
	 * How long before this block starts to be reminded, while the form is open.
	 *
	 * Its own state rather than a plain `value=` because the chips write into
	 * it: they are shortcuts for typing a number, not a separate control with a
	 * separate answer. Reset from the block whenever the editor opens on a
	 * different one.
	 */
	let remindLead: number | string = $state(0);

	/** "30 min", "1 h", "Not at all" — the chips, in the fewest words. */
	function leadLabel(minutes: number): string {
		if (minutes === 0) return 'Not at all';
		if (minutes < 60) return `${minutes} min`;
		if (minutes === 1440) return 'A day';
		return minutes % 60 === 0
			? `${minutes / 60} h`
			: `${Math.floor(minutes / 60)}h ${minutes % 60}`;
	}

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
		// The button, not the grid. `viewMode` follows `data.view` when the load
		// lands, so nothing is drawn against data that does not match it.
		pendingView = mode;
		const parts: string[] = [`view=${mode}`];
		if (!data.range.isCurrent) parts.push(`from=${data.range.from}`);
		goto(resolve(`/tasks/plan?${parts.join('&')}`), {
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
		...buildSubscribedEvents(data.subscribed),
		...buildBillEvents(data.billsDue, SECTION_COLORS.finance)
	]);

	/**
	 * What became of a block on a day that has been.
	 *
	 * The server hands over one key per occurrence; this is the lookup the grid
	 * calls while drawing. A day still ahead has no answer and gets no mark —
	 * an empty box on every block of next week would say something false about
	 * a week nobody has had yet.
	 */
	function markOf(kind: string, refId: number, date: string): 'done' | 'undone' | null {
		if (date > data.today) return null;
		const prefix = kind === 'exceptional' ? 'x' : 's';
		return data.marks[`${prefix}${refId}|${date}`] ?? null;
	}

	/*
	 * The hours the account asked for in Preferences, widened to hold whatever
	 * is actually on the grid — see `windowForEvents`. A block above the first
	 * line does not scroll off the top; it vanishes, and the day reads as free.
	 *
	 * The geometry the drop target reads back has to agree with what the
	 * calendar was told to draw, which is why both come from here.
	 */
	const gridWindow = $derived(windowForEvents(data.gridHours, gridEvents));
	const gridMinTime = $derived(hourToTime(gridWindow.start));
	const gridMaxTime = $derived(hourToTime(gridWindow.end));

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
			month: effectiveView === 'month',
			narrow: narrowScreen,
			today: data.today,
			markOf: markOf
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
		eventDragStart: (info: Calendar.EventDragInfo) => {
			hovered = null;

			/*
			 * Only for a block that could actually go there.
			 *
			 * A weekly block cannot become a todo — it is a shape of the week, and
			 * pulling one off would end every future occurrence — so opening the
			 * strip while one is being dragged offers something that will be
			 * refused. Nothing opens, and the drag reads as what it is: a move.
			 */
			if (decodeEventId(info.event.id)?.kind !== 'exceptional') return;

			draggingBlock = true;
			draggingBlockTitle = String(info.event.title ?? 'this block');
			// The strip has to be visible before the drag reaches it, and open
			// before anything can be dropped into it.
			todosOpen = true;
			watchTray();
		},
		eventDragStop: handleEventDragStop,
		eventResizeStart: () => (hovered = null)
	});

	/**
	 * A bill on the grid, ticked.
	 *
	 * The gesture is the same one that finishes a block, and the consequence is
	 * the money side: the bill is marked paid for that period, at the amount it
	 * expected. Clicking a paid one takes it back. Anything that wants a
	 * different amount is the Bills page's business, not the week's.
	 */
	async function payBillFromGrid(billId: number, period: string, paid: boolean) {
		const body = new FormData();
		body.set('id', String(billId));
		body.set('period', period);
		await fetch(`/finance/bills?/${paid ? 'unpay' : 'pay'}`, {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
		await invalidateAll();
	}

	function handleEventClick(info: {
		event: { id: string | number; start: Date; extendedProps?: Record<string, unknown> };
	}) {
		const props = info.event.extendedProps ?? {};
		if (props.kind === 'bill') {
			void payBillFromGrid(Number(props.billId), String(props.period), Boolean(props.paid));
			return;
		}
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
		// The drag ended on the todo strip, and `eventDragStop` has already dealt
		// with it. Whether the calendar also reads it as a move depends on where
		// the strip happens to sit, which is not a thing to depend on.
		if (takenOffGrid) {
			takenOffGrid = false;
			info.revert();
			return;
		}

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

<!--
	Tighter on a phone.

	Six things stack above the grid — tabs, toolbar, schemes, the day strip, the
	todo strip — and a 16px gap between each of them spent nearly a hundred
	pixels of a 900px screen on air, before any of the plan was visible. The
	laptop keeps the roomier rhythm; it has the room.
-->
<div class="space-y-2 sm:space-y-4">
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
		One bar.

		This was four stacked things: an arrow cluster, a view cluster, an add
		cluster, and the date orphaned on a line of its own underneath — three
		different alignments and, on a phone, two hundred pixels spent before the
		grid began. Grouped by what they do instead: where you are on the left
		(the date beside the arrows that move it, because that is what the eye is
		already looking at when it reaches for them), what shape and what next on
		the right. It wraps to two rows on a phone and holds one on a laptop.
	-->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2" data-tour="plan-toolbar">
		<!--
			One block: ← date →, arrows hugging the date they move.

			On a phone the block is the full row and the arrows go to its two
			ends, thumb-sized, the direction being the side it is on. On a
			desktop it stays compact — stretched, the right arrow ended up at the
			far edge of a wide screen, a metre of nothing between it and the date
			it belonged to.
		-->
		<div class="flex w-full items-center gap-2 sm:w-auto">
			<button
				onclick={goToPrevWeek}
				disabled={!data.range.prev}
				class="icon-btn h-11 w-11 shrink-0 disabled:opacity-30"
				title={`Back one ${effectiveView} ([)`}
				aria-label="Back one {effectiveView}"
			>
				<Icon name="arrow-left" size={22} />
			</button>

			<!-- Where you are, in words, between the two things that change it. -->
			<span class="min-w-0 flex-1 truncate text-center text-sm text-gray-600 sm:flex-none">
				{#if effectiveView === 'month'}
					{monthLabel(data.range.month)}
				{:else if effectiveView === 'day'}
					<!-- One day is one date. "Sep 1 — Sep 1" is a range with nothing
					     in it, and it read as a bug every time. -->
					{formatWeekDate(data.range.from)}
					{#if data.range.isCurrent}<span class="text-gray-500"> · today</span>{/if}
				{:else}
					{formatWeekDate(data.range.from)} &mdash; {formatWeekDate(data.range.last)}
					{#if data.range.isCurrent}
						<span class="hidden text-gray-500 sm:inline"> · next 7 days</span>
					{/if}
				{/if}
			</span>

			{#if !data.range.isCurrent}
				<button onclick={goToToday} class="btn btn-sm shrink-0" title="Back to today">Today</button>
			{/if}

			<button
				onclick={goToNextWeek}
				class="icon-btn h-11 w-11 shrink-0"
				title="Forward one {effectiveView} (])"
				aria-label="Forward one {effectiveView}"
			>
				<Icon name="arrow-right" size={22} />
			</button>
		</div>

		<!-- Pinned right on a laptop; on a phone it takes the second line whole, so
		     the two controls sit at the ends instead of huddling in one corner. -->
		<div class="ml-auto flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
			<!--
				Schemes: a saved shape of a week, loaded over this one. Here rather
				than on a line of its own because it is a control, and a control
				belongs with the other controls.
			-->
			<button
				type="button"
				onclick={() => {
					schemesExpanded = !schemesExpanded;
					if (!schemesExpanded) {
						confirmingLoadSchemeId = null;
						confirmingDeleteSchemeId = null;
					}
				}}
				aria-expanded={schemesExpanded}
				aria-controls="plan-schemes-panel"
				class="btn btn-sm shrink-0"
				title="Saved shapes of a week"
			>
				Schemes
			</button>

			<div class="seg" role="group" aria-label="How much to show">
				{#each [['day', 'Day'], ['week', 'Week'], ['month', 'Month']] as [mode, label] (mode)}
					<button
						onclick={() => setView(mode as PlanView)}
						aria-pressed={(pendingView ?? effectiveView) === mode}
						title="{label} view (g cycles)">{label}</button
					>
				{/each}
			</div>

			<!--
				One button, not two.

				"+ One-off" and "+ Weekly" made you answer "how often does this
				repeat" before you had said what it was — and the form asks the
				same question again, with the answer changeable, two lines below
				the name. So the toolbar asks nothing: it opens the form on the
				day you are looking at, and the repeat control is where it always
				was. Both keyboard shortcuts still open it at their own setting.
			-->
			<button
				onclick={() => (showForm ? closeForm() : startNew('weekly'))}
				class="btn btn-sm btn-primary"
				title="New block (n)"
			>
				{showForm ? 'Cancel' : '+ New'}
			</button>
		</div>
	</div>

	<FormError message={form?.message} />

	{#if gridError}
		<Banner kind="error" message={gridError} />
	{/if}

	<!--
		The panel, when it is open. The control that opens it is in the toolbar.

		It had a line of its own above the grid, reading "SCHEMES  SHOW" — two
		uppercase words with a gap, which is not a control, it is a label that
		looks broken. And it was one of six things stacked between the tabs and
		the first hour of the week, for something most people open once a month.
	-->
	<div
		class:border={schemesExpanded}
		class:border-gray-200={schemesExpanded}
		class:bg-white={schemesExpanded}
		class:shadow-card={schemesExpanded}
		data-tour="plan-schemes"
		id="plan-schemes-panel"
	>
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
					<!-- What a scheme is, once, where it is made. Saying it here is
					     what makes the Load button's warning short enough to read. -->
					<p class="text-xs text-gray-500">
						A scheme is your repeating week — the blocks that come back every week. Anything you put
						on one day only is not part of it, and loading a scheme leaves those where they are.
					</p>
					<div class="flex gap-2">
						<input
							name="label"
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
								<!--
									Two rows on a phone, one on a desktop.

									It was a single flex row — name, Rename, Load, Delete — and on
									a narrow screen the name was the only thing that could give,
									so it collapsed to a sliver and the schemes were a list of
									identical unlabelled rows. The name is what somebody is
									choosing between, so it gets its own line where there is not
									room for both.
								-->
								<div class="space-y-2 px-4 py-3 sm:flex sm:items-center sm:gap-4 sm:space-y-0">
									<form method="post" action="?/renameScheme" use:enhance class="min-w-0 sm:flex-1">
										<input type="hidden" name="schemeId" value={scheme.id} />
										<div class="flex gap-2">
											<input
												name="label"
												type="text"
												autocomplete="off"
												value={scheme.name}
												required
												aria-label="Name of this scheme"
												class="w-full min-w-0 border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
											/>
											<button type="submit" class="btn shrink-0"> Rename </button>
										</div>
									</form>

									{#if confirmingLoadSchemeId === scheme.id}
										<!--
											The warning as a sentence, and the button as a button.

											It used to BE the button — a paragraph of text in a control,
											which on a phone was a long dark slab lying across the row
											and half of the one under it. The words still have to be
											read before it is pressed; they just are not a target.
										-->
										<div class="min-w-0 sm:shrink-0">
											<p class="mb-1.5 text-xs text-gray-500">
												Replaces your repeating week. One-off blocks stay.
											</p>
											<div class="flex gap-2">
												<form
													method="post"
													action="?/loadScheme"
													use:enhance={() => {
														return async ({ update }) => {
															await update({ reset: false });
															confirmingLoadSchemeId = null;
														};
													}}
												>
													<input type="hidden" name="schemeId" value={scheme.id} />
													<button
														type="submit"
														class="btn border-blue-200 text-blue-600 hover:bg-blue-50"
													>
														Load it
													</button>
												</form>
												<button
													type="button"
													onclick={() => (confirmingLoadSchemeId = null)}
													class="btn"
												>
													Cancel
												</button>
											</div>
										</div>
									{:else if confirmingDeleteSchemeId === scheme.id}
										<div class="flex shrink-0 items-center gap-2">
											<form
												method="post"
												action="?/deleteScheme"
												use:enhance={() => {
													return async ({ update }) => {
														await update({ reset: false });
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
													Delete it?
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
										<div class="flex shrink-0 items-center gap-2">
											<button
												type="button"
												onclick={() => {
													confirmingLoadSchemeId = scheme.id;
													confirmingDeleteSchemeId = null;
												}}
												class="btn"
											>
												Load
											</button>
											<button
												title="Delete"
												aria-label="Delete {scheme.name}"
												type="button"
												onclick={() => {
													confirmingDeleteSchemeId = scheme.id;
													confirmingLoadSchemeId = null;
												}}
												class="btn btn-danger"
											>
												<Icon name="trash" />
											</button>
										</div>
									{/if}
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
				<!--
					Folded to begin with.

					Subscribing to a calendar is a thing somebody does once, and the
					panel is a paragraph of instructions and three fields — which sat
					under the schemes, open, every time the drawer was opened for the
					schemes. It is not the reason anybody comes here.
				-->
				<div class="border border-gray-200 bg-white shadow-card">
					<button
						type="button"
						onclick={() => (calendarsOpen = !calendarsOpen)}
						class="eyebrow flex w-full items-center gap-1.5 border-b border-gray-200 px-4 py-2.5 text-left text-gray-500 hover:text-gray-900"
						aria-expanded={calendarsOpen}
					>
						<Icon name={calendarsOpen ? 'chevron-down' : 'chevron-right'} size={14} />
						Calendars you subscribe to
						{#if data.feeds.length > 0}
							<span class="text-gray-400">({data.feeds.length})</span>
						{/if}
					</button>
					{#if calendarsOpen}
						{#if data.feeds.length === 0}
							<div class="px-3">
								<EmptyState icon="calendar" title="No calendars subscribed yet" compact />
							</div>
						{:else}
							<ul class="divide-y divide-gray-200">
								{#each data.feeds as feed (feed.id)}
									<li class="flex flex-wrap items-center gap-3 px-4 py-3">
										<span
											class="h-3 w-1 shrink-0 rounded-full"
											style="background-color: {feed.color}"
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
							<!--
							The address gets a line of its own on a phone.

							Four controls on one row left it about two characters wide —
							long enough to show "ht" of an iCal URL, which is the one field
							here nobody can type from memory and everybody pastes.
						-->
							<div class="flex flex-wrap gap-2">
								<input
									autocomplete="off"
									name="url"
									type="url"
									placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
									required
									class="input w-full min-w-0 sm:order-2 sm:w-auto sm:flex-1"
									aria-label="The calendar's iCal address"
								/>
								<input
									name="label"
									placeholder="Work"
									autocomplete="off"
									required
									class="input w-32 sm:order-1"
									aria-label="What to call it"
								/>
								<input
									name="color"
									type="color"
									value="#6b7280"
									class="h-10 w-12 border border-gray-300 sm:order-3"
									aria-label="Colour"
								/>
								<button class="btn btn-primary sm:order-4" title="Subscribe" aria-label="Subscribe">
									<Icon name="plus" />
								</button>
							</div>
							<p class="mt-2 text-xs text-gray-500">
								In Google Calendar: Settings → the calendar → “Secret address in iCal format”.
								Ontoplano only reads that calendar; nothing you do here changes it.
							</p>
						</form>
					{/if}
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
											await update({ reset: false });
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
						await update({ reset: false });
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
								await update({ reset: false });
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
			<!--
				`reset: false`, because this form is about to disappear.
				
				SvelteKit's `update()` resets the form element by default, and on a
				phone the round trip is long enough to see it happen: every field
				blanks, and then the dialog closes over the empty form it just made.
				Nothing wanted the reset — the form is destroyed on close, and on a
				failure it must keep what was typed rather than throw it away.
			-->
			<form
				id="block-form"
				method="post"
				action={formAction}
				use:enhance={() => {
					return async ({ result, update }) => {
						await update({ reset: false });
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
									autocomplete="off"
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
									autocomplete="off"
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

				<!--
					The grid, not hand-picked widths.

					These rows used to be `flex` with `w-36`/`w-28`/`w-24` on the
					labels, which squeezed three controls side by side on a 390px
					screen and wrapped every label into two lines. FormGrid stacks
					them full width below `sm` and lines them up above it.
				-->
				<FormGrid>
					{#if repeat === 'weekly'}
						<Field label="Day" span={4} required>
							<select name="weekday" required bind:value={formWeekday} class="select">
								{#each data.weekdays as day, i (i)}
									<option value={i}>{day}</option>
								{/each}
							</select>
						</Field>
					{:else}
						<Field label="Date" span={4} required>
							<input
								autocomplete="off"
								name="date"
								type="date"
								required
								min={data.today}
								bind:value={formDate}
								class="input"
							/>
						</Field>
					{/if}
					<Field label="Time" span={4} required>
						<input
							autocomplete="off"
							bind:this={timeInput}
							name="startTime"
							type="time"
							required
							value={editingBlock?.startTime ?? prefillTime}
							class="input"
						/>
					</Field>
					<Field label="Duration" span={4} hint="minutes">
						<input
							autocomplete="off"
							name="durationMinutes"
							type="number"
							min="15"
							step="15"
							value={editingBlock?.durationMinutes ?? prefillDuration}
							class="input"
						/>
					</Field>
				</FormGrid>

				<FormGrid>
					<!--
						The reminder, where the block is.

						Not a page of its own and not a clock reading: a reminder is a
						property of the thing being planned — "tell me ten minutes before
						gym" — said once, applying to every occurrence of it. Each
						occurrence gets its own nudge as it appears.
					-->
					<Field
						label="Remind me"
						span={12}
						hint="Minutes before it starts. Every time it comes round. Empty or 0 is not at all."
					>
						<!--
							A list and a box, not one or the other.

							The list is what anybody picks nine times out of ten, and
							hunting for "10" in a number field is worse than tapping it.
							But "the usual few" is a guess about somebody else's life —
							45 minutes for a commute, three hours for a flight — so the
							list writes into the box rather than replacing it, and the
							box is what is submitted.
						-->
						<div class="flex flex-wrap items-center gap-2">
							<input
								autocomplete="off"
								name="remindLeadMinutes"
								type="number"
								min="0"
								max="1440"
								step="5"
								bind:value={remindLead}
								placeholder="0"
								class="input tabular w-28"
								aria-label="Minutes before it starts"
							/>
							<div class="flex flex-wrap gap-1">
								{#each [0, 5, 10, 30, 60, 1440] as minutes (minutes)}
									<button
										type="button"
										class="chip"
										aria-pressed={Number(remindLead) === minutes}
										onclick={() => (remindLead = minutes)}
									>
										{leadLabel(minutes)}
									</button>
								{/each}
							</div>
						</div>
					</Field>
				</FormGrid>

				<FormGrid>
					<Field label="Mode" span={4} required>
						<select name="mode" required bind:value={slotMode} class="select">
							<option value="activity">Activity</option>
							<option value="category">Category</option>
						</select>
					</Field>
					{#if slotMode === 'category'}
						<Field label="Category" span={4} required>
							<select name="categoryId" required class="select">
								{#each data.categories as cat (cat.id)}
									<option value={cat.id} selected={editingBlock?.categoryId === cat.id}
										>{cat.name}</option
									>
								{/each}
							</select>
						</Field>
					{:else}
						<Field label="Activity" span={4} required>
							<select name="activityId" required bind:value={activityChoice} class="select">
								{#each data.activities as act (act.id)}
									<option value={String(act.id)}>{act.name}</option>
								{/each}
								<option value={NEW_ACTIVITY}>+ New activity...</option>
							</select>
						</Field>
					{/if}
					<Field
						label="Label"
						span={4}
						hint={slotMode === 'category' ? '' : 'optional'}
						required={slotMode === 'category'}
					>
						<input
							name="label"
							type="text"
							autocomplete="off"
							placeholder={slotMode === 'category' ? 'e.g. dentist' : ''}
							value={editingBlock?.label ?? ''}
							class="input"
						/>
					</Field>
				</FormGrid>

				{#if slotMode === 'activity' && activityChoice === NEW_ACTIVITY}
					<div class="border border-gray-200 bg-gray-50 p-3">
						<FormGrid>
							<Field label="New activity" span={8} required>
								<input
									name="newActivityName"
									type="text"
									required
									autocomplete="off"
									use:autofocus
									placeholder="e.g. learn russian"
									class="input"
								/>
							</Field>
							<Field label="Its category" span={4} required>
								<select name="newActivityCategoryId" required class="select">
									{#each data.categories as cat (cat.id)}
										<option value={cat.id}>{cat.name}</option>
									{/each}
								</select>
							</Field>
						</FormGrid>
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
					{#if editingBlockId !== null}
						<!--
							The tick, from the grid. The board is where a day is worked,
							but half the time the form is open because somebody glanced at
							the plan and thought "that did happen" — so the answer lives
							next to Skip, and leads. Done is blue, like every done here.
						-->
						{@const tickDate = editingKind === 'slot' ? selectedDateStr() : formDate}
						{@const tickKey = `${editingKind === 'slot' ? 's' : 'x'}${editingBlockId}|${tickDate}`}
						{@const ticked = data.marks[tickKey] === 'done'}
						<form
							method="post"
							action="?/setStatus"
							use:enhance={() =>
								async ({ update }) =>
									update()}
						>
							<input type="hidden" name="kind" value={editingKind} />
							<input type="hidden" name="refId" value={editingBlockId} />
							<input type="hidden" name="date" value={tickDate} />
							<input type="hidden" name="status" value={ticked ? 'todo' : 'done'} />
							<button
								type="submit"
								title={ticked ? 'Put it back to pending' : 'It happened'}
								class="border px-3 py-2 text-sm font-medium transition {ticked
									? 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
									: 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800'}"
							>
								{ticked ? `Done ✓ — undo` : `Mark as done`}
							</button>
						</form>
					{/if}

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

					<!--
						The same act as dragging the block onto the todo strip, for a
						screen where that drag is awkward — and the one place somebody
						looking for it would think to look. One-offs only: a weekly
						block is a shape of the week, not a task waiting for a time.
					-->
					{#if editingKind === 'exceptional'}
						<form
							method="post"
							action="?/unscheduleBlock"
							use:enhance={() => {
								return async ({ update }) => {
									await update({ reset: false });
									closeForm();
								};
							}}
						>
							<input type="hidden" name="id" value={editingBlockId} />
							<button type="submit" class="btn btn-sm" title="Take it off the day, keep the task">
								Back to to-do
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
											await update({ reset: false });
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

	<!--
		The day picker, where there is more than one day to pick.

		In day view the range is one day, so this drew a single full-width button
		saying "Today" that moved nothing — a hundred pixels of the phone's screen
		spent on a control with one position. The arrows above are what moves the
		day; this is for a range that has several.
	-->
	{#if effectiveView === 'day' && data.range.days.length > 1}
		<div class="seg flex w-full" role="group" aria-label="Which day">
			{#each data.range.days as day, i (day.date)}
				<button
					onclick={() => (selectedOffset = i)}
					aria-pressed={selectedOffset === i}
					class="flex-1"
					title={day.date}
				>
					{day.isToday ? 'Today' : day.name.slice(0, 3)}
				</button>
			{/each}
		</div>
	{/if}

	<!--
		The strip things wait on, in both directions.

		It holds what has no time yet: the undated pile, and the ones due today or
		still owed from an earlier day — those had nowhere on this page at all,
		though a todo due today is exactly what somebody opens the planner to
		place. Dropping a block back onto it takes the block off the day again,
		which is what makes the grid somewhere you can change your mind.
	-->
	{#if data.todos.length > 0 || draggingBlock}
		<details
			bind:open={todosOpen}
			bind:this={trayEl}
			class="mb-2 {draggingBlock
				? 'border border-dashed border-gray-400 bg-gray-50 px-2 py-1'
				: ''}"
		>
			<summary
				class="flex cursor-pointer list-none items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
			>
				<span class="text-xs text-gray-500">{todosOpen ? '▾' : '▸'}</span>
				<span class="eyebrow text-gray-600">To-do</span>
				<span
					class="tabular border border-gray-300 bg-gray-50 px-1 text-xs text-gray-600 text-gray-700"
				>
					{data.todos.length}
				</span>
				{#if draggingBlock}
					<span class="text-xs text-gray-700">drop here to take it off the day</span>
				{:else if !todosOpen}
					<!-- What these are, not how to move them: a chip beside a grid is
					     something you drag, and nobody needed to be told. -->
					<span class="text-xs text-gray-500">
						{dueToday > 0 ? `${dueToday} for today` : 'still without a time'}
					</span>
				{/if}
			</summary>

			<div class="mt-2 flex flex-wrap items-center gap-2">
				<!--
					The block being dragged, drawn where it would land, before the
					mouse is released. A drop target that only lights up says
					"something can go here"; this says what, and it is the same chip
					it will become.
				-->
				{#if draggingBlock && overTrayNow}
					<span
						class="border border-dashed border-gray-400 bg-gray-100 px-2 py-1 text-xs text-gray-500 italic"
					>
						{draggingBlockTitle}
					</span>
				{/if}
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
							: todo.due
								? 'border-gray-400 bg-white font-medium text-gray-900'
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
						<!--
							Said in a word rather than a colour: which of these is for
							today is the whole reason the strip is worth opening, and a
							tint alone says it to some people and not others.
						-->
						{#if todo.due === 'today'}
							<span class="ml-1 text-[0.65rem] tracking-wide text-gray-500 uppercase">today</span>
						{:else if todo.due === 'overdue'}
							<span class="ml-1 text-[0.65rem] tracking-wide text-gray-500 uppercase">owed</span>
						{/if}
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
						drag onto the grid to give it a time, or back here to take it off
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
		bind:this={gridWrap}
		data-tour="plan-grid"
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
		onpointermovecapture={onGridPointerMove}
		onpointercancelcapture={cancelHold}
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

		{#if dropPreview?.box}
			<!--
				The todo, drawn as the block it is about to become.

				This was a chip in the corner reading the date and the time, which is
				a sentence to read while your hand is holding a drag. The shape in
				the right place answers the same question with nothing to read.
			-->
			<div
				class="pointer-events-none absolute z-20 overflow-hidden border-2 border-dashed border-gray-500 bg-gray-500/15"
				style="left:{dropPreview.box.left}px; top:{dropPreview.box.top}px; width:{dropPreview.box
					.width}px; height:{dropPreview.box.height}px"
			>
				<span class="tabular block px-1 text-[0.65rem] leading-tight text-gray-700">
					{dropPreview.startTime}
					{dragTodoTitle}
				</span>
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
		<!-- The touch equivalent, said where a touch screen will see it — the
		     line below is hidden on a coarse pointer, and used to be the only
		     place the grid explained how to make a block. -->
		<p class="hidden text-xs text-gray-500 [@media(pointer:coarse)]:block">
			Press and hold on the grid to add a block there.
		</p>
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
			<!--
				The design pass replaced white-with-a-border-and-a-shadow everywhere
				except here, so this one control was still wearing the old clothes.
				A stepper is two quiet square buttons around the value they change,
				and the value is the reset.
			-->
			<button
				type="button"
				onclick={() => setZoom(zoomIndex - 1)}
				disabled={zoomIndex === 0}
				title="Zoom out (-)"
				aria-label="Zoom out"
				class="icon-btn disabled:cursor-not-allowed disabled:opacity-30">&minus;</button
			>
			<button
				type="button"
				onclick={() => setZoom(GRID_DEFAULT_ZOOM_INDEX)}
				title="Reset zoom (0)"
				class="btn btn-sm tabular"
				>{Math.round((slotHeight / GRID_ZOOM_LEVELS[GRID_DEFAULT_ZOOM_INDEX]) * 100)}%</button
			>
			<button
				type="button"
				onclick={() => setZoom(zoomIndex + 1)}
				disabled={zoomIndex === GRID_ZOOM_LEVELS.length - 1}
				title="Zoom in (+)"
				aria-label="Zoom in"
				class="icon-btn disabled:cursor-not-allowed disabled:opacity-30">+</button
			>
		</div>
	</div>
	{#if hovered}
		<div
			data-block-hover
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
					placeholder={'h,d,m,t,w,t,f,s,s\n610,30,Wake up,Wake up,Wake up,Wake up,Wake up,,\n630,60,Stretch,Water the plants,Stretch,Water the plants,Stretch,,'}
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
