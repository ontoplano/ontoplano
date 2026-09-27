import type { IconName } from '$lib/components/Icon.svelte';
import { NAV_PLACES } from './sections-nav.js';
import { ROOM_TABS } from './sections.js';
import { SETTINGS_ROUTES } from './settings-tabs.js';
import { SHELL_ROUTES } from './destinations.js';
import { NOTEBOOK_MODULES, type NotebookModule } from './notebook-modules.js';

/**
 * Every glyph the app draws for a place, indexed.
 *
 * Nothing is declared here. A glyph is written once, beside the route it
 * belongs to — a room in `sections-nav.ts`, a tab in `sections.ts`, a settings
 * page in `settings-tabs.ts`, home and search in `destinations.ts` — and this
 * reads them all into one index that everything else asks.
 *
 * One thing, one glyph. Two different places never share a picture, a room
 * never wears its first tab's (Health is not Habits), and nothing that is a
 * place goes without. The one way for two keys to share a glyph is for one of
 * them to say it *is* the other — the Notebooks room is its Notebooks tab, a
 * notebook's Bills tab is the Bills page seen from a subject — and then the
 * glyph is taken from there rather than written twice.
 * `tests/glyphs.test.ts` holds all of that.
 */
export type GlyphThing = {
	/** A room's key, a route, or `notebook/<module>` for a notebook's tab. */
	key: string;
	glyph: IconName;
	/** The key of the thing this is — present only when it is another one. */
	is?: string;
};

/** A notebook module's key in the index. Its id alone is a room's key. */
export const moduleKey = (id: NotebookModule): string => `notebook/${id}`;

const own: GlyphThing[] = [
	...NAV_PLACES.map((place) => ({ key: place.key, glyph: place.icon, is: place.is })),
	...Object.values(ROOM_TABS)
		.flat()
		.map((tab) => ({ key: tab.href as string, glyph: tab.glyph })),
	...Object.entries(SETTINGS_ROUTES).map(([key, glyph]) => ({ key, glyph })),
	...Object.entries(SHELL_ROUTES).map(([key, glyph]) => ({ key, glyph }))
];

const byKey = new Map(own.map((thing) => [thing.key, thing.glyph]));

export const GLYPH_THINGS: GlyphThing[] = [
	...own,
	...NOTEBOOK_MODULES.map((module): GlyphThing => {
		if ('glyph' in module) return { key: moduleKey(module.id), glyph: module.glyph };
		const glyph = byKey.get(module.is);
		if (!glyph) throw new Error(`notebook module ${module.id} is ${module.is}, which has no glyph`);
		return { key: moduleKey(module.id), glyph, is: module.is };
	})
];

export const GLYPHS: Readonly<Record<string, IconName>> = Object.fromEntries(
	GLYPH_THINGS.map((thing) => [thing.key, thing.glyph])
);

/**
 * The glyph for a thing, by its key. Several keys may be given and the first
 * one known wins; `undefined` where none is.
 */
export function glyphFor(...keys: (string | undefined)[]): IconName | undefined {
	for (const key of keys) if (key && key in GLYPHS) return GLYPHS[key];
	return undefined;
}

/**
 * The glyph for a route: its own, or — for a room's bare prefix such as
 * `/inventory`, which redirects — the first place under it.
 */
export function routeGlyph(href: string): IconName | undefined {
	if (href in GLYPHS) return GLYPHS[href];
	return GLYPH_THINGS.find((thing) => thing.key.startsWith(`${href}/`))?.glyph;
}

/** A notebook tab's glyph: the room's or page's it shows, or its own. */
export function moduleGlyph(id: NotebookModule): IconName {
	return GLYPHS[moduleKey(id)];
}
