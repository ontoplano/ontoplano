/**
 * The arithmetic behind the planner.
 *
 * This is the part of the app that is worth the most and was tested the least:
 * everything the week grid draws goes through here, and all of it is pure —
 * a weekly block plus a date becomes a rectangle, a colour becomes readable
 * text on it, a drag becomes a new weekday and time.
 *
 * The failures worth pinning are the quiet ones. A block projected onto the
 * wrong day, a month view drawing one week, a drag that rounds a 09:00 block
 * to 08:59 — none of them throw, and all of them are wrong on screen in a way
 * somebody only notices after trusting it.
 */
import { describe, expect, test } from 'vitest';
import {
	addDaysStr,
	baseGridOptions,
	GRID_ZOOM_LEVELS,
	GRID_DEFAULT_ZOOM_INDEX,
	blockName,
	buildExceptionalEvents,
	buildSlotEvents,
	buildSlotEventsForDates,
	buildSubscribedEvents,
	blockHue,
	dateToWeekday,
	decodeEventId,
	describeGridEvent,
	encodeEventId,
	eventFitsText,
	formatClock,
	formatGridDuration,
	formatLocalDate,
	GRID_MIN_TEXT_PX,
	GRID_SLOT_MINUTES,
	hourToTime,
	minutesToTime,
	placementFromDates,
	timeToMinutes,
	weekdayToDate
} from '../src/lib/planner-grid';

const CATEGORIES = [
	{ id: 1, name: 'Work', color: '#1d4ed8' },
	{ id: 2, name: 'Rest', color: '#fef08a' }
];

/** A Monday. Every date in this file is anchored to it. */
const MONDAY = '2026-08-17';

function aSlot(over: Record<string, unknown> = {}) {
	return {
		id: 10,
		weekday: 0,
		startTime: '09:00',
		durationMinutes: 60,
		mode: 'category' as const,
		categoryId: 1,
		activityId: null,
		activityName: null,
		activityCategoryId: null,
		categoryName: 'Work',
		label: null,
		active: true,
		...over
	};
}

describe('naming a block', () => {
	test('an activity is called what the activity is called', () => {
		expect(
			blockName({ mode: 'activity', activityName: 'Deep work', label: 'x', categoryName: 'Work' })
		).toBe('Deep work');
	});

	test('a block that only names a category is that category', () => {
		expect(
			blockName({ mode: 'category', activityName: null, label: null, categoryName: 'Work' })
		).toBe('Work');
	});

	test('a typed label is the exception, and beats the category', () => {
		expect(
			blockName({ mode: 'category', activityName: null, label: 'Standup', categoryName: 'Work' })
		).toBe('Standup');
	});

	test('and something with no name at all is not called "block 47"', () => {
		expect(
			blockName({ mode: 'category', activityName: null, label: null, categoryName: null })
		).toBe('Untitled');
	});
});

describe('an id that survives a round trip through the DOM', () => {
	test('goes out and comes back', () => {
		expect(decodeEventId(encodeEventId('slot', 42))).toEqual({ kind: 'slot', refId: 42 });
		expect(decodeEventId(encodeEventId('exceptional', 7))).toEqual({
			kind: 'exceptional',
			refId: 7
		});
	});

	test('and anything else decodes to nothing rather than a wrong block', () => {
		// This id decides which row a drag writes to. Guessing is the one thing
		// it must not do.
		expect(decodeEventId('ics:abc-123')).toBeNull();
		expect(decodeEventId('slot')).toBeNull();
		expect(decodeEventId('slot:notanumber')).toBeNull();
		expect(decodeEventId('unknown:5')).toBeNull();
		expect(decodeEventId(12)).toBeNull();
	});
});

