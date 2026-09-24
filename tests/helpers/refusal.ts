/**
 * What a person is actually told when something is refused.
 *
 * A service throws a message key now, not a sentence, so `toThrow(/too big/)`
 * asks the wrong question: the error's `message` is `errors.imports.…`, and the
 * words live in the catalogue. Reading the key back through the English
 * catalogue is what these tests always meant — the wording somebody sees — and
 * it keeps them honest about the sentence rather than about the key, which is
 * an implementation detail the next rename will change.
 *
 * Anything else thrown comes back as its own `message`, so an assertion about a
 * plain `Error` reads the same way.
 */
import { messages } from '../../src/lib/i18n/catalogues/en.js';
import { translator, type MessageKey, type MessageValues } from '../../src/lib/i18n/core.js';
import { ServiceError } from '../../src/lib/services/errors.js';

const english = translator('en', messages) as (key: MessageKey, values?: MessageValues) => string;

/** Run it, and answer with the sentence it refused with. */
export function refusal(run: () => unknown): string {
	try {
		run();
	} catch (error) {
		if (error instanceof ServiceError && error.key) return english(error.key, error.values);
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error('nothing was thrown, so there is no refusal to read');
}

/** The same, for a service that answers with a promise. */
export async function refusalOf(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		if (error instanceof ServiceError && error.key) return english(error.key, error.values);
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error('nothing was thrown, so there is no refusal to read');
}
