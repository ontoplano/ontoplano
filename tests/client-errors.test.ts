/**
 * Client error reports: nothing is sent until two people have said yes.
 *
 * The instance opts in through its config, then each person answers once. The
 * interesting properties are the defaults — silence at both levels means no —
 * and that a "no" is remembered and closes the door server-side too.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const configDir = mkdtempSync(join(tmpdir(), 'ontoplano-config-'));
process.env.ONTOPLANO_CONFIG_DIR = configDir;

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => {
	database.remove();
	rmSync(configDir, { recursive: true, force: true });
	delete process.env.ONTOPLANO_CONFIG_DIR;
});

let s: typeof import('../src/lib/server/services/client-errors');
const ctx = { userId: OWNER, now: new Date('2026-08-29T12:00:00Z'), tz: 'UTC' };

function instanceSays(clientErrors: boolean) {
	writeFileSync(
		join(configDir, 'config.toml'),
		`[reports]\nclient_errors = "${clientErrors}"\n`,
		'utf-8'
	);
}

beforeAll(async () => {
	s = await import('../src/lib/server/services/client-errors');
});

describe('the two consents', () => {
	test('the instance default is off, and consent cannot even be given', () => {
		instanceSays(false);
		expect(s.clientErrorState(OWNER)).toBe('off');
		expect(() => s.setClientErrorConsent(ctx, 'yes')).toThrow(/not enabled/);
	});

	test('instance on, person not yet asked', () => {
		instanceSays(true);
		expect(s.clientErrorState(OWNER)).toBe('ask');
		// Asked but unanswered: a report is still refused.
		expect(() => s.recordClientError(ctx, { message: 'boom' })).toThrow(/not enabled/);
	});

	test('a yes opens the door and a report lands in the log', () => {
		instanceSays(true);
		s.setClientErrorConsent(ctx, 'yes');
		expect(s.clientErrorState(OWNER)).toBe('yes');

		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		s.recordClientError(ctx, { message: 'boom', stack: 'at nowhere', url: '/planner' });
		expect(log).toHaveBeenCalledOnce();
		const line = JSON.parse(log.mock.calls[0][0] as string);
		expect(line).toMatchObject({ level: 'client-error', user: OWNER, message: 'boom' });
		log.mockRestore();
	});

	test('a no is remembered and refuses reports', () => {
		instanceSays(true);
		s.setClientErrorConsent(ctx, 'no');
		expect(s.clientErrorState(OWNER)).toBe('no');
		expect(() => s.recordClientError(ctx, { message: 'boom' })).toThrow(/not enabled/);
	});

	test('turning the instance off overrides an old yes', () => {
		instanceSays(true);
		s.setClientErrorConsent(ctx, 'yes');
		instanceSays(false);
		expect(s.clientErrorState(OWNER)).toBe('off');
		expect(() => s.recordClientError(ctx, { message: 'boom' })).toThrow(/not enabled/);
	});
});
