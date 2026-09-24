import { getUserSetting, setUserSetting } from './settings.js';
import { ValidationError } from './errors.js';
import { str } from './validate.js';

/**
 * A narrowing somebody wants back, under a name they chose.
 *
 * "Everything urgent about the house that nobody has done" is four controls
 * set four ways, and setting them again every Monday is the work the controls
 * were supposed to save. So a filter can be kept: a name, and the query string
 * the list is already writing into the address.
 *
 * **The query string is the whole of it.** Since `$lib/filters-in-url` put a
 * list's narrowing into the address, applying a saved filter is navigating to
 * it — so there is no shape here to keep in step with the controls, and a
 * filter saved today still means something after a control is added or
 * renamed. What it cannot express is anything a list keeps outside the
 * address, which is also exactly what is not worth saving.
 *
 * Stored per surface, because the task list's filters are not the diary's and
 * a name that means one thing on one screen means nothing on another.
 */

/** As long as a name may be. A label for a chip, not a sentence. */
export const MAX_FILTER_NAME_LENGTH = 40;

/**
 * How many one surface may keep.
 *
 * A row of chips is read at a glance, and past about this many it is a list to
 * search — at which point saving them has stopped helping. It also bounds what
 * one setting row holds.
 */
export const MAX_SAVED_FILTERS = 12;

export type SavedFilter = { name: string; query: string };

/** Where one surface's filters live. The surface is its own path. */
function keyFor(surface: string): string {
	return `filters.saved.${surface}`;
}

/** One surface's saved filters, oldest first, or nothing at all. */
export function savedFilters(userId: string, surface: string): SavedFilter[] {
	const raw = getUserSetting(userId, keyFor(where(surface)));
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(one): one is SavedFilter =>
					!!one && typeof one.name === 'string' && typeof one.query === 'string'
			)
			.slice(0, MAX_SAVED_FILTERS);
	} catch {
		// A setting that is not the shape this expects is one nobody can act on;
		// answering with none is what lets the screen carry on working.
		return [];
	}
}

/**
 * Keep this narrowing under this name, replacing one of the same name.
 *
 * Replacing rather than refusing: somebody saving "This week" twice has
 * adjusted it, and being told the name is taken sends them to delete the old
 * one first for no reason.
 */
export function saveFilter(
	userId: string,
	surface: string,
	rawName: unknown,
	rawQuery: unknown
): SavedFilter[] {
	const name = str(rawName, 'name', { max: MAX_FILTER_NAME_LENGTH }).trim();
	if (!name) throw new ValidationError('A saved filter needs a name');

	// The query as the address writes it, without the leading `?`. Not parsed:
	// what it means belongs to the screen, and this only has to give it back.
	const query = String(rawQuery ?? '').replace(/^\?/, '');
	if (!query) throw new ValidationError('There is nothing to save — nothing is narrowed');

	const kept = savedFilters(userId, surface).filter((one) => one.name !== name);
	if (kept.length >= MAX_SAVED_FILTERS)
		throw new ValidationError('That is as many saved filters as one list keeps');

	const next = [...kept, { name, query }];
	setUserSetting(userId, keyFor(where(surface)), JSON.stringify(next));
	return next;
}

export function deleteFilter(userId: string, surface: string, rawName: unknown): SavedFilter[] {
	const name = String(rawName ?? '').trim();
	const next = savedFilters(userId, surface).filter((one) => one.name !== name);
	setUserSetting(userId, keyFor(where(surface)), JSON.stringify(next));
	return next;
}

/**
 * The surface, as a key.
 *
 * A path this app serves and nothing else: the key goes into a settings row
 * keyed by name, so a caller that could put anything there could write over
 * another setting. Letters, digits, slashes and dashes, which is every route
 * this app has.
 */
function where(surface: unknown): string {
	const given = String(surface ?? '').trim();
	if (!/^\/[a-z0-9/-]*$/i.test(given)) throw new ValidationError('That is not a screen');
	return given;
}
