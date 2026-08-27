import { describe, expect, test } from 'vitest';
import { blockName, hourToTime } from './planner-grid';

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
