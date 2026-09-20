import { describe, expect, test } from 'vitest';
import { placesInRoom, roomOf, stepWithinRoom } from '../src/lib/rooms';
import { DESTINATIONS } from '../src/lib/destinations';

/**
 * Sideways within a room.
 *
 * `J` and `K` walk the rooms; `H` and `L` walk the places inside the one you
 * are in. The point of deriving it from the addresses is that a place added
 * under an existing room answers to the keys without anybody wiring it up —
 * so the test worth having is that the derivation keeps agreeing with the
 * destination list, not that today's rooms contain today's places.
 */
describe('the places inside a room', () => {
	test('come off the path, not off the menu heading', () => {
		// `/notebooks/ideas` is grouped under "Writing" and is still inside
		// Notebooks by its address, which is what somebody pressing a key means.
		const places = placesInRoom('/notebooks').map((d) => d.href);
		expect(places).toContain('/notebooks/ideas');
		expect(places).toContain('/notebooks/diary');
		expect(places).toContain('/notebooks');
	});

	test('a room nobody is in has none', () => {
		expect(placesInRoom('/')).toEqual([]);
		expect(roomOf('/')).toBe('');
	});

	test('every destination is inside the room its address names', () => {
		for (const d of DESTINATIONS) {
			if (roomOf(d.href) === '') continue;
			expect(placesInRoom(d.href).map((p) => p.href)).toContain(d.href);
		}
	});
});

describe('stepping sideways', () => {
	test('goes to the next place and wraps at the end', () => {
		const tasks = placesInRoom('/tasks').map((d) => d.href);
		expect(tasks.length).toBeGreaterThan(1);

		const first = tasks[0];
		const second = tasks[1];
		expect(stepWithinRoom(first, 1)).toBe(second);
		expect(stepWithinRoom(second, -1)).toBe(first);
		expect(stepWithinRoom(tasks[tasks.length - 1], 1)).toBe(first);
		expect(stepWithinRoom(first, -1)).toBe(tasks[tasks.length - 1]);
	});

	test('a room with one place in it goes nowhere', () => {
		// Goals is its own room and has no siblings; the keys should do nothing
		// rather than land somewhere the person did not ask for.
		expect(placesInRoom('/goals')).toHaveLength(1);
		expect(stepWithinRoom('/goals', 1)).toBeNull();
	});

	test('a deeper address still knows which place it is in', () => {
		// `/notebooks/12` is a notebook being read, and stepping from it should
		// leave Notebooks' own entry rather than give up.
		const from = stepWithinRoom('/notebooks/12', 1);
		expect(from).not.toBeNull();
		expect(from).not.toBe('/notebooks/12');
	});

	test('the longest match wins, so a prefix does not swallow its children', () => {
		// `/notebooks` is a prefix of `/notebooks/diary`. Stepping from the
		// diary must move from the diary, not from Notebooks.
		const places = placesInRoom('/notebooks').map((d) => d.href);
		const at = places.indexOf('/notebooks/diary');
		expect(at).toBeGreaterThan(-1);
		expect(stepWithinRoom('/notebooks/diary', 1)).toBe(places[(at + 1) % places.length]);
	});

	test('a place the account has hidden is not walked onto', () => {
		const withDiary = placesInRoom('/notebooks').map((d) => d.href);
		const withoutDiary = placesInRoom('/notebooks', ['diary']).map((d) => d.href);
		expect(withDiary).toContain('/notebooks/diary');
		expect(withoutDiary).not.toContain('/notebooks/diary');
	});

	test('a path that is nowhere on the list does not guess', () => {
		expect(stepWithinRoom('/nowhere/at/all', 1)).toBeNull();
	});
});
