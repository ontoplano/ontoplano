import type { Calendar } from '@event-calendar/core';
import { CATEGORY_FALLBACK_COLOR } from './colors.js';

/**
 * The default stretch of the day, when the account has not said otherwise.
 *
 * Six to midnight covers a normal waking day without spending a third of the
 * grid on hours nobody plans in. It is only the default: `baseGridOptions`
 * takes whatever the account chose in its preferences.
 */
export const GRID_MIN_TIME = '06:00:00';
export const GRID_MAX_TIME = '24:00:00';

/** `6` → `'06:00:00'`, for a stored whole hour. */
export function hourToTime(hour: number): string {
	return `${String(hour).padStart(2, '0')}:00:00`;
}

/**
 * The stretch of day the grid has to draw, which is not always the one asked for.
 *
 * Preferences hold a window — 06:00 to 22:00, say — and that is the right thing
 * to look at on an ordinary day. It is the wrong thing to obey: a block can be
 * dragged above the first line, created at 04:00 from the form, or arrive in a
 * subscribed calendar from somebody in another timezone, and a window that
 * ignores it draws a grid with a missing block. Nothing tells you it is
 * missing. It is simply not there, and the day looks free.
 *
 * So the window is the asked-for one widened to hold everything on it, at both
 * ends — the same argument reads the same going the other way, and a meeting at
 * 23:30 disappears exactly as quietly as one at 04:00. It never narrows: an
 * empty Tuesday still shows the hours somebody chose to see.
 *
 * All-day events are excluded. They have no hour to make room for, and taking
 * their span literally would open every grid to the full day.
 */
export function windowForEvents(
	asked: { start: number; end: number },
	events: { start?: unknown; end?: unknown; allDay?: boolean }[]
): { start: number; end: number } {
	let start = asked.start;
	let end = asked.end;

	for (const event of events) {
		if (event.allDay) continue;
		const from = asDate(event.start);
		if (!from) continue;
		const to = asDate(event.end) ?? from;

		start = Math.min(start, from.getHours());

		// A block running past midnight has no end hour on this day — it needs
		// the rest of it. Anything else rounds up, so 23:30 asks for 24 rather
		// than for 23 and half a block below the last line.
		const sameDay = to.toDateString() === from.toDateString();
		const endHour = sameDay ? Math.ceil((to.getHours() * 60 + to.getMinutes()) / 60) : 24;
		end = Math.max(end, endHour);
	}

	start = Math.max(0, Math.min(start, 23));
	return { start, end: Math.min(24, Math.max(end, start + 1)) };
}

function asDate(value: unknown): Date | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (typeof value === 'string') {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	return null;
}
export const GRID_SLOT_DURATION = '00:30:00';
export const GRID_SLOT_MINUTES = 30;
// Drag/resize/select step. Independent from GRID_SLOT_DURATION so the gridlines stay
// readable at 30min while placement is precise to the quarter hour.
export const GRID_SNAP_DURATION = '00:15:00';

// Slot heights (px per GRID_SLOT_MINUTES) the zoom control steps through.
export const GRID_ZOOM_LEVELS = [16, 24, 36, 52, 72, 96];
export const GRID_DEFAULT_ZOOM_INDEX = 1;
// Below this rendered height a block can't fit a legible line of text, so the title is
// dropped and the block reads as a plain colour bar (hover or zoom in for the details).
export const GRID_MIN_TEXT_PX = 18;

/**
 * How tall a block has to be before it says *when* as well as *what*.
 *
 * Two lines of the block's own type plus its padding. Below this the name is
 * the one that survives — a block that has to choose says what it is, because
 * its position already says roughly when.
 */
export const GRID_MIN_TIME_PX = 34;

export interface GridCategory {
	id: number;
	name?: string | null;
	color?: string | null;
}

export interface GridSlotInput {
	id: number;
	weekday: number;
	startTime: string;
	durationMinutes: number;
	mode: 'category' | 'activity' | 'training';
	categoryId: number | null;
	activityId: number | null;
	categoryName?: string | null;
	activityName?: string | null;
	activityCategoryId?: number | null;
	label?: string | null;
	active: boolean;
}

export interface GridExceptionalInput {
	id: number;
	date: string;
	startTime: string;
	durationMinutes: number;
	mode: 'category' | 'activity' | 'training';
	categoryId: number | null;
	activityId: number | null;
	categoryName?: string | null;
	activityName?: string | null;
	activityCategoryId?: number | null;
	label?: string | null;
	active: boolean;
	status?: string;
}

