/**
 * A narrowing somebody wants back, under a name they chose.
 *
 * The query string is the whole of it: since a list writes its filters into
 * the address, applying a saved one is navigating to it. So there is no shape
 * here to keep in step with the controls, and a filter saved today still means
 * something after a control is added or renamed.
 *
 * What matters more than the happy path is the key. It goes into a settings
 * row keyed by name, so a caller that could put anything in `surface` could
 * write over another setting.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let saved: typeof import('../src/lib/services/saved-filters');
let settings: typeof import('../src/lib/services/settings');

beforeAll(async () => {
	saved = await import('../src/lib/services/saved-filters');
	settings = await import('../src/lib/services/settings');
});

test('a filter is a name and a query, and comes back as one', () => {
	saved.saveFilter(OWNER, '/tasks/todo', 'Done and dusted', 'done=show');

	expect(saved.savedFilters(OWNER, '/tasks/todo')).toEqual([
		{ name: 'Done and dusted', query: 'done=show' }
	]);
});

test('the leading question mark is not part of it', () => {
	saved.saveFilter(OWNER, '/tasks/todo', 'With a mark', '?done=show&notebook=3');

	expect(saved.savedFilters(OWNER, '/tasks/todo').at(-1)?.query).toBe('done=show&notebook=3');
});

test('saving the same name again replaces it, rather than refusing', () => {
	// Somebody saving "This week" twice has adjusted it; being told the name is
	// taken sends them off to delete the old one for no reason.
	saved.saveFilter(OWNER, '/tasks/todo', 'Done and dusted', 'done=show&away=show');

	const all = saved.savedFilters(OWNER, '/tasks/todo');
	expect(all.filter((one) => one.name === 'Done and dusted')).toHaveLength(1);
	expect(all.find((one) => one.name === 'Done and dusted')?.query).toBe('done=show&away=show');
});

test('they are one screen’s, not the account’s', () => {
	saved.saveFilter(OWNER, '/notebooks/diary', 'Done and dusted', 'tag=reading');

	expect(saved.savedFilters(OWNER, '/tasks/todo').map((one) => one.query)).not.toContain(
		'tag=reading'
	);
	expect(saved.savedFilters(OWNER, '/notebooks/diary')).toEqual([
		{ name: 'Done and dusted', query: 'tag=reading' }
	]);
});

test('one account cannot read another’s', () => {
	expect(saved.savedFilters(STRANGER, '/tasks/todo')).toEqual([]);
});

test('a name or a narrowing that is not there is refused', () => {
	expect(() => saved.saveFilter(OWNER, '/tasks/todo', '  ', 'done=show')).toThrow();
	expect(() => saved.saveFilter(OWNER, '/tasks/todo', 'Nothing', '')).toThrow();
});

/*
 * The key is built from `surface`, so anything that is not a path this app
 * serves has to be refused before it reaches the settings table.
 */
test('a surface that is not a screen cannot be written to', () => {
	settings.setUserSetting(OWNER, 'theme', 'playful');

	// A trailing space is a typo and is trimmed, deliberately: `/tasks/todo `
	// and `/tasks/todo` are one screen and should not be two rows.
	for (const nasty of ['../theme', 'theme', 'http://elsewhere/x', '', '/tasks/todo?x=1'])
		expect(() => saved.saveFilter(OWNER, nasty, 'Mine', 'done=show'), nasty).toThrow();

	expect(settings.getUserSetting(OWNER, 'theme')).toBe('playful');
});

test('forgetting one leaves the rest', () => {
	saved.saveFilter(OWNER, '/tasks/todo', 'Keep me', 'away=show');
	const left = saved.deleteFilter(OWNER, '/tasks/todo', 'Done and dusted');

	expect(left.map((one) => one.name)).toContain('Keep me');
	expect(left.map((one) => one.name)).not.toContain('Done and dusted');
});

test('a list stops taking them at its ceiling', () => {
	for (let i = 0; i < saved.MAX_SAVED_FILTERS + 5; i++) {
		try {
			saved.saveFilter(OWNER, '/inventory', `one ${i}`, `n=${i}`);
		} catch {
			// The ceiling, which is the thing being tested below.
		}
	}
	expect(saved.savedFilters(OWNER, '/inventory').length).toBeLessThanOrEqual(
		saved.MAX_SAVED_FILTERS
	);
});
