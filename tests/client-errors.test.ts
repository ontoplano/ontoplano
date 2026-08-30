import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

/**
 * A report somebody sends has to arrive somewhere a person looks.
 *
 * It used to go to the server log alone, which on the box is journald: pressing
 * "Send" reached nobody who was not already tailing it, and the only way to
 * learn that anything had been reported was to be told in person. So the round
 * trip is worth pinning — consent refused means nothing is stored, consent
 * given means `/admin` can read it back, and the table never grows without
 * limit.
 */
/*
 * Its own config directory, decided before anything imports the config module.
 *
 * `CONFIG_DIR` is read once at import time, and the suite otherwise shares one
 * directory — so another file turning the instance's report setting off, in
 * another worker, turned it off here too. A test that passes alone and fails
 * in the suite is worse than one that fails.
 */
process.env.ONTOPLANO_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'ontoplano-reports-'));

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let service: typeof import('../src/lib/server/services/client-errors');
const ctx = { userId: OWNER, now: new Date('2026-08-30T12:00:00Z'), tz: 'UTC' };

let config: typeof import('../src/lib/server/config');

beforeAll(async () => {
	service = await import('../src/lib/server/services/client-errors');
	config = await import('../src/lib/server/config');
});

/*
 * Two people have to say yes before a stack trace leaves a browser: the
 * instance turns the feature on, and then the account. This is the first half,
 * re-asserted before every test rather than once — the suite shares one config
 * directory, and any other file that writes the instance config would
 * otherwise turn this off underneath us. A test that passes alone and fails in
 * the suite is worse than one that fails.
 */
beforeEach(() => {
	config.saveConfig({ ...config.loadConfig(), reports: { clientErrors: true } });
});

describe('an error report', () => {
	it('is refused outright when the account has not agreed', () => {
		expect(() => service.recordClientError(ctx, { message: 'nope' })).toThrow();
		expect(service.recentClientErrors()).toHaveLength(0);
	});

	it('is readable by the administrator once it is', () => {
		service.setClientErrorConsent(ctx, 'yes');
		service.recordClientError(ctx, {
			message: 'Cannot read properties of undefined',
			url: '/planner/plan',
			stack: 'at thing (app.js:1:1)',
			userAgent: 'Mozilla/5.0 (Linux; Android 14)'
		});

		const [report] = service.recentClientErrors();
		expect(report.message).toBe('Cannot read properties of undefined');
		expect(report.url).toBe('/planner/plan');
		expect(report.stack).toContain('app.js');
		expect(report.userAgent).toContain('Android');
		// Joined rather than stored, so a deleted account takes its name out of
		// the view without the row having to be rewritten.
		expect(report.email).toBeTruthy();
	});

	it('can be dismissed once it is dealt with', () => {
		const [report] = service.recentClientErrors();
		service.dismissClientError(report.id);
		expect(service.recentClientErrors().find((r) => r.id === report.id)).toBeUndefined();
	});

	it('does not grow without end', () => {
		for (let i = 0; i < 260; i++) service.recordClientError(ctx, { message: `boom ${i}` });
		// The sweep runs on write, because this is the only thing that writes.
		expect(service.recentClientErrors(1000).length).toBeLessThanOrEqual(200);
		// And it keeps the newest, not the first two hundred it happened to see.
		expect(service.recentClientErrors()[0].message).toBe('boom 259');
	});
});