export interface SlotPlacement {
	weekday: number;
	startTime: string;
	durationMinutes: number;
}

export interface BuildEventsOptions {
	suppressedSlotIds?: Set<number>;
}

export type GridEventKind = 'slot' | 'exceptional';

export function encodeEventId(kind: GridEventKind, refId: number): string {
	return `${kind}:${refId}`;
}

export function decodeEventId(id: string | number): { kind: GridEventKind; refId: number } | null {
	const raw = String(id);
	const sep = raw.indexOf(':');
	if (sep === -1) return null;
	const kind = raw.slice(0, sep);
	const refId = Number(raw.slice(sep + 1));
	if ((kind !== 'slot' && kind !== 'exceptional') || !Number.isFinite(refId)) return null;
	return { kind, refId };
}

export function parseLocalDate(dateStr: string): Date {
	return new Date(`${dateStr}T00:00:00`);
}

export function formatLocalDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatClock(d: Date): string {
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Weekly slots are recurring (Monday-indexed weekday), so each is projected onto
// a concrete date before rendering. The window is seven consecutive days starting
// at `fromStr`, which contains every weekday exactly once — so the projection is
// the first occurrence of that weekday at or after the window start. When the
// window happens to start on a Monday this is the plain Monday + weekday offset.
export function weekdayToDate(fromStr: string, weekday: number): Date {
	const from = parseLocalDate(fromStr);
	const offset = (weekday - dateToWeekday(from) + 7) % 7;
	return new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
}

export function dateToWeekday(d: Date): number {
	const dow = d.getDay();
	return dow === 0 ? 6 : dow - 1;
}

function combineDateAndClock(base: Date, hhmm: string): Date {
	const [h, m] = hhmm.split(':').map(Number);
	return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
}

export function categoryColor(categories: GridCategory[], categoryId: number | null): string {
	if (!categoryId) return CATEGORY_FALLBACK_COLOR;
	const cat = categories.find((c) => c.id === categoryId);
	return cat?.color ?? CATEGORY_FALLBACK_COLOR;
}

function categoryLabel(categories: GridCategory[], categoryId: number | null): string | null {
	if (!categoryId) return null;
	return categories.find((c) => c.id === categoryId)?.name ?? null;
}

function effectiveCategoryId(item: {
	categoryId: number | null;
	activityCategoryId?: number | null;
}): number | null {
	return item.categoryId ?? item.activityCategoryId ?? null;
}

/**
 * A block's category colour, handed to CSS rather than painted here.
 *
 * The grid used to be a field of saturated rectangles: every block was its
 * category at full strength, so six hours of work on a Tuesday was three
 * hundred pixels of solid blue and the week read as a colour chart rather than
 * as a schedule. The colour is meant to *identify* a block, and identifying
 * does not need the whole surface — a tint and a spine do it, and leave the eye
 * free to read shape and density, which is what a week is looked at for.
 *
 * It is a custom property rather than a background because the mix depends on
 * the theme: 18% of a hue on white is a tint, and 18% on near-black is nothing.
 * This module does not know which theme is on and should not have to.
 *
 * It also retires `contrastText`, which picked white or near-black ink by
 * luminance — the right answer to the wrong question. White on the kitchen's
 * #a16207 passed by a hair and looked it; dark ink on a tint of the same hue is
 * comfortable at every colour a category can be.
 *
 * `styles` is event-calendar's escape hatch: entries are appended to the
 * element's inline style. Nothing else is passed, because with no
 * `backgroundColor` the library writes no colour declaration at all and the
 * stylesheet is free to own the whole appearance.
 */
export function blockHue(color: string): string {
	// Anything that is not a plain hex could be arbitrary text out of a category
	// row, and this string is concatenated into an inline style.
	const safe = /^#?[0-9a-f]{3,8}$/i.test(color.trim()) ? color.trim() : '';
	if (!safe) return '--block:var(--color-gray-400)';
	return `--block:${safe.startsWith('#') ? safe : `#${safe}`}`;
}

/**
 * What a block is called, in one place.
 *
 * A block is named by what it *is* before what somebody typed on it: an
 * activity has a name, and a block that only names a category is that category.
 * The label is the exception, not the rule, which is why a list that showed
 * only labels ended up printing "block 47".
 */
export function blockName(
	item: Pick<GridSlotInput, 'mode' | 'activityName' | 'label' | 'categoryName'>
): string {
	if (item.mode === 'activity' && item.activityName) return item.activityName;
	if (item.label) return item.label;
	if (item.categoryName) return item.categoryName;
	return 'Untitled';
}

function slotToEvent(
	slot: GridSlotInput,
	mondayStr: string,
	categories: GridCategory[],
	opts: BuildEventsOptions
): Calendar.EventInput {
	const dayDate = weekdayToDate(mondayStr, slot.weekday);
	const start = combineDateAndClock(dayDate, slot.startTime);
	const end = new Date(start.getTime() + slot.durationMinutes * 60_000);
	const bg = categoryColor(categories, effectiveCategoryId(slot));
	const suppressed = opts.suppressedSlotIds?.has(slot.id) ?? false;
	const inactive = !slot.active || suppressed;
	// A slot skipped for this date is a stand-in for something that isn't
	// happening, so there is nothing meaningful to drag it to.
	const editable = !suppressed;

	const classNames = ['og-event'];
	if (inactive) classNames.push('og-event--inactive');

	return {
		id: encodeEventId('slot', slot.id),
		start,
		end,
		title: blockName(slot),
		// The hue, and nothing else. What is done with it — a tint, a spine, the
		// ink on top — is `layout.css`, because the answer depends on the theme
		// and this module has no idea which one is on. See `blockHue`.
		styles: [blockHue(bg)],
		editable,
		classNames,
		extendedProps: {
			kind: 'slot',
			refId: slot.id,
			mode: slot.mode,
			categoryId: slot.categoryId,
			categoryName: categoryLabel(categories, effectiveCategoryId(slot)),
			activityId: slot.activityId,
			label: slot.label ?? '',
			active: slot.active,
			suppressed
		}
	};
}

function exceptionalToEvent(
	exc: GridExceptionalInput,
	categories: GridCategory[]
): Calendar.EventInput {
	const dayDate = parseLocalDate(exc.date);
	const start = combineDateAndClock(dayDate, exc.startTime);
	const end = new Date(start.getTime() + exc.durationMinutes * 60_000);
	const bg = categoryColor(categories, effectiveCategoryId(exc));

	return {
		id: encodeEventId('exceptional', exc.id),
		start,
		end,
		title: blockName(exc),
		styles: [blockHue(bg)],
		editable: true,
		classNames: ['og-event', 'og-event--exceptional'],
		extendedProps: {
			kind: 'exceptional',
			refId: exc.id,
			mode: exc.mode,
			categoryId: exc.categoryId,
			categoryName: categoryLabel(categories, effectiveCategoryId(exc)),
			activityId: exc.activityId,
			label: exc.label ?? '',
			status: exc.status ?? ''
		}
	};
}

/**
 * Somebody else's calendar, drawn where it will get in the way.
 *
 * Read-only and immovable, because it is not ours to move: dragging one would
 * be a lie the moment the next fetch overwrote it. Faded and outlined rather
 * than filled, so the week reads as "these are yours, and these are the
 * meetings around them" at a glance.
 */
export function buildSubscribedEvents(
	events: {
		uid: string;
		summary: string;
		start: string;
		end: string;
		allDay: boolean;
		color: string;
		feedName: string;
	}[]
): Calendar.EventInput[] {
	return events.map((event) => ({
		id: `ics:${event.uid}`,
		start: new Date(event.start),
		end: new Date(event.end),
		allDay: event.allDay,
		title: event.summary,
		backgroundColor: 'transparent',
		textColor: event.color,
		borderColor: event.color,
		editable: false,
		startEditable: false,
		durationEditable: false,
		classNames: ['og-event', 'og-event--subscribed'],
		extendedProps: { kind: 'subscribed', feedName: event.feedName }
	}));
}

export function buildSlotEvents(
	slots: GridSlotInput[],
	mondayStr: string,
	categories: GridCategory[],
	opts: BuildEventsOptions = {}
): Calendar.EventInput[] {
	return slots.map((s) => slotToEvent(s, mondayStr, categories, opts));
}

/**
 * Weekly blocks across a stretch of dates — a month, say.
 *
 * `buildSlotEvents` maps a block onto one week; a month view needs each block
 * on every week it appears in, and the only alignment that cannot be wrong is
 * the dates the calendar is actually showing. Event ids repeat across weeks,
 * which is fine: the id names the block, and the occurrence is its date.
 */
export function buildSlotEventsForDates(
	slots: GridSlotInput[],
	dates: string[],
	categories: GridCategory[],
	opts: BuildEventsOptions = {}
): Calendar.EventInput[] {
	// One week start per row: a block lands on its own weekday inside it.
	const weekStarts = dates.filter((_, i) => i % 7 === 0);
	return weekStarts.flatMap((weekStart) => buildSlotEvents(slots, weekStart, categories, opts));
}

export function buildExceptionalEvents(
	exceptionals: GridExceptionalInput[],
	categories: GridCategory[]
): Calendar.EventInput[] {
	return exceptionals.map((e) => exceptionalToEvent(e, categories));
}

export function placementFromDates(start: Date, end: Date): SlotPlacement {
	const durationMinutes = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000));
	return {
		weekday: dateToWeekday(start),
		startTime: formatClock(start),
		durationMinutes
	};
}

