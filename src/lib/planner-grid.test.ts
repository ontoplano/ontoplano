import { describe, expect, test } from 'vitest';
import { baseGridOptions, blockName, hourToTime, windowForEvents } from './planner-grid';

/**
 * What a block is called. The rule got this wrong once and a goal picker
 * printed "block 47" for every block nobody had labelled, which is most of
 * them.
 */
describe('naming a block', () => {
	test('an activity block is its activity', () => {
		expect(
			blockName({ mode: 'activity', activityName: 'swimming', label: 'x', categoryName: 'health' })
		).toBe('swimming');
	});

	test('a label is used when there is no activity', () => {
		expect(
			blockName({ mode: 'category', activityName: null, label: 'deep work', categoryName: 'work' })
		).toBe('deep work');
	});

	test('with no label it is the category', () => {
		expect(
			blockName({ mode: 'category', activityName: null, label: '', categoryName: 'work' })
		).toBe('work');
	});

	test('and never an id', () => {
		expect(blockName({ mode: 'category', activityName: null, label: '', categoryName: null })).toBe(
			'Untitled'
		);
	});
});

describe('grid hours', () => {
	test('a whole hour becomes a clock time', () => {
		expect(hourToTime(6)).toBe('06:00:00');
		expect(hourToTime(24)).toBe('24:00:00');
	});
});

/**
 * The window has to hold what is on it.
 *
 * A block outside the chosen hours does not scroll off the edge of the grid —
 * it is not drawn at all, and the day reads as free. Every case below is a way
 * to end up with one: dragged above the first line, created at 04:00 from the
 * form, or arriving in a subscribed calendar from another timezone.
 */
describe('the stretch of day the grid draws', () => {
	const at = (date: string) => new Date(date);
	const asked = { start: 6, end: 22 };

	test('is the one asked for when everything fits inside it', () => {
		expect(
			windowForEvents(asked, [{ start: at('2026-09-02T09:00:00'), end: at('2026-09-02T10:30:00') }])
		).toEqual({ start: 6, end: 22 });
	});

	test('reaches down to the earliest thing on it', () => {
		expect(
			windowForEvents(asked, [
				{ start: at('2026-09-02T04:15:00'), end: at('2026-09-02T05:00:00') },
				{ start: at('2026-09-02T09:00:00'), end: at('2026-09-02T10:00:00') }
			])
		).toEqual({ start: 4, end: 22 });
	});

	test('and up past the latest, rounding to the hour that contains it', () => {
		// 23:30 needs the hour it sits in, not the line above it.
		expect(
			windowForEvents(asked, [{ start: at('2026-09-02T23:00:00'), end: at('2026-09-02T23:30:00') }])
		).toEqual({ start: 6, end: 24 });
	});

	test('gives a block that runs past midnight the rest of the day', () => {
		expect(
			windowForEvents(asked, [{ start: at('2026-09-02T22:00:00'), end: at('2026-09-03T01:00:00') }])
		).toEqual({ start: 6, end: 24 });
	});

	test('ignores all-day events, which have no hour to make room for', () => {
		expect(
			windowForEvents(asked, [
				{ start: at('2026-09-02T00:00:00'), end: at('2026-09-03T00:00:00'), allDay: true }
			])
		).toEqual(asked);
	});

	test('never narrows to what happens to be on the day', () => {
		// An empty Tuesday still shows the hours somebody chose to see.
		expect(windowForEvents(asked, [])).toEqual(asked);
		expect(
			windowForEvents(asked, [{ start: at('2026-09-02T12:00:00'), end: at('2026-09-02T13:00:00') }])
		).toEqual(asked);
	});

	test('survives an event with nothing usable in it', () => {
		expect(
			windowForEvents(asked, [{ start: 'not a date' }, {}, { start: at('2026-09-02T05:00:00') }])
		).toEqual({ start: 5, end: 22 });
	});
});

/**
 * Looking backwards: what happened, drawn on the plan.
 *
 * The grid can be walked into last week now, and a week that has been is not
 * the same thing as a week that has not: its days are drawn quieter and each
 * block says whether it was done. Both come out of `baseGridOptions`, which is
 * where a page hands it today and a way to ask about an occurrence.
 */
describe('a week that has already happened', () => {
	const at = (iso: string) => new Date(iso);
	const event = (kind: string, refId: number, iso: string) => ({
		event: {
			title: 'deep work',
			start: at(iso),
			end: at(iso.replace('T09', 'T12')),
			extendedProps: { kind, refId }
		}
	});

	const options = baseGridOptions('2026-08-28', {
		today: '2026-09-04',
		markOf: (kind, refId, date) => {
			if (date > '2026-09-04') return null;
			if (kind === 'slot' && refId === 1) return date === '2026-08-31' ? 'done' : 'undone';
			return null;
		}
	});

	const html = (content: unknown) =>
		typeof content === 'string' ? content : ((content as { html: string }).html ?? '');

	test('a block that was done carries a tick', () => {
		const drawn = html(
			(options.eventContent as (i: unknown) => unknown)(event('slot', 1, '2026-08-31T09:00:00'))
		);
		expect(drawn).toContain('✓');
		expect(drawn).toContain('deep work');
	});

	test('and one that was not carries an empty box', () => {
		const drawn = html(
			(options.eventContent as (i: unknown) => unknown)(event('slot', 1, '2026-09-01T09:00:00'))
		);
		expect(drawn).toContain('☐');
	});

	test('a block nobody has an answer about carries nothing', () => {
		const drawn = html(
			(options.eventContent as (i: unknown) => unknown)(event('slot', 9, '2026-09-01T09:00:00'))
		);
		expect(drawn).not.toContain('☐');
		expect(drawn).not.toContain('✓');
	});

	test('a day that has been is washed, and today is not', () => {
		const cell = options.dayCellContent as (i: { date: Date }) => unknown;
		expect(html(cell({ date: at('2026-09-01T00:00:00') }))).toContain('og-past');
		// No number outside the month view: the week's header already says the
		// date, and the number briefly leaked onto every timeGrid column.
		expect(html(cell({ date: at('2026-09-01T00:00:00') }))).not.toContain('1');
		expect(html(cell({ date: at('2026-09-04T00:00:00') }))).toBe('');
		expect(html(cell({ date: at('2026-09-05T00:00:00') }))).toBe('');
	});

	test('the month numbers every day, wash or no wash', () => {
		const monthly = baseGridOptions('2026-08-31', { month: true, today: '2026-09-05' });
		const cell = monthly.dayCellContent as (i: { date: Date }) => unknown;
		// This content REPLACES the library's own day number, so it has to
		// carry one — the month view once lost its dates to a wash-only span.
		const past = html(cell({ date: at('2026-09-01T00:00:00') }));
		expect(past).toContain('og-past');
		expect(past).toContain('1');
		expect(html(cell({ date: at('2026-09-07T00:00:00') }))).toBe('7');
	});

	test('a grid that was never told today washes nothing', () => {
		expect(baseGridOptions('2026-08-28').dayCellContent).toBeUndefined();
	});
});
