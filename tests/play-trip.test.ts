/**
 * The round trip a Play purchase makes between the instance and the copy of
 * the app on the phone — see `$lib/play-billing`. The token is money, so it
 * only ever goes back to the instance this phone was told to open.
 */
import { describe, expect, test } from 'vitest';
import { PLAY_PARAMS, playReturnAddress, playTripAddress } from '../src/lib/play-billing';
import { fromPlayStore, PLAY_STORE_USER_AGENT, APP_USER_AGENT } from '../src/lib/platform';

const INSTANCE = 'https://app.ontoplano.com';
const SKU = 'ontoplano.solo.monthly';

describe('the trip to the sheet', () => {
	test('goes to the device origin carrying the instance, product and account', () => {
		const out = new URL(playTripAddress(INSTANCE, SKU, 'acct-1'));
		expect(out.origin).toBe('https://localhost');
		expect(out.pathname).toBe('/play');
		expect(out.searchParams.get(PLAY_PARAMS.at)).toBe(INSTANCE);
		expect(out.searchParams.get(PLAY_PARAMS.sku)).toBe(SKU);
		expect(out.searchParams.get(PLAY_PARAMS.account)).toBe('acct-1');
	});
});

describe('the trip back', () => {
	test('a purchase goes back to /buy with its token, to be claimed', () => {
		const back = new URL(
			playReturnAddress(INSTANCE, INSTANCE, SKU, { purchaseToken: 'tok', product: SKU })!
		);
		expect(back.origin).toBe(INSTANCE);
		expect(back.pathname).toBe('/buy');
		expect(back.searchParams.get(PLAY_PARAMS.purchase)).toBe('tok');
		expect(back.searchParams.get(PLAY_PARAMS.sku)).toBe(SKU);
	});

	test('closing the sheet goes back to billing', () => {
		const back = playReturnAddress(INSTANCE, INSTANCE, SKU, { cancelled: true });
		expect(back).toBe(`${INSTANCE}/settings/billing`);
	});

	test('a refusal carries Play’s code', () => {
		const back = new URL(playReturnAddress(INSTANCE, INSTANCE, SKU, { failed: 'PLAY_3' })!);
		expect(back.searchParams.get(PLAY_PARAMS.failed)).toBe('PLAY_3');
	});

	test('never to an origin this phone was not told to open', () => {
		const answer = { purchaseToken: 'tok', product: SKU };
		expect(playReturnAddress('https://evil.test', INSTANCE, SKU, answer)).toBeNull();
		expect(playReturnAddress(INSTANCE, null, SKU, answer)).toBeNull();
		expect(playReturnAddress('not a url', INSTANCE, SKU, answer)).toBeNull();
	});
});

describe('the store copy', () => {
	test('is recognised by its own token, not by being the app', () => {
		expect(fromPlayStore(`Mozilla/5.0 ${APP_USER_AGENT} ${PLAY_STORE_USER_AGENT}`)).toBe(true);
		expect(fromPlayStore(`Mozilla/5.0 ${APP_USER_AGENT}`)).toBe(false);
	});
});