export function formatGridDuration(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}min`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}min`;
}

interface GridEventLike {
	// event-calendar types this as Content (string | {html} | {domNodes}); our events
	// always use plain strings, so it is narrowed at read time.
	title?: unknown;
	start: Date;
	end: Date;
	extendedProps?: Record<string, unknown>;
}

// Whether a block rendered at `slotHeight` is tall enough to show its title.
export function eventFitsText(event: GridEventLike, slotHeight: number): boolean {
	return eventHeightPx(event, slotHeight) >= GRID_MIN_TEXT_PX;
}

/** …and tall enough for the time on a second line under it. */
export function eventFitsTime(event: GridEventLike, slotHeight: number): boolean {
	return eventHeightPx(event, slotHeight) >= GRID_MIN_TIME_PX;
}

function eventHeightPx(event: GridEventLike, slotHeight: number): number {
	const minutes = (event.end.getTime() - event.start.getTime()) / 60_000;
	return (minutes / GRID_SLOT_MINUTES) * slotHeight;
}

/** For a title going into an innerHTML. */
function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/** `09:00 – 12:00`, in the same 24-hour reading as the gutter beside it. */
function clockRange(event: GridEventLike): string {
	return `${formatClock(event.start)}\u2009\u2013\u2009${formatClock(event.end)}`;
}

