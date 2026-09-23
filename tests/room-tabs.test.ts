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

import {
	HIDEABLE_ROOMS,
	HIDEABLE_SECTIONS,
	NOTEBOOK_TABS,
	isHideableSection,
	leavesOf
} from '../src/lib/sections';
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

/** The one tab that cannot be put away: it is what the room is. */
const ALWAYS_ON: string[] = ['notebooks'];

describe("the notebooks room's tabs", () => {
	test('can each be put away, except the notebooks themselves', () => {
		for (const tab of NOTEBOOK_TABS) {
			if (ALWAYS_ON.includes(tab.id)) {
				// A Notebooks room with its notebooks put away is a room with
				// nothing in it, so there is deliberately no preference for it.
				expect(isHideableSection(tab.id), `${tab.id} should be always on`).toBe(false);
				continue;
			}
			expect(isHideableSection(tab.id), `${tab.id} has no preference`).toBe(true);
		}
	});

	test('are all still sections — nothing here was renamed out from under it', () => {
		const known = new Set<string>(HIDEABLE_SECTIONS.map((s) => s.id));
		for (const tab of NOTEBOOK_TABS)
			if (!ALWAYS_ON.includes(tab.id)) expect(known.has(tab.id)).toBe(true);
	});

	/*
	 * The diary has a switch of its own.
	 *
	 * It did not: `diary` was the room's key, so putting the diary away meant
	 * putting the room away and taking the notebooks, the ideas and the people
	 * with it. This is the assertion that says the word means the tab now.
	 */
	test('and the diary is one of them rather than the room', () => {
		expect(isHideableSection('diary')).toBe(true);
		expect(leavesOf('diary')).toContain('diary');
		expect(HIDEABLE_ROOMS.map((r) => r.id)).not.toContain('diary');
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
