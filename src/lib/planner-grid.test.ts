import { describe, expect, test } from 'vitest';
import { blockName, hourToTime, windowForEvents } from './planner-grid';

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
			windowForEvents(asked, [
				{ start: at('2026-09-02T09:00:00'), end: at('2026-09-02T10:30:00') }
			])
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
			windowForEvents(asked, [
				{ start: at('2026-09-02T23:00:00'), end: at('2026-09-02T23:30:00') }
			])
		).toEqual({ start: 6, end: 24 });
	});

	test('gives a block that runs past midnight the rest of the day', () => {
		expect(
			windowForEvents(asked, [
				{ start: at('2026-09-02T22:00:00'), end: at('2026-09-03T01:00:00') }
			])
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
			windowForEvents(asked, [
				{ start: at('2026-09-02T12:00:00'), end: at('2026-09-02T13:00:00') }
			])
		).toEqual(asked);
	});

	test('survives an event with nothing usable in it', () => {
		expect(
			windowForEvents(asked, [{ start: 'not a date' }, {}, { start: at('2026-09-02T05:00:00') }])
		).toEqual({ start: 5, end: 22 });
	});
});
