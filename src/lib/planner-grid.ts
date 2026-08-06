import type { Calendar } from '@event-calendar/core';
import { CATEGORY_FALLBACK_COLOR } from './colors.js';

export const GRID_MIN_TIME = '06:00:00';
export const GRID_MAX_TIME = '24:00:00';
export const GRID_SLOT_DURATION = '00:30:00';

export interface GridCategory {
	id: number;
	color?: string | null;
}

export interface GridSlotInput {
	id: number;
	weekday: number;
	startTime: string;
	durationMinutes: number;
	mode: 'category' | 'activity';
	categoryId: number | null;
	activityId: number | null;
	categoryName?: string | null;
	activityName?: string | null;
	label?: string | null;
	active: boolean;
}

export interface GridExceptionalInput {
	id: number;
	date: string;
	startTime: string;
	durationMinutes: number;
	mode: 'category' | 'activity';
	categoryId: number | null;
	activityId: number | null;
	categoryName?: string | null;
	activityName?: string | null;
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
	isWeekdayEditable?: (weekday: number) => boolean;
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
// a concrete date within the currently displayed week before rendering.
export function weekdayToDate(mondayStr: string, weekday: number): Date {
	const monday = parseLocalDate(mondayStr);
	return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + weekday);
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

export function contrastText(hex: string): string {
	const parsed = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!parsed) return '#111827';
	const int = parseInt(parsed[1], 16);
	const r = (int >> 16) & 0xff;
	const g = (int >> 8) & 0xff;
	const b = int & 0xff;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.6 ? '#111827' : '#ffffff';
}

function slotDisplayLabel(
	item: Pick<GridSlotInput, 'mode' | 'activityName' | 'label' | 'categoryName'>
): string {
	if (item.mode === 'activity' && item.activityName) return item.activityName;
	if (item.label) return item.label;
	if (item.categoryName) return item.categoryName;
	return 'Slot';
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
	const bg = categoryColor(categories, slot.categoryId);
	const suppressed = opts.suppressedSlotIds?.has(slot.id) ?? false;
	const inactive = !slot.active || suppressed;
	const editable = (opts.isWeekdayEditable?.(slot.weekday) ?? true) && !suppressed;

	const classNames = ['og-event'];
	if (inactive) classNames.push('og-event--inactive');

	return {
		id: encodeEventId('slot', slot.id),
		start,
		end,
		title: slotDisplayLabel(slot),
		backgroundColor: bg,
		textColor: contrastText(bg),
		editable,
		classNames,
		extendedProps: {
			kind: 'slot',
			refId: slot.id,
			mode: slot.mode,
			categoryId: slot.categoryId,
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
	const bg = categoryColor(categories, exc.categoryId);

	return {
		id: encodeEventId('exceptional', exc.id),
		start,
		end,
		title: slotDisplayLabel(exc),
		backgroundColor: bg,
		textColor: contrastText(bg),
		editable: false,
		classNames: ['og-event', 'og-event--exceptional'],
		extendedProps: {
			kind: 'exceptional',
			refId: exc.id,
			mode: exc.mode,
			categoryId: exc.categoryId,
			activityId: exc.activityId,
			label: exc.label ?? '',
			status: exc.status ?? ''
		}
	};
}

export function buildSlotEvents(
	slots: GridSlotInput[],
	mondayStr: string,
	categories: GridCategory[],
	opts: BuildEventsOptions = {}
): Calendar.EventInput[] {
	return slots.map((s) => slotToEvent(s, mondayStr, categories, opts));
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

export function baseWeekGridOptions(mondayStr: string): Calendar.Options {
	return {
		view: 'timeGridWeek',
		date: parseLocalDate(mondayStr),
		firstDay: 1,
		allDaySlot: false,
		slotMinTime: GRID_MIN_TIME,
		slotMaxTime: GRID_MAX_TIME,
		slotDuration: GRID_SLOT_DURATION,
		scrollTime: GRID_MIN_TIME,
		nowIndicator: true,
		height: '100%',
		headerToolbar: { start: '', center: '', end: '' },
		dayHeaderFormat: { weekday: 'short', day: 'numeric' }
	};
}