export interface GridEventDetail {
	title: string;
	timeText: string;
	durationText: string;
	categoryName: string | null;
	label: string | null;
	state: string | null;
}

// Everything a block knows about itself, for the hover card — the way to read a slot
// that is too short to render its own title.
export function describeGridEvent(event: GridEventLike): GridEventDetail {
	const props = event.extendedProps ?? {};
	const title = typeof event.title === 'string' && event.title ? event.title : 'Slot';
	const rawLabel = typeof props.label === 'string' ? props.label.trim() : '';
	const rawCategory = typeof props.categoryName === 'string' ? props.categoryName.trim() : '';
	const minutes = Math.max(0, Math.round((event.end.getTime() - event.start.getTime()) / 60_000));

	let state: string | null = null;
	if (props.kind === 'exceptional') state = 'One-off';
	else if (props.suppressed) state = 'Skipped this week';
	else if (props.active === false) state = 'Inactive';

	return {
		title,
		timeText: `${formatClock(event.start)} – ${formatClock(event.end)}`,
		durationText: formatGridDuration(minutes),
		categoryName: rawCategory || null,
		label: rawLabel && rawLabel !== title ? rawLabel : null,
		state
	};
}

/**
 * Grid options for the seven days starting at `fromStr`.
 *
 * `duration: { days: 7 }` rather than `{ weeks: 1 }` on purpose: a week-shaped
 * duration snaps the range back to `firstDay`, which would put already-elapsed
 * days on the left of a plan you can only act on going forward. Seven plain days
 * keeps the window anchored wherever the caller puts it.
 */
/**
 * How many days the grid shows at once.
 *
 * Seven columns need roughly 90px each before the titles turn into single
 * truncated words, so a phone gets one day rather than a squashed week. This is
 * the same grid with the same interactions — a day column at full width is
 * usable with a thumb, where a 50px one is not.
 */
export const GRID_DAYS_DESKTOP = 7;
export const GRID_DAYS_MOBILE = 1;

