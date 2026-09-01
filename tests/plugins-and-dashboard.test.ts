/**
 * What an external program may say about itself, and how the dashboard is
 * arranged.
 *
 * A plugin manifest is text an external program hands the app about itself,
 * shown to a person as "this is what writes that column". So the names it
 * declares have to be checkable identifiers rather than sentences, and a
 * `source` has to be a name one program can hold — otherwise a manifest can
 * dress itself up as somebody else's.
 *
 * The dashboard layout is stored as a string in a settings row, which means it
 * comes back from storage as anything: the parser's job is to survive that and
 * still draw a page.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let plugins: typeof import('../src/lib/server/services/plugins');
let dashboard: typeof import('../src/lib/dashboard');
let legal: typeof import('../src/lib/server/services/legal');
let version: typeof import('../src/lib/server/services/version');

beforeAll(async () => {
	plugins = await import('../src/lib/server/services/plugins');
	dashboard = await import('../src/lib/dashboard');
	legal = await import('../src/lib/server/services/legal');
	version = await import('../src/lib/server/services/version');
});

describe('a plugin saying what it is', () => {
	test('is recorded, and replaced rather than duplicated', () => {
		plugins.upsertManifest(OWNER, { source: 'scale', name: 'Bathroom scale' });
		plugins.upsertManifest(OWNER, { source: 'scale', name: 'Bathroom scale v2' });

		const listed = plugins.listManifests(OWNER).filter((m) => m.source === 'scale');
		expect(listed).toHaveLength(1);
		expect(listed[0].name).toBe('Bathroom scale v2');
	});

	test('falls back to its source when it gives no name', () => {
		const made = plugins.upsertManifest(OWNER, { source: 'nameless' });
		expect(made.name).toBe('nameless');
	});

	test('refuses a source that is not a plain identifier', () => {
		// The source names the program in the interface. A source with a space
		// or a slash in it is one that can be dressed up to look like another.
		expect(() => plugins.upsertManifest(OWNER, { source: 'not a source' })).toThrow();
		expect(() => plugins.upsertManifest(OWNER, { source: '9lives' })).toThrow();
		expect(() => plugins.upsertManifest(OWNER, { source: '' })).toThrow();
	});

	test('lowercases the source, so two spellings are one program', () => {
		plugins.upsertManifest(OWNER, { source: 'ScaleBot', name: 'Scale bot' });
		expect(plugins.listManifests(OWNER).some((m) => m.source === 'scalebot')).toBe(true);
	});

	test('belongs to the account that declared it', () => {
		expect(plugins.listManifests(STRANGER).some((m) => m.source === 'scale')).toBe(false);
	});

	test('is forgotten when asked', () => {
		plugins.upsertManifest(OWNER, { source: 'temporary' });
		plugins.deleteManifest(OWNER, 'temporary');
		expect(plugins.listManifests(OWNER).some((m) => m.source === 'temporary')).toBe(false);
	});
});

describe('the metadata keys a plugin declares', () => {
	test('are identifiers, with a description beside them', () => {
		const keys = plugins.parseMetaKeys([
			{ key: 'room', description: 'Which room', example: 'B12' }
		]);
		expect(keys).toEqual([{ key: 'room', description: 'Which room', example: 'B12' }]);
	});

	test('are lowercased rather than refused for their case', () => {
		expect(plugins.parseMetaKeys([{ key: 'Room' }])[0].key).toBe('room');
	});

	test('refuse a key nothing downstream could address', () => {
		expect(() => plugins.parseMetaKeys([{ key: 'not a key' }])).toThrow();
		expect(() => plugins.parseMetaKeys([{ key: '9lives' }])).toThrow();
	});

	test('refuse the same key declared twice', () => {
		// Two rows claiming one column is a display that cannot be right.
		expect(() => plugins.parseMetaKeys([{ key: 'room' }, { key: 'room' }])).toThrow();
	});

	test('refuse a shape that is not a list of objects', () => {
		expect(() => plugins.parseMetaKeys('room')).toThrow();
		expect(() => plugins.parseMetaKeys([null])).toThrow();
		expect(() => plugins.parseMetaKeys(['room'])).toThrow();
	});

	test('are nothing when nothing is declared', () => {
		expect(plugins.parseMetaKeys(undefined)).toEqual([]);
		expect(plugins.parseMetaKeys(null)).toEqual([]);
	});

	test('are capped, because a manifest is a description and not a schema', () => {
		const many = Array.from({ length: 200 }, (_, i) => ({ key: `k${i}` }));
		expect(() => plugins.parseMetaKeys(many)).toThrow();
	});

	test('and the app can say which plugin owns which key', () => {
		plugins.upsertManifest(OWNER, {
			source: 'scale',
			name: 'Bathroom scale',
			metaKeys: [{ key: 'weight_unit', description: 'kg or lb' }]
		});

		// A Map keyed by the metadata key, because two plugins can legitimately
		// declare the same one and the page has to be able to say so.
		const owners = plugins.metaKeyOwners(OWNER);
		expect(owners.get('weight_unit')?.map((o) => o.name)).toContain('Bathroom scale');
	});
});

describe('the dashboard layout', () => {
	test('has a default that names real cards', () => {
		const layout = dashboard.defaultLayout();
		expect(layout.length).toBeGreaterThan(0);
		for (const id of layout) expect(dashboard.cardById(id)).toBeTruthy();
	});

	test('round-trips through the string it is stored as', () => {
		const layout = dashboard.defaultLayout();
		expect(dashboard.parseLayout(dashboard.serialiseLayout(layout))).toEqual(layout);
	});

	test('survives anything that comes back out of storage', () => {
		// It is a settings row, so it can be empty, stale, or nonsense — and a
		// dashboard that throws on read is a dashboard nobody can fix.
		expect(dashboard.parseLayout(null)).toEqual(dashboard.defaultLayout());
		expect(dashboard.parseLayout('')).toEqual(dashboard.defaultLayout());
		expect(dashboard.parseLayout('nonsense,rubbish')).toEqual(dashboard.defaultLayout());
	});

	test('drops a card that no longer exists and keeps the rest', () => {
		const [first, second] = dashboard.defaultLayout();
		const parsed = dashboard.parseLayout(`${first},a-card-that-was-removed,${second}`);
		expect(parsed).toContain(first);
		expect(parsed).toContain(second);
		expect(parsed).not.toContain('a-card-that-was-removed');
	});

	test('hides the cards whose section is put away', () => {
		const all = dashboard.visibleCards([]);
		const fewer = dashboard.visibleCards(['shopping', 'diary']);
		expect(fewer.length).toBeLessThan(all.length);
	});
});

describe('the quote of the day', () => {
	test('is the same all day and different tomorrow', () => {
		const quotes = ['a', 'b', 'c', 'd', 'e'];
		expect(dashboard.quoteForDate(quotes, '2026-08-17')).toBe(
			dashboard.quoteForDate(quotes, '2026-08-17')
		);

		// Over a week, it should not be the same one every day.
		const week = ['17', '18', '19', '20', '21', '22', '23'].map((d) =>
			dashboard.quoteForDate(quotes, `2026-08-${d}`)
		);
		expect(new Set(week).size).toBeGreaterThan(1);
	});

	test('is nothing when there are no quotes', () => {
		expect(dashboard.quoteForDate([], '2026-08-17')).toBeNull();
	});
});

describe('what the instance says about itself', () => {
	test('names an operator rather than inventing a company', async () => {
		// Async because the price in it comes from the payment provider now: the
		// number in the terms is a promise about what a card will be charged, so
		// it cannot be this instance's env guessing.
		const facts = await legal.legalFacts();
		expect(facts.operator).toBeTruthy();
		expect(facts.contactEmail).toContain('@');
		expect(typeof facts.hosted).toBe('boolean');
		expect(facts.monthly).toMatch(/\d/);
	});

	test('reports a build even when nothing was stamped into it', () => {
		const built = version.build();
		expect(built.version).toBeTruthy();
		expect(built.commit).toBeTruthy();
	});
});
