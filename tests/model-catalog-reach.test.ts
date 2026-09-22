/**
 * Asking a provider for its models says what went wrong.
 *
 * The one that matters is an address on the person's own machine. The call is
 * made by the instance, not by the browser, so `http://127.0.0.1:11434` is the
 * server's own loopback — which is refused, and rightly: otherwise any account
 * could make the hosted instance dial its way around its own network.
 *
 * What was wrong was the telling. Saving that address explained itself, and
 * asking for the models — the thing anybody does first, since the model box is
 * a picker — came back "Unexpected error" with a 500 behind it, because the
 * guard's refusal arrives as an ordinary `Error` and `toServiceError` turns
 * anything it does not recognise into that.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/server/settings.js', () => ({ isSelfHosted: () => false }));

import { listModels } from '../src/lib/server/services/model-catalog';

describe('an address this instance cannot reach', () => {
	test('is refused with the reason, not with "Unexpected error"', async () => {
		await expect(listModels('ollama', '', 'http://127.0.0.1:11434/')).rejects.toThrow(
			/this machine|this server|refused/i
		);
	});

	test('and the same for a name that resolves to one', async () => {
		await expect(listModels('ollama', '', 'http://localhost:11434/')).rejects.toThrow(
			/this machine|this server|refused/i
		);
	});

	test('and for a private address on the network behind it', async () => {
		await expect(listModels('ollama', '', 'http://192.168.1.10:11434/')).rejects.toThrow(
			/this machine|this server|refused/i
		);
	});

	test('a provider that needs a key is told so before anything is dialled', async () => {
		await expect(listModels('anthropic', '', null)).rejects.toThrow(/key/i);
	});
});

describe('what a refusal never is', () => {
	let errors: string[] = [];
	beforeEach(() => {
		errors = [];
		vi.spyOn(console, 'error').mockImplementation((...said) => void errors.push(String(said[0])));
	});
	afterEach(() => vi.restoreAllMocks());

	test('a 500 logged as a bug in this app', async () => {
		// `toServiceError` logs "Unexpected service error" for anything it does
		// not recognise. A refusal it recognises is not a bug and does not log.
		await listModels('ollama', '', 'http://127.0.0.1:11434/').catch(() => {});
		expect(errors.join(' ')).not.toContain('Unexpected service error');
	});
});
