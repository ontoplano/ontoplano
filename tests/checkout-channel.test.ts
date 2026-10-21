/**
 * Which way a checkout goes. The store copy once fell through to the card
 * form when Play was not configured on the instance — a policy violation in
 * the one place Google looks — so `none` is an answer, never a fallback.
 */
import { afterAll, describe, expect, test, vi } from 'vitest';
import { APP_USER_AGENT, PLAY_STORE_USER_AGENT } from '../src/lib/platform';
import { makeDatabase } from './helpers/db';

const database = makeDatabase();
afterAll(() => database.remove());

let playReady = false;
vi.mock('../src/lib/server/billing/index.js', () => ({
	provider: () => ({ name: 'test' }),
	playChannel: () => ({ configured: () => playReady })
}));

const { checkoutChannel } = await import('../src/lib/server/services/billing');

const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130';
const APP = `Mozilla/5.0 (Linux; Android 14; wv) ${APP_USER_AGENT}`;
const STORE = `${APP} ${PLAY_STORE_USER_AGENT}`;

describe('checkoutChannel', () => {
	test('a browser pays the provider', () => {
		playReady = true;
		expect(checkoutChannel({ channel: '', userAgent: BROWSER, nativeApp: false })).toBe('provider');
	});

	test('the store copy pays through Play where Play is configured', () => {
		playReady = true;
		expect(checkoutChannel({ channel: 'play', userAgent: null, nativeApp: true })).toBe('play');
		expect(checkoutChannel({ channel: '', userAgent: STORE, nativeApp: false })).toBe('play');
	});

	test('the store copy is refused, not sent to the provider, where Play is not', () => {
		playReady = false;
		expect(checkoutChannel({ channel: 'play', userAgent: STORE, nativeApp: true })).toBe('none');
		expect(checkoutChannel({ channel: '', userAgent: STORE, nativeApp: false })).toBe('none');
	});

	test('any other copy of the app is refused', () => {
		playReady = true;
		expect(checkoutChannel({ channel: '', userAgent: APP, nativeApp: false })).toBe('none');
		expect(checkoutChannel({ channel: '', userAgent: BROWSER, nativeApp: true })).toBe('none');
	});
});