describe('putting a weekly block on a date', () => {
	test('Monday-indexed, so Sunday is the last column and not the first', () => {
		expect(dateToWeekday(new Date('2026-08-17T00:00:00'))).toBe(0); // Monday
		expect(dateToWeekday(new Date('2026-08-23T00:00:00'))).toBe(6); // Sunday
	});

	test('lands on the right day of the window', () => {
		expect(formatLocalDate(weekdayToDate(MONDAY, 0))).toBe('2026-08-17');
		expect(formatLocalDate(weekdayToDate(MONDAY, 6))).toBe('2026-08-23');
	});

	test('and on a window that does not start on a Monday, stays inside it', () => {
		// The window is seven consecutive days, so it holds every weekday once:
		// the projection is the first occurrence at or after the start.
		const from = '2026-08-19'; // a Wednesday
		for (let weekday = 0; weekday < 7; weekday++) {
			const landed = weekdayToDate(from, weekday);
			expect(dateToWeekday(landed)).toBe(weekday);
			expect(formatLocalDate(landed) >= from).toBe(true);
			expect(formatLocalDate(landed) <= addDaysStr(from, 6)).toBe(true);
		}
	});

	test('a block becomes a rectangle at the time it says', () => {
		const [event] = buildSlotEvents([aSlot()], MONDAY, CATEGORIES);

		expect(formatLocalDate(event.start as Date)).toBe('2026-08-17');
		expect(formatClock(event.start as Date)).toBe('09:00');
		expect(formatClock(event.end as Date)).toBe('10:00');
		expect(event.title).toBe('Work');
		// The hue reaches the element as a custom property, not as a background:
		// what is done with it depends on the theme. See `blockHue`.
		expect(event.styles).toEqual(['--block:#1d4ed8']);
	});

	test('one that crosses noon or midday keeps its length', () => {
		const [event] = buildSlotEvents(
			[aSlot({ startTime: '23:00', durationMinutes: 90 })],
			MONDAY,
			CATEGORIES
		);
		expect(formatClock(event.end as Date)).toBe('00:30');
		expect(formatLocalDate(event.end as Date)).toBe('2026-08-18');
	});

	test('takes its colour from the activity when it has no category of its own', () => {
		const [event] = buildSlotEvents(
			[aSlot({ categoryId: null, activityCategoryId: 2, mode: 'activity', activityName: 'Nap' })],
			MONDAY,
			CATEGORIES
		);
		expect(event.styles).toEqual(['--block:#fef08a']);
		expect(event.extendedProps?.categoryName).toBe('Rest');
	});

	test('and falls back to a colour rather than drawing nothing', () => {
		const [event] = buildSlotEvents(
			[aSlot({ categoryId: 999, activityCategoryId: null })],
			MONDAY,
			CATEGORIES
		);
		expect(event.styles?.[0]).toMatch(/^--block:/);
		expect(event.extendedProps?.categoryName).toBeNull();
	});
});

describe('a block that is not happening', () => {
	test('an inactive one is drawn faded but can still be moved', () => {
		const [event] = buildSlotEvents([aSlot({ active: false })], MONDAY, CATEGORIES);
		expect(event.classNames).toContain('og-event--inactive');
		expect(event.editable).toBe(true);
	});

	test('one skipped for this week cannot be dragged anywhere', () => {
		// It is a stand-in for something that is not happening, so there is
		// nowhere meaningful to drag it to.
		const [event] = buildSlotEvents([aSlot()], MONDAY, CATEGORIES, {
			suppressedSlotIds: new Set([10])
		});

		expect(event.editable).toBe(false);
		expect(event.classNames).toContain('og-event--inactive');
		expect(event.extendedProps?.suppressed).toBe(true);
	});
});

describe('a one-off', () => {
	test('sits on its own date and is marked as one', () => {
		const [event] = buildExceptionalEvents(
			[
				{
					id: 3,
					date: '2026-08-19',
					startTime: '14:00',
					durationMinutes: 45,
					mode: 'category',
					categoryId: 1,
					activityId: null,
					activityName: null,
					activityCategoryId: null,
					categoryName: 'Work',
					label: 'Dentist',
					status: undefined,
					active: true
				}
			],
			CATEGORIES
		);

		expect(formatLocalDate(event.start as Date)).toBe('2026-08-19');
		expect(formatClock(event.end as Date)).toBe('14:45');
		expect(event.title).toBe('Dentist');
		expect(event.classNames).toContain('og-event--exceptional');
		expect(event.editable).toBe(true);
	});
});

describe("somebody else's calendar", () => {
	const subscribed = () =>
		buildSubscribedEvents([
			{
				uid: 'abc-123',
				summary: 'Standup',
				start: '2026-08-17T09:00:00.000Z',
				end: '2026-08-17T09:15:00.000Z',
				allDay: false,
				color: '#666666',
				feedName: 'Work calendar'
			}
		]);

	test('is drawn outlined rather than filled, and says whose it is', () => {
		const [event] = subscribed();
		expect(event.backgroundColor).toBe('transparent');
		// `borderColor` is not in the calendar's own EventInput type, though it
		// reads it — the outline is the whole rendering, so it is asserted anyway.
		expect((event as { borderColor?: string }).borderColor).toBe('#666666');
		expect(event.extendedProps?.feedName).toBe('Work calendar');
	});

	test('and cannot be moved in any direction', () => {
		// Dragging one would be a lie the moment the next fetch overwrote it.
		const [event] = subscribed();
		expect(event.editable).toBe(false);
		expect(event.startEditable).toBe(false);
		expect(event.durationEditable).toBe(false);
	});

	test('its id can never be mistaken for one of ours', () => {
		expect(decodeEventId(subscribed()[0].id as string)).toBeNull();
	});
});

