/**
 * Every permission is drawn somewhere, and drawn once.
 *
 * The consent screen and the key form both group the tick boxes by what they
 * are about, from `SCOPE_GROUPS`. A scope missing from that map is not a
 * cosmetic hole: the screen draws the groups, so the box for it is never
 * rendered — and a permission nobody can untick is one that is granted without
 * being asked about, which is the whole thing these screens exist to prevent.
 */
import { describe, expect, test } from 'vitest';

import { SCOPE_GROUPS, groupOf, groupsOf } from '../src/lib/scope-groups';
import { ALL_SCOPES } from '../src/lib/server/services/tokens';
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

describe('the groups the tick boxes are drawn in', () => {
	test('have a home for every scope there is', () => {
		for (const scope of ALL_SCOPES) expect(groupOf(scope), scope).not.toBeNull();
	});

	test('and name nothing that is not a scope', () => {
		for (const group of SCOPE_GROUPS)
			for (const scope of group.scopes) expect(ALL_SCOPES).toContain(scope);
	});

	test('never put one scope in two of them', () => {
		const seen = new Set<string>();
		for (const group of SCOPE_GROUPS)
			for (const scope of group.scopes) {
				expect(seen.has(scope), scope).toBe(false);
				seen.add(scope);
			}
	});

	test('are readable in every language, not only the source one', () => {
		for (const locale of LOCALES) {
			const catalogue = CATALOGUES[locale];
			expect(catalogue, locale).toBeDefined();
			for (const group of SCOPE_GROUPS)
				expect(catalogue, `${locale} ${group.says}`).toHaveProperty(group.says);
		}
	});
});

describe('what a screen is handed to draw', () => {
	test('is only the groups it has something to put in', () => {
		const groups = groupsOf([{ key: 'tasks:read' }, { key: 'tasks:write' }]);
		expect(groups.map((one) => one.key)).toEqual(['tasks']);
		expect(groups[0].choices).toHaveLength(2);
	});

	test('and keeps every permission it was given', () => {
		const offered = ALL_SCOPES.map((key) => ({ key }));
		const drawn = groupsOf(offered).flatMap((group) => group.choices.map((one) => one.key));
		expect(drawn.sort()).toEqual([...ALL_SCOPES].sort());
	});
});
