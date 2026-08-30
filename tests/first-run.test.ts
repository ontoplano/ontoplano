/**
 * First run is where the account is dressed.
 *
 * The theme picker used to sit on the card page, which is the wrong place
 * twice over: an account that never pays never sees it, and the page that
 * asks for a timezone and a starting week is plainly the one that should ask
 * how the app should look. It stays optional — an absent or unknown answer
 * leaves the default, which follows the device.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let onboarding: typeof import('../src/lib/server/services/onboarding');
let settings: typeof import('../src/lib/server/settings');
let ctx: typeof import('../src/lib/server/services/ctx');

beforeAll(async () => {
	onboarding = await import('../src/lib/server/services/onboarding');
	settings = await import('../src/lib/server/settings');
	ctx = await import('../src/lib/server/services/ctx');
});

describe('the look, chosen at first run', () => {
	test('a chosen theme is kept', () => {
		onboarding.completeFirstRun(ctx.buildCtx(OWNER), {
			timezone: 'America/Sao_Paulo',
			firstDay: 0,
			template: 'blank',
			theme: 'dark'
		});

		expect(settings.getTheme(OWNER)).toBe('dark');
		// The rest of first run still happened.
		expect(settings.getTimezone(OWNER)).toBe('America/Sao_Paulo');
	});

	test('no answer, or a nonsense one, leaves the device to decide', () => {
		onboarding.completeFirstRun(ctx.buildCtx(STRANGER), {
			timezone: 'UTC',
			firstDay: 0,
			template: 'blank',
			theme: 'chartreuse'
		});

		expect(settings.getTheme(STRANGER)).toBe(settings.DEFAULT_THEME);
	});
});
