/**
 * Every permission is readable in every language the app ships.
 *
 * The sentences under the tick boxes used to be the values of `SCOPES`, which
 * is where a permission's English definition belongs — the API reference is
 * generated from it — and they were also what the screen drew. So a person
 * reading the app in Portuguese was handed English sentences about their own
 * diary, with a word like "statements" in the middle of them. A permission is
 * the last thing to leave in the source language: it is read carefully or it
 * is not read at all.
 */
import { describe, expect, test } from 'vitest';

import {
	SCOPE_CAUTION_WORDS,
	SCOPE_WORDS,
	WEBHOOK_EVENT_WORDS,
	scopeWord,
	webhookEventWord
} from '../src/lib/scope-words';
import { WEBHOOK_EVENTS } from '../src/lib/webhook-events';
import { ALL_SCOPES, SCOPE_CAUTIONS } from '../src/lib/server/services/tokens';
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

describe('what a permission says', () => {
	test('exists for every scope there is', () => {
		for (const scope of ALL_SCOPES) expect(scopeWord(scope), scope).not.toBeNull();
	});

	test('and names nothing that is not a scope', () => {
		for (const scope of Object.keys(SCOPE_WORDS)) expect(ALL_SCOPES).toContain(scope);
		for (const scope of Object.keys(SCOPE_CAUTION_WORDS)) expect(ALL_SCOPES).toContain(scope);
	});

	test('is in every catalogue, not only the source one', () => {
		// A key missing from one language renders as nothing at all, which on
		// this screen is a tick box with no sentence beside it.
		for (const locale of LOCALES) {
			const catalogue = CATALOGUES[locale];
			expect(catalogue, locale).toBeDefined();
			for (const key of Object.values(SCOPE_WORDS)) expect(catalogue, key).toHaveProperty(key);
			for (const key of Object.values(SCOPE_CAUTION_WORDS))
				expect(catalogue, key).toHaveProperty(key);
		}
	});

	test('and so does the louder line, wherever there is one', () => {
		for (const scope of Object.keys(SCOPE_CAUTIONS))
			expect(SCOPE_CAUTION_WORDS, scope).toHaveProperty(scope);
	});
});

describe('what a webhook event means', () => {
	test('exists for every event that can be subscribed to', () => {
		for (const event of WEBHOOK_EVENTS) expect(webhookEventWord(event), event).not.toBeNull();
	});

	test('is in every catalogue', () => {
		for (const locale of LOCALES)
			for (const key of Object.values(WEBHOOK_EVENT_WORDS))
				expect(CATALOGUES[locale], `${locale} ${key}`).toHaveProperty(key);
	});
});
