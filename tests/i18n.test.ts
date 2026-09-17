/**
 * The parts of translation that are quiet when they break.
 *
 * A wrong language is obvious. A plural that always takes the "other" form, a
 * number written with the wrong separator, a placeholder that silently renders
 * as `{name}`, a header parsed in our order of preference instead of the
 * browser's — none of those look wrong to whoever wrote them, and all of them
 * look wrong to whoever reads the app.
 */
import { describe, expect, test } from 'vitest';

import { format, placeholdersIn } from '../src/lib/i18n/format';
import {
	LOCALES,
	LOCALE_NAMES,
	SOURCE_LOCALE,
	isLocale,
	matchLocale
} from '../src/lib/i18n/locales';
import { translator } from '../src/lib/i18n';
import { messages as english } from '../src/lib/i18n/catalogues/en';
import { messages as portuguese } from '../src/lib/i18n/catalogues/pt-BR';

describe('which language a browser asked for', () => {
	test('answers in the browser’s order, not ours', () => {
		// `en` is this app's first language and `pt-BR` its second. A browser
		// that prefers Portuguese gets Portuguese anyway — reading the list in
		// our own order is the bug this is here for.
		expect(matchLocale('pt-BR,pt;q=0.9,en;q=0.8')).toBe('pt-BR');
		expect(matchLocale('en-GB,en;q=0.9,pt;q=0.8')).toBe('en');
	});

	test('takes the base language when the exact tag is not ours', () => {
		// `pt-PT` is not a language this app has; Brazilian Portuguese is much
		// closer to it than English is.
		expect(matchLocale('pt-PT')).toBe('pt-BR');
		expect(matchLocale('en-AU')).toBe('en');
	});

	test('says nothing when it has nothing to say', () => {
		expect(matchLocale('ja,fr;q=0.9')).toBeNull();
		expect(matchLocale('')).toBeNull();
		expect(matchLocale(null)).toBeNull();
	});

	test('survives a header that makes no sense', () => {
		expect(matchLocale(';;;,,,')).toBeNull();
		// A weight that is not a number does not cost the language its place:
		// answering a browser that asked for English in Portuguese because its
		// `q=` was malformed is the worse of the two failures.
		expect(matchLocale('en;q=banana')).toBe('en');
	});
});

describe('a message with values in it', () => {
	test('puts them where they go', () => {
		expect(format('Moved {what} to {where}.', 'en', { what: 'Milk', where: 'Fridge' })).toBe(
			'Moved Milk to Fridge.'
		);
	});

	test('writes a number the way the language writes it', () => {
		expect(format('{amount}', 'en', { amount: 1234.5 })).toBe('1,234.5');
		expect(format('{amount}', 'pt-BR', { amount: 1234.5 })).toBe('1.234,5');
	});

	test('leaves a placeholder alone rather than writing "undefined"', () => {
		// A visible `{name}` is a bug somebody reports. The word undefined in
		// the middle of a sentence is a bug somebody screenshots.
		expect(format('Hello {name}.', 'en', {})).toBe('Hello {name}.');
	});

	test('leaves a brace that is not a placeholder', () => {
		expect(format('Use {} for an empty set.', 'en', {})).toBe('Use {} for an empty set.');
	});
});

describe('a message that counts', () => {
	const tasks = { one: '{count} task', other: '{count} tasks' };

	test('picks the form the count takes', () => {
		expect(format(tasks, 'en', { count: 1 })).toBe('1 task');
		expect(format(tasks, 'en', { count: 0 })).toBe('0 tasks');
		expect(format(tasks, 'en', { count: 7 })).toBe('7 tasks');
	});

	test('and takes the language’s own rules for it', () => {
		/*
		 * Brazilian Portuguese puts zero in the singular — "0 tarefa" — where
		 * English puts it in the plural. Two languages that look like they
		 * count the same way do not, which is the whole reason the form is
		 * asked of `Intl` rather than written as `count === 1` in a component.
		 */
		const tarefas = { one: '{count} tarefa', other: '{count} tarefas' };
		expect(format(tarefas, 'pt-BR', { count: 1 })).toBe('1 tarefa');
		expect(format(tarefas, 'pt-BR', { count: 0 })).toBe('0 tarefa');
		expect(format(tarefas, 'pt-BR', { count: 7 })).toBe('7 tarefas');

		expect(format({ one: '{count} task', other: '{count} tasks' }, 'en', { count: 0 })).toBe(
			'0 tasks'
		);
	});

	test('falls back to "other" when no count is given', () => {
		expect(format(tasks, 'en', {})).toBe('{count} tasks');
	});
});

describe('the catalogues', () => {
	test('every language has every message', () => {
		// `yarn messages --check` refuses this too, but a generated file can be
		// edited by hand and a test is what somebody runs before they notice.
		const keys = Object.keys(english).sort();
		expect(Object.keys(portuguese).sort()).toEqual(keys);
		expect(keys.length).toBeGreaterThan(0);
	});

	test('a message asks for the same values in each language', () => {
		for (const key of Object.keys(english) as (keyof typeof english)[]) {
			expect({ key, of: placeholdersIn(portuguese[key]!) }).toEqual({
				key,
				of: placeholdersIn(english[key]!)
			});
		}
	});

	test('every language names itself, in itself', () => {
		for (const locale of LOCALES) {
			expect(LOCALE_NAMES[locale]?.length ?? 0).toBeGreaterThan(0);
		}
		expect(isLocale(SOURCE_LOCALE)).toBe(true);
	});
});

describe('a translator', () => {
	test('speaks the language it was given', () => {
		const t = translator('pt-BR', portuguese);
		expect(t.locale).toBe('pt-BR');
		expect(t('settings.language.heading')).toBe('Idioma');
	});

	test('renders the key rather than pretending, when a message is missing', () => {
		// Never the English for it: a silently English sentence in a Portuguese
		// page is a bug nobody reports, and a bare key is one somebody does.
		const t = translator('pt-BR', {});
		expect(t('settings.language.heading')).toBe('settings.language.heading');
	});
});
