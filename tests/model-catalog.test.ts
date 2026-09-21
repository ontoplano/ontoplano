/**
 * What a provider will answer to, read out of what it says.
 *
 * The model used to be a text box, which only works for somebody who already
 * has the provider's documentation open. These four speak the same list shape
 * with small differences — Anthropic names its models, OpenAI does not, and
 * OpenAI's list is everything the account can reach rather than everything it
 * can chat with.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

const fetchPublic = vi.fn();
vi.mock('../src/lib/server/outbound.js', () => ({ fetchPublic }));
vi.mock('../src/lib/server/settings.js', () => ({ isSelfHosted: () => false }));

const { listModels } = await import('../src/lib/server/services/model-catalog');

function answers(body: unknown, ok = true, status = 200) {
	fetchPublic.mockResolvedValue({
		ok,
		status,
		json: async () => body,
		text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
	});
}

beforeEach(() => fetchPublic.mockReset());
afterEach(() => vi.clearAllMocks());

describe('asking a provider what it serves', () => {
	test('reads Anthropic’s names, not only its ids', async () => {
		answers({
			data: [
				{ id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' },
				{ id: 'claude-opus-5', display_name: 'Claude Opus 5' }
			]
		});
		expect(await listModels('anthropic', 'sk-ant-x', null)).toEqual([
			{ id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
			{ id: 'claude-opus-5', label: 'Claude Opus 5' }
		]);
	});

	test('sends the key the way each provider wants it', async () => {
		answers({ data: [{ id: 'gpt-5' }] });
		await listModels('openai', 'sk-abc', null);
		expect(fetchPublic.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer sk-abc' });

		fetchPublic.mockReset();
		answers({ data: [{ id: 'claude-sonnet-5' }] });
		await listModels('anthropic', 'sk-ant-abc', null);
		expect(fetchPublic.mock.calls[0][1].headers).toMatchObject({
			'x-api-key': 'sk-ant-abc',
			'anthropic-version': '2023-06-01'
		});
	});

	test('leaves out what is not a chat model', async () => {
		// OpenAI's list is everything the account can reach, and offering an
		// embedding model in a chat's model box is offering somebody a mistake.
		answers({
			data: [
				{ id: 'gpt-5' },
				{ id: 'text-embedding-3-large' },
				{ id: 'whisper-1' },
				{ id: 'dall-e-3' },
				{ id: 'omni-moderation-latest' },
				{ id: 'o3' }
			]
		});
		expect((await listModels('openai', 'sk-abc', null)).map((one) => one.id)).toEqual([
			'gpt-5',
			'o3'
		]);
	});

	test('keeps the order the provider gave', async () => {
		// Every one of them puts the current generation at or near the top, and
		// sorting alphabetically buries claude-sonnet-5 under claude-2.
		answers({ data: [{ id: 'claude-sonnet-5' }, { id: 'claude-2' }] });
		expect((await listModels('anthropic', 'k', null)).map((one) => one.id)).toEqual([
			'claude-sonnet-5',
			'claude-2'
		]);
	});

	test('asks Ollama where it was told to, and without a key', async () => {
		answers({ data: [{ id: 'llama3.3' }] });
		await listModels('ollama', '', 'http://192.168.1.9:11434/v1/');
		expect(fetchPublic.mock.calls[0][0]).toBe('http://192.168.1.9:11434/v1/models');
		expect(await listModels('ollama', '', null)).toEqual([{ id: 'llama3.3', label: 'llama3.3' }]);
	});

	test('refuses to ask without the key the provider needs', async () => {
		await expect(listModels('openai', '', null)).rejects.toThrow(/key/i);
		expect(fetchPublic).not.toHaveBeenCalled();
	});

	test('passes the provider’s own sentence back, not its JSON', async () => {
		// "401" is not something a person can act on. Neither is a request id.
		answers(
			{
				type: 'error',
				error: { type: 'authentication_error', message: 'API key is invalid.' },
				request_id: null
			},
			false,
			401
		);
		const thrown = await listModels('anthropic', 'wrong', null).catch((e: Error) => e.message);
		expect(thrown).toContain('API key is invalid.');
		expect(thrown).not.toContain('request_id');
	});

	test('and hands back an unrecognised body rather than a bare status', async () => {
		answers('upstream is having a day', false, 502);
		await expect(listModels('openai', 'sk-abc', null)).rejects.toThrow(/upstream is having a day/);
	});

	test('answers nothing rather than throwing when the list is empty', async () => {
		answers({ data: [] });
		expect(await listModels('openai', 'sk-abc', null)).toEqual([]);
	});
});