describe('a month of weekly blocks', () => {
	const month = () => {
		// Five weeks of dates, as the calendar itself lays them out.
		const dates = Array.from({ length: 35 }, (_, i) => addDaysStr(MONDAY, i));
		return buildSlotEventsForDates([aSlot()], dates, CATEGORIES);
	};

	test('draws the block on every week it appears in', () => {
		expect(month()).toHaveLength(5);
	});

	test('on the same weekday each time, a week apart', () => {
		const days = month().map((e) => formatLocalDate(e.start as Date));
		expect(days).toEqual(['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14']);
	});
});

describe('dragging a block', () => {
	test('becomes the weekday and time it was dropped on', () => {
		const placement = placementFromDates(
			new Date('2026-08-19T14:30:00'),
			new Date('2026-08-19T15:30:00')
		);
		expect(placement).toEqual({ weekday: 2, startTime: '14:30', durationMinutes: 60 });
	});

	test('never becomes a block of no length', () => {
		// A resize that collapses to nothing would write a zero-minute row.
		const placement = placementFromDates(
			new Date('2026-08-19T14:30:00'),
			new Date('2026-08-19T14:30:00')
		);
		expect(placement.durationMinutes).toBe(15);
	});
});

describe('reading a block that is too short to show its own title', () => {
	const START = new Date('2026-08-17T09:00:00');
	const event = (minutes: number, props: Record<string, unknown> = {}) => ({
		title: 'Deep work',
		start: START,
		end: new Date(START.getTime() + minutes * 60_000),
		extendedProps: props
	});

	test('the hover card says when, how long, and what state it is in', () => {
		const detail = describeGridEvent(event(30, { categoryName: 'Work', active: true }));
		expect(detail.title).toBe('Deep work');
		expect(detail.timeText).toBe('09:00 – 09:30');
		expect(detail.durationText).toBe('30min');
		expect(detail.categoryName).toBe('Work');
		expect(detail.state).toBeNull();
	});

	test('a label that just repeats the title is not said twice', () => {
		expect(describeGridEvent(event(30, { label: 'Deep work' })).label).toBeNull();
		expect(describeGridEvent(event(30, { label: 'in the shed' })).label).toBe('in the shed');
	});

	test('and it names the state in words rather than by colour alone', () => {
		expect(describeGridEvent(event(30, { kind: 'exceptional' })).state).toBe('One-off');
		expect(describeGridEvent(event(30, { suppressed: true })).state).toBe('Skipped this week');
		expect(describeGridEvent(event(30, { active: false })).state).toBe('Inactive');
	});

	test('an event with no title of its own still describes something', () => {
		const nameless = { ...event(30), title: undefined };
		expect(describeGridEvent(nameless).title).toBe('Slot');
	});
});

describe('whether a block can show its title at all', () => {
	test('depends on how far it is zoomed in', () => {
		const half = {
			start: new Date('2026-08-17T09:00:00'),
			end: new Date('2026-08-17T09:15:00')
		};

		// A quarter-hour block is half a slot tall: it fits only once a slot is
		// twice the minimum text height.
		expect(eventFitsText(half, GRID_MIN_TEXT_PX * 2)).toBe(true);
		expect(eventFitsText(half, GRID_MIN_TEXT_PX)).toBe(false);
	});

	test('and a full slot fits whenever a slot is tall enough to read', () => {
		const full = {
			start: new Date('2026-08-17T09:00:00'),
			end: new Date(new Date('2026-08-17T09:00:00').getTime() + GRID_SLOT_MINUTES * 60_000)
		};
		expect(eventFitsText(full, GRID_MIN_TEXT_PX)).toBe(true);
	});
});

describe('the grid the calendar is handed', () => {
	test('a week is seven days anchored where the caller put it', () => {
		const options = baseGridOptions(MONDAY);
		expect(options.view).toBe('timeGridWeek');
		// `{ days: 7 }` and not `{ weeks: 1 }`: a week-shaped duration snaps back
		// to firstDay and puts elapsed days on the left of a plan.
		expect(options.duration).toEqual({ days: 7 });
		expect(formatLocalDate(options.date as Date)).toBe(MONDAY);
	});

	test('a phone gets one full-width day rather than seven squashed ones', () => {
		expect(baseGridOptions(MONDAY, { days: 1 }).view).toBe('timeGridDay');
	});

	test('a month restates every key, so arriving from the week cannot leave one behind', () => {
		// Returning a month object without `duration` left the week's `{days: 7}`
		// in place, and Month drew a day grid one week wide until a reload.
		const week = baseGridOptions(MONDAY);
		const month = baseGridOptions(MONDAY, { month: true });

		for (const key of Object.keys(week)) expect(month, key).toHaveProperty(key);
		expect(month.view).toBe('dayGridMonth');
		expect(month.duration).toEqual({ months: 1 });
		expect(month.dayMaxEvents).toBe(true);
		expect(month.nowIndicator).toBe(false);
	});

	test('the week starts on Monday and shows the clock in 24 hours', () => {
		const options = baseGridOptions(MONDAY);
		expect(options.firstDay).toBe(1);
		expect(options.slotLabelFormat).toMatchObject({ hour12: false });
		expect(options.eventTimeFormat).toMatchObject({ hour12: false });
	});

	test('and it opens at the first hour it shows, whatever the account chose', () => {
		const options = baseGridOptions(MONDAY, { minTime: '05:00:00', maxTime: '22:00:00' });
		expect(options.slotMinTime).toBe('05:00:00');
		expect(options.slotMaxTime).toBe('22:00:00');
		expect(options.scrollTime).toBe('05:00:00');
	});
});

