/**
 * A tab a room draws can be put away.
 *
 * The Notebooks room had six tabs and four of them ignored the preference that
 * claimed to hide them: somebody who put the diary away kept a Diary tab, and
 * Weekly notes and Tags had no preference at all, because nobody had added one
 * when those tabs arrived. Nothing said so — the setting was there, the screen
 * simply never consulted it.
 *
 * So the room's tabs are a list now (`NOTEBOOK_TABS`), the layout draws from
 * it, and this holds the other half: every entry names a section that exists,
 * every one of them has a name and a sentence in each language, and nothing in
 * the list has been left behind by a rename.
 */
import { describe, expect, test } from 'vitest';

import { HIDEABLE_SECTIONS, NOTEBOOK_TABS, isHideableSection } from '../src/lib/sections';
import { LOCALES } from '../src/lib/i18n/locales';
import { messages as english } from '../src/lib/i18n/catalogues/en';
import { messages as portuguese } from '../src/lib/i18n/catalogues/pt-BR';
import { messages as spanish } from '../src/lib/i18n/catalogues/es';
import { messages as german } from '../src/lib/i18n/catalogues/de';

const CATALOGUES: Record<string, Record<string, unknown>> = {
	en: english,
	'pt-BR': portuguese,
	es: spanish,
	de: german
};

describe("the notebooks room's tabs", () => {
	test('can each be put away', () => {
		for (const tab of NOTEBOOK_TABS)
			expect(isHideableSection(tab.id), `${tab.id} has no preference`).toBe(true);
	});

	test('are all still sections — nothing here was renamed out from under it', () => {
		const known = new Set(HIDEABLE_SECTIONS.map((s) => s.id));
		for (const tab of NOTEBOOK_TABS) expect(known.has(tab.id)).toBe(true);
	});

	test('each have an address inside the room', () => {
		for (const tab of NOTEBOOK_TABS) expect(tab.href.startsWith('/notebooks')).toBe(true);
		const hrefs = NOTEBOOK_TABS.map((tab) => tab.href);
		expect(new Set(hrefs).size).toBe(hrefs.length);
	});

	test('and are named in every language, like anything else somebody reads', () => {
		for (const locale of LOCALES)
			for (const tab of NOTEBOOK_TABS) {
				expect(CATALOGUES[locale], `${locale} ${tab.label}`).toHaveProperty(tab.label);
				// The preferences screen draws the name and the sentence under it.
				expect(CATALOGUES[locale], `${locale} ${tab.id}`).toHaveProperty(
					`sections.${tab.id}.label`
				);
				expect(CATALOGUES[locale], `${locale} ${tab.id}`).toHaveProperty(
					`sections.${tab.id}.blurb`
				);
			}
	});
});