export function baseGridOptions(
	fromStr: string,
	opts: {
		slotHeight?: number;
		days?: number;
		month?: boolean;
		minTime?: string;
		maxTime?: string;
		/** A phone: the column headers get one letter rather than three. */
		narrow?: boolean;
		/**
		 * Today, in the account's own zone, as `YYYY-MM-DD`.
		 *
		 * The grid can be walked backwards now, so it has to be able to say
		 * which of the columns it is drawing have already happened.
		 */
		today?: string;
		/**
		 * What became of one occurrence, for a day that has been.
		 *
		 * `null` for a day still ahead, and for a block that has no occurrence
		 * on that date at all. The grid draws the plan; this is the only place
		 * it says anything about what was actually done.
		 */
		markOf?: (kind: string, refId: number, date: string) => 'done' | 'undone' | null;
	} = {}
): Calendar.Options {
	const slotHeight = opts.slotHeight ?? GRID_ZOOM_LEVELS[GRID_DEFAULT_ZOOM_INDEX];
	const days = opts.days ?? GRID_DAYS_DESKTOP;
	const minTime = opts.minTime ?? GRID_MIN_TIME;
	const maxTime = opts.maxTime ?? GRID_MAX_TIME;

	// A month is a different question: not "when today" but "how does this month
	// look". Times stop mattering, so it is a day grid rather than a time grid.
	const month = opts.month === true;
	const narrow = opts.narrow === true;
	const today = opts.today ?? '';
	const markOf = opts.markOf;

	/** A block's own date, in the same `YYYY-MM-DD` the server speaks. */
	const dateOf = (start: Date) =>
		`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(
			start.getDate()
		).padStart(2, '0')}`;

	/**
	 * The corner mark: a tick for done, an empty box for not.
	 *
	 * Only where there is an answer — a day that has happened, and an
	 * occurrence that exists. A box on every block of next week would be a
	 * hundred unticked boxes for things nobody has had the chance to do.
	 */
	const markHtml = (info: { event: GridEventLike }) => {
		if (!markOf) return '';
		const props = (info.event.extendedProps ?? {}) as { kind?: string; refId?: number };
		if (!props.kind || typeof props.refId !== 'number') return '';
		const mark = markOf(props.kind, props.refId, dateOf(info.event.start));
		if (!mark) return '';
		return `<span class="ec-event-mark ec-event-mark--${mark}" aria-hidden="true">${
			mark === 'done' ? '✓' : '☐'
		}</span>`;
	};

	/*
	 * Every key is present in both shapes, always.
	 *
	 * The calendar diffs the options object it is handed against the last one
	 * and applies what changed — so a key that is merely *absent* keeps whatever
	 * it was set to before. Returning a month object without `duration` left the
	 * week's `{ days: 7 }` in place, and switching to Month gave a day grid one
	 * week wide until the page was reloaded.
	 */
	return {
		view: month ? 'dayGridMonth' : days === 1 ? 'timeGridDay' : 'timeGridWeek',
		// What the month view would set for itself; stated here so it survives
		// arriving from the week.
		duration: month ? { months: 1 } : { days },
		date: parseLocalDate(fromStr),
		firstDay: 1,
		height: '100%',
		headerToolbar: { start: '', center: '', end: '' },
		eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
		// A month cell is one line tall whatever the zoom, so it stacks and then
		// says "+2 more" instead of measuring.
		dayMaxEvents: month,
		allDaySlot: false,
		slotMinTime: minTime,
		slotMaxTime: maxTime,
		slotDuration: GRID_SLOT_DURATION,
		snapDuration: GRID_SNAP_DURATION,
		slotHeight,
		scrollTime: minTime,
		nowIndicator: !month,
		// 24-hour, matching every other time in the app — the board and the
		// tracker both read 07:00. It is also narrower, which is what lets the
		// hour gutter shrink on a phone.
		slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
		/*
		 * A month cell says what, not when.
		 *
		 * The calendar prefixes every day-grid event with its start time, which is
		 * a third of the width of a narrow cell spent on something the order
		 * already tells you. Dropping it is most of what makes a month readable.
		 */
		/*
		 * What a block says about itself.
		 *
		 * It used to say only its name, and a name is not the question somebody
		 * has when they look at a grid — the position says roughly when, and
		 * "roughly" is exactly why the eye goes back for a second look at
		 * anything not starting on an hour line. So the time goes under the
		 * title wherever there is room for a second line, in the same 24-hour
		 * reading as the gutter.
		 *
		 * Three tiers by height: name and time, name alone, nothing. The last is
		 * not a failure — a fifteen-minute block at the tightest zoom is eight
		 * pixels tall, and a clipped word in it is worse than a clean bar you
		 * can hover.
		 */
		eventContent: month
			? (info) => info.event.title
			: (info) => {
					const mark = markHtml(info as { event: GridEventLike });
					if (!eventFitsText(info.event, slotHeight)) {
						return mark ? { html: mark } : '';
					}
					const title = escapeHtml(String(info.event.title ?? ''));
					if (!eventFitsTime(info.event, slotHeight)) {
						// The plain string when there is nothing to add to it: that is
						// what the calendar draws with the least ceremony.
						return mark ? { html: `<span class="ec-event-title">${title}</span>${mark}` } : title;
					}
					return {
						html:
							`<span class="ec-event-title">${title}</span>` +
							`<span class="ec-event-time">${escapeHtml(clockRange(info.event))}</span>` +
							mark
					};
				},
		/*
		 * A day that has already happened is drawn quieter than one that has not.
		 *
		 * The library has no class for "past", and the app can now walk the grid
		 * backwards — so the wash is a element the day cell draws for itself.
		 * Today is not past: it is the day being lived.
		 */
		dayCellContent: today
			? (info: { date: Date }) => {
					// The wash AND, in the month alone, the number: this content
					// replaces the library's default day number, so leaving the
					// number out is how the month lost its dates — and putting it
					// in unconditionally is how the week and the day grew one they
					// never had. Their headers already say the date.
					const wash = dateOf(info.date) < today ? '<span class="og-past"></span>' : '';
					if (month) return { html: wash + String(info.date.getDate()) };
					return wash ? { html: wash } : '';
				}
			: undefined,
		/*
		 * A week of columns on a phone has about fifty pixels each, and "Wed" does
		 * not fit — the header read "31 M…", "2 W…", which is neither the date nor
		 * the day. `weekday: 'narrow'` is the single letter every locale defines
		 * for exactly this.
		 *
		 * Two explicit lines rather than one string left to wrap where it likes:
		 * "31 M" wraps after the number and "1 T" does not, so a week containing a
		 * month boundary had some columns one line tall and some two, and the
		 * whole row sat at different heights. The break is decided here and the
		 * CSS honours it (`white-space: pre-line`).
		 */
		dayHeaderFormat: month
			? { weekday: 'short' }
			: days === 1
				? { weekday: 'long', day: 'numeric', month: 'short' }
				: narrow
					? (date: Date) =>
							`${date.getDate()}\n${date.toLocaleDateString(undefined, { weekday: 'narrow' })}`
					: { weekday: 'short', day: 'numeric' }
	};
}

