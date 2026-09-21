/**
 * The chat's provider key: saved, replaced, described, removed.
 *
 * The description is the part with teeth — the settings screen gets a prefix
 * and never the key, so a page that accidentally rendered the row would still
 * not be rendering the secret.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let keys: typeof import('../src/lib/server/services/model-keys');
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;

beforeAll(async () => {
	keys = await import('../src/lib/server/services/model-keys');
	({ buildCtx } = await import('../src/lib/services/ctx'));
});

const NOW = new Date('2026-09-21T10:00:00Z');

function ctx(user = OWNER) {
	return buildCtx(user, { tz: 'UTC', now: NOW });
}

describe('saving', () => {
	it('stores the key and answers with a prefix, never the key', () => {
		const saved = keys.saveModelKey(ctx(), {
			provider: 'anthropic',
			key: 'sk-ant-api03-abcdefghijklmnop'
		});
		expect(saved.provider).toBe('anthropic');
		expect(saved.prefix).toBe('sk-ant-a');
		expect(JSON.stringify(saved)).not.toContain('abcdefghijklmnop');
		expect(saved.model).toBeNull();
	});

	it('replaces rather than accumulates', () => {
		keys.saveModelKey(ctx(), { provider: 'openai', key: 'sk-one-1234567890' });
		keys.saveModelKey(ctx(), { provider: 'openai', key: 'sk-two-1234567890' });
		expect(keys.describeModelKey(ctx())?.prefix).toBe('sk-two-1');
	});

	it('refuses a provider it has never heard of', () => {
		expect(() => keys.saveModelKey(ctx(), { provider: 'skynet', key: 'k-123' })).toThrow();
	});

	it('needs a key for a company, and none for ollama', () => {
		expect(() => keys.saveModelKey(ctx(), { provider: 'anthropic' })).toThrow();
		const saved = keys.saveModelKey(ctx(), { provider: 'ollama', model: 'llama3.3' });
		expect(saved.provider).toBe('ollama');
		expect(saved.prefix).toBe('');
	});

	it('asks for a model name where there is no sane default', () => {
		expect(() => keys.saveModelKey(ctx(), { provider: 'openrouter', key: 'sk-or-123' })).toThrow(
			/model name/
		);
		const saved = keys.saveModelKey(ctx(), {
			provider: 'openrouter',
			key: 'sk-or-123',
			model: 'anthropic/claude-sonnet-5'
		});
		expect(keys.modelNameFor(saved)).toBe('anthropic/claude-sonnet-5');
	});

	it('falls back to the provider default when no model is named', () => {
		const saved = keys.saveModelKey(ctx(), { provider: 'anthropic', key: 'sk-ant-abcdef' });
		expect(keys.modelNameFor(saved)).toBe('claude-sonnet-5');
	});
});

describe('two accounts', () => {
	it('never sees each other', () => {
		keys.saveModelKey(ctx(OWNER), { provider: 'anthropic', key: 'sk-ant-owner-key' });
		expect(keys.describeModelKey(ctx(STRANGER))).toBeNull();
		expect(keys.configuredModelKey(ctx(STRANGER))).toBeNull();
		expect(() => keys.removeModelKey(ctx(STRANGER))).toThrow();
		expect(keys.describeModelKey(ctx(OWNER))?.prefix).toBe('sk-ant-o');
	});
});

describe('removing', () => {
	it('removes, and a second removal is not found', () => {
		keys.saveModelKey(ctx(), { provider: 'anthropic', key: 'sk-ant-abcdef' });
		keys.removeModelKey(ctx());
		expect(keys.describeModelKey(ctx())).toBeNull();
		expect(() => keys.removeModelKey(ctx())).toThrow();
	});
});
