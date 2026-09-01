/**
 * The rooms, in this account's order and this account's colours.
 *
 * Both are preferences rather than constants now, and both go through here so
 * that the bar, the pie and the palette cannot disagree about either. What is
 * stored is thin on purpose — a list of keys and a map of hexes — and this
 * module is what turns thin storage into the full list the shell renders.
 *
 * Two rules, and they are the reason this is not a `sort`:
 *
 *  - **A stored key that no longer exists is dropped.** A room removed from the
 *    app must not leave a hole in somebody's menu.
 *  - **A room the stored order has never heard of is kept**, in its default
 *    position relative to the rooms around it. A new room has to appear for
 *    everybody, including the people who arranged their menu last year — the
 *    alternative is a feature nobody with an old preference ever sees.
 */
import { SECTIONS, type SectionKey } from '$lib/colors';
import type { NavPlace } from '$lib/sections-nav';

/** `#rrggbb`, which is what `<input type="color">` produces and nothing else. */
export function isHexColor(value: unknown): value is string {
	return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * The places, reordered.
 *
 * `order` is a list of keys, most-wanted first. Anything it does not mention
 * keeps its default neighbours: the unmentioned rooms are laid back into the
 * gaps in default order after the mentioned ones, which is the behaviour that
 * makes adding a room to the app safe.
 */
export function applyOrder<T extends { key: string }>(places: T[], order: readonly string[]): T[] {
	const byKey = new Map(places.map((p) => [p.key, p]));
	const seen = new Set<string>();
	const named: T[] = [];

	// Deduped as it goes: what is stored is whatever was written last, and a
	// list naming one room twice would otherwise draw it twice.
	for (const key of order) {
		const place = byKey.get(key);
		if (!place || seen.has(key)) continue;
		seen.add(key);
		named.push(place);
	}

	return [...named, ...places.filter((p) => !seen.has(p.key))];
}

/**
 * Every section's colour, with this account's choices on top.
 *
 * A stored colour that is not a hex triple is ignored rather than rendered: it
 * would otherwise reach a `style` attribute, and a colour is one of the few
 * settings that goes straight into the page.
 */
export function accentsWith(
	overrides: Record<string, string> | null | undefined
): Record<SectionKey, string> {
	const accents = Object.fromEntries(
		Object.entries(SECTIONS).map(([key, s]) => [key, s.accent])
	) as Record<SectionKey, string>;

	for (const [key, value] of Object.entries(overrides ?? {})) {
		if (key in accents && isHexColor(value)) accents[key as SectionKey] = value;
	}

	return accents;
}

/** The rooms as the shell draws them: this account's order, this account's colours. */
export function placesFor(
	places: NavPlace[],
	options: { order?: readonly string[]; colors?: Record<string, string> | null } = {}
): (NavPlace & { accent: string })[] {
	const accents = accentsWith(options.colors);
	return applyOrder(places, options.order ?? []).map((p) => ({ ...p, accent: accents[p.section] }));
}