/** A `YYYY-MM-DD` shifted by whole days, staying a civil date. */
export function addDaysStr(date: string, days: number): string {
	const d = parseLocalDate(date);
	d.setDate(d.getDate() + days);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'HH:MM' or 'HH:MM:SS' as minutes past midnight. */
export function timeToMinutes(time: string): number {
	const [h, m] = time.split(':').map(Number);
	return h * 60 + (m || 0);
}

/** Minutes past midnight as 'HH:MM', clamped to a real time of day. */
export function minutesToTime(minutes: number): string {
	const clamped = Math.min(Math.max(minutes, 0), 23 * 60 + 59);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

/**
 * Bills that want paying, as all-day events on the grid.
 *
 * Drawn from the bills themselves rather than from tasks: a bill that spawned
 * a task would be two rows somebody has to keep in step, and the day they
 * disagree the money is wrong. An unpaid one wears the finance accent; a paid
 * one goes quiet and struck through, so a week reads as "what is left".
 */
export function buildBillEvents(
	dues: {
		billId: number;
		name: string;
		date: string;
		dueDate: string;
		period: string;
		paid: boolean;
	}[],
	accent: string
): Calendar.EventInput[] {
	return dues.map((due) => ({
		id: `bill:${due.billId}:${due.period}`,
		start: parseLocalDate(due.date),
		// All-day events still need an end; one day wide.
		end: new Date(parseLocalDate(due.date).getTime() + 86400000),
		allDay: true,
		title: due.paid ? `${due.name} — paid` : `Pay ${due.name}`,
		backgroundColor: 'transparent',
		textColor: due.paid ? '#6b7280' : accent,
		borderColor: due.paid ? '#9ca3af' : accent,
		editable: false,
		startEditable: false,
		durationEditable: false,
		classNames: ['og-event', 'og-event--bill', ...(due.paid ? ['og-event--bill-paid'] : [])],
		extendedProps: {
			kind: 'bill',
			billId: due.billId,
			period: due.period,
			dueDate: due.dueDate,
			paid: due.paid
		}
	}));
}