describe('the small conversions', () => {
	test('a stored hour becomes a time', () => {
		expect(hourToTime(6)).toBe('06:00:00');
		expect(hourToTime(24)).toBe('24:00:00');
	});

	test('a time becomes minutes and back', () => {
		expect(timeToMinutes('09:30')).toBe(570);
		expect(timeToMinutes('09:30:00')).toBe(570);
		expect(minutesToTime(570)).toBe('09:30');
	});

	test('and minutes past the end of a day stay a real time of day', () => {
		expect(minutesToTime(-30)).toBe('00:00');
		expect(minutesToTime(60 * 30)).toBe('23:59');
	});

	test('a duration reads the way somebody would say it', () => {
		expect(formatGridDuration(45)).toBe('45min');
		expect(formatGridDuration(60)).toBe('1h');
		expect(formatGridDuration(90)).toBe('1h 30min');
	});

	test('a date shifts by whole days and stays a civil date', () => {
		expect(addDaysStr('2026-08-31', 1)).toBe('2026-09-01');
		expect(addDaysStr('2026-01-01', -1)).toBe('2025-12-31');
		// Across a daylight-saving boundary it is still the next day, not 23 hours.
		expect(addDaysStr('2026-02-28', 1)).toBe('2026-03-01');
	});
});

/**
 * What a block renders, at the three heights it can be.
 *
 * `eventContent` is the only place the grid decides what fits, and it is
 * decided by arithmetic rather than by measuring — at mount the element has no
 * layout yet. So the arithmetic is what is checked, at the real zoom levels.
 */
describe('what a block shows', () => {
	const content = (durationMinutes: number, slotHeight: number, title = 'Deep work') => {
		const options = baseGridOptions(MONDAY, { slotHeight });
		const [event] = buildSlotEvents([aSlot({ durationMinutes, startTime: '09:00' })], MONDAY, [
			{ id: 1, name: 'Work', color: '#1d4ed8' }
		]);
		const render = options.eventContent as (info: { event: unknown }) => unknown;
		return render({ event: { ...event, title } });
	};

	test('its name and its time, when there is room for both', () => {
		const out = content(180, GRID_ZOOM_LEVELS[GRID_DEFAULT_ZOOM_INDEX]) as { html: string };
		expect(out.html).toContain('Deep work');
		// The same 24-hour reading as the gutter beside it.
		expect(out.html).toMatch(/09:00.*12:00/);
	});

	test('its name alone, when the second line will not fit', () => {
		// Half an hour at the default zoom is 24px: past the text threshold,
		// short of the one that buys a second line.
		expect(content(30, GRID_ZOOM_LEVELS[GRID_DEFAULT_ZOOM_INDEX])).toBe('Deep work');
	});

	test('nothing at all, when a word would be clipped', () => {
		expect(content(15, GRID_ZOOM_LEVELS[0])).toBe('');
	});

	test('a name with markup in it is text, not markup', () => {
		const out = content(180, GRID_ZOOM_LEVELS[GRID_DEFAULT_ZOOM_INDEX], '<img src=x onerror=1>');
		expect((out as { html: string }).html).not.toContain('<img');
		expect((out as { html: string }).html).toContain('&lt;img');
	});
});

/**
 * The hue reaching the element, and nothing else reaching it by accident.
 *
 * This string is concatenated into an inline `style` attribute, and the colour
 * in it comes from a category row somebody typed. A category named
 * `red;background:url(...)` must not become a declaration.
 */
describe('the colour handed to a block', () => {
	test('is a custom property carrying the hex', () => {
		expect(blockHue('#1d4ed8')).toBe('--block:#1d4ed8');
	});

	test('takes a colour with or without its hash, in either case', () => {
		expect(blockHue('1D4ED8')).toBe('--block:#1D4ED8');
	});

	test('refuses anything that is not one, and still draws something', () => {
		for (const bad of ['rebeccapurple', '', 'red;background:url(x)', '#1d4ed8;color:red']) {
			expect(blockHue(bad)).toBe('--block:var(--color-gray-400)');
		}
	});
});
