/**
 * The capture wheel's settings: which wedges, in what order, and the notebook
 * its forms start in.
 *
 * Read leniently, because a stored answer outlives the kinds it names; written
 * strictly, because a wheel with no wedges is a button that does nothing and a
 * notebook somebody else owns is not somewhere this account can file things.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let capture: typeof import('../src/lib/capture-settings');
let kinds: readonly string[];
let preferences: typeof import('../src/lib/services/preferences');
let settings: typeof import('../src/lib/services/settings');
let notebooks: typeof import('../src/lib/services/notebooks');
const now = new Date('2026-09-27T09:00:00Z');
const mine = { userId: OWNER, now, tz: 'UTC' };
const theirs = { userId: STRANGER, now, tz: 'UTC' };

beforeAll(async () => {
	capture = await import('../src/lib/capture-settings');
	kinds = (await import('../src/lib/capture')).CAPTURE_KINDS;
	preferences = await import('../src/lib/services/preferences');
	settings = await import('../src/lib/services/settings');
	notebooks = await import('../src/lib/services/notebooks');
});

describe('reading what is stored', () => {
	test('nothing stored is every wedge, in the app order, and no notebook', () => {
		expect(capture.parseCaptureSettings(null)).toEqual({
			notebookId: null,
			order: [...kinds],
			off: []
		});
		expect(capture.parseCaptureSettings('not json')).toEqual(capture.DEFAULT_CAPTURE_SETTINGS);
	});

	test('drops kinds it does not know, and keeps the order of the ones it does', () => {
		const read = capture.parseCaptureSettings(
			JSON.stringify({ notebookId: 4, order: ['buy', 'hologram', 'idea'], off: ['fax', 'idea'] })
		);
		expect(read.notebookId).toBe(4);
		expect(read.order.slice(0, 2)).toEqual(['buy', 'idea']);
		expect(read.order).not.toContain('hologram');
		// A kind the stored order never named still turns up, after the rest.
		expect([...read.order].sort()).toEqual([...kinds].sort());
		expect(read.off).toEqual(['idea']);
	});

	test('reads every wedge off as none off', () => {
		const read = capture.parseCaptureSettings(JSON.stringify({ order: kinds, off: kinds }));
		expect(read.off).toEqual([]);
	});

	test('the wheel draws the ticked ones in order, and falls back rather than opening empty', () => {
		const set = { notebookId: null, order: ['note', 'todo', ...kinds], off: ['idea', 'buy'] };
		expect(capture.wheelKinds(set, kinds).slice(0, 2)).toEqual(['note', 'todo']);
		expect(capture.wheelKinds(set, kinds)).not.toContain('idea');
		// Only `buy` on, and its room hidden: every available kind rather than none.
		const lonely = { notebookId: null, order: [...kinds], off: kinds.filter((k) => k !== 'buy') };
		expect(capture.wheelKinds(lonely, ['idea', 'todo'])).toEqual(['idea', 'todo']);
	});

	test('the notebook on screen wins over the chosen one', () => {
		const set = { ...capture.DEFAULT_CAPTURE_SETTINGS, notebookId: 3 };
		expect(capture.startingNotebook(set, { id: '/', params: {} })).toBe(3);
		expect(capture.startingNotebook(set, { id: '/notebooks/[id]', params: { id: '8' } })).toBe(8);
		// The shelf opens a notebook in place and names it in the address.
		const shelf = (query: string) =>
			capture.startingNotebook(set, {
				id: '/notebooks',
				params: {},
				search: new URLSearchParams(query)
			});
		expect(shelf('notebook=5')).toBe(5);
		expect(shelf('')).toBe(3);
		expect(
			capture.startingNotebook(capture.DEFAULT_CAPTURE_SETTINGS, { id: '/', params: {} })
		).toBe(null);
	});
});

describe('saving', () => {
	test('keeps the order, the ticks and an own notebook', () => {
		const id = notebooks.createNotebook(mine, { title: 'Kitchen' });
		preferences.saveCaptureSettings(mine, {
			notebookId: String(id),
			order: ['todo', 'idea', 'unknown', 'note'],
			on: ['todo', 'note', 'unknown']
		});
		const saved = settings.getCaptureSettings(OWNER);
		expect(saved.notebookId).toBe(id);
		expect(saved.order.slice(0, 3)).toEqual(['todo', 'idea', 'note']);
		expect(saved.off).toContain('idea');
		expect(saved.off).not.toContain('todo');
		expect(saved.off).not.toContain('note');
	});

	test('refuses a wheel with nothing on it', () => {
		expect(() =>
			preferences.saveCaptureSettings(mine, { notebookId: '', order: kinds, on: [] })
		).toThrow();
		expect(() =>
			preferences.saveCaptureSettings(mine, { notebookId: '', order: kinds, on: ['fax'] })
		).toThrow();
	});

	test('refuses a notebook somebody else owns, the same as one that does not exist', () => {
		const before = settings.getCaptureSettings(OWNER);
		const strangers = notebooks.createNotebook(theirs, { title: 'Private' });
		let refused: unknown;
		try {
			preferences.saveCaptureSettings(mine, {
				notebookId: String(strangers),
				order: kinds,
				on: kinds
			});
		} catch (e) {
			refused = e;
		}
		let missing: unknown;
		try {
			preferences.saveCaptureSettings(mine, { notebookId: '999999', order: kinds, on: kinds });
		} catch (e) {
			missing = e;
		}
		expect((refused as { code?: string }).code).toBe('not_found');
		expect((missing as { code?: string }).code).toBe('not_found');
		expect(settings.getCaptureSettings(OWNER)).toEqual(before);
	});

	test('no notebook is a real answer', () => {
		preferences.saveCaptureSettings(mine, { notebookId: '', order: kinds, on: kinds });
		expect(settings.getCaptureSettings(OWNER).notebookId).toBe(null);
	});
});
