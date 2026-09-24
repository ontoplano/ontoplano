/**
 * A refusal reaches somebody in the language the rest of the screen is in.
 *
 * It did not: `ValidationError('A notebook by that name already exists')` and
 * two hundred and fifty-six like it were English sentences written into the
 * source, so an account set to Portuguese got its screens translated and its
 * refusals in English — at exactly the moment somebody is stuck and reading
 * carefully.
 *
 * The service throws a key now and the adapter that turns it into a response
 * is what translates, because that is the first place that knows whose request
 * is being answered. This is that seam: the key survives the throw, the
 * catalogue has a sentence for it in every language, and nothing about the
 * status or the shape of the answer changed.
 */
import { describe, expect, test } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../src/lib/services/errors';
import { messages as english } from '../src/lib/i18n/catalogues/en';
import { messages as portuguese } from '../src/lib/i18n/catalogues/pt-BR';
import { LOCALES } from '../src/lib/i18n/locales';
import { loadCatalogue } from '../src/lib/i18n/load';

describe('a refusal', () => {
	test('carries a key and the values it needs, not a sentence', () => {
		const refused = new ValidationError({
			key: 'errors.savedFilters.aSavedFilterNeeds'
		});

		expect(refused.key).toBe('errors.savedFilters.aSavedFilterNeeds');
		expect(refused.status).toBe(422);
		expect(refused.code).toBe('validation_error');
	});

	test('has a sentence waiting for it in every language', () => {
		const key = 'errors.notebooks.aNotebookByThatName';

		expect(english[key]).toBeTruthy();
		expect(portuguese[key]).toBeTruthy();
		expect(portuguese[key]).not.toBe(english[key]);
	});

	/*
	 * The catalogues are checked against each other by `yarn messages`, but a
	 * key added here and nowhere else would reach a person as the key itself —
	 * so every refusal the app can throw is asked for in every language.
	 */
	test('and so does every other one, in all four', async () => {
		const keys = Object.keys(english).filter((key) => key.startsWith('errors.'));
		expect(keys.length, 'the sweep left no refusals at all').toBeGreaterThan(100);

		for (const locale of LOCALES) {
			const catalogue = await loadCatalogue(locale);
			const missing = keys.filter((key) => !catalogue[key as keyof typeof catalogue]);
			expect(missing, `${locale} has no words for these`).toEqual([]);
		}
	});

	test('still reads as a plain sentence where one was given', () => {
		// A provider dropped into the billing slot is not this repository's to
		// translate — see `src/lib/server/billing/providers/README.md` — so a
		// string is still a refusal anybody can throw.
		expect(new ConflictError('Billing is not configured here').message).toBe(
			'Billing is not configured here'
		);
	});

	/*
	 * `not found` says the same thing about everything on purpose: which thing
	 * is missing is what that error exists not to say. The kind goes in the
	 * log and the API's `message`, where nobody browsing is reading it.
	 */
	test('names nothing when it is a not-found', () => {
		const missing = new NotFoundError('seat');

		expect(missing.key).toBe('errors.notFound');
		expect(missing.message).toBe('seat not found');
		expect(english['errors.notFound']).not.toContain('seat');
	});
});
