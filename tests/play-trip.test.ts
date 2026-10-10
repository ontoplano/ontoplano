/**
 * The round trip a Play purchase makes between the instance and the copy of
 * the app on the phone — see `$lib/play-billing`. The token is money, so it
 * only ever goes back to the instance this phone was told to open.
 */
import { describe, expect, test } from 'vitest';
import { PLAY_PARAMS, playReturnAddress, playTripAddress } from '../src/lib/play-billing';
import { fromPlayStore, PLAY_STORE_USER_AGENT, APP_USER_AGENT } from '../src/lib/platform';
import {
	atLeast,
	OUT_PARAM,
	OUT_PATH,
	OUT_SINCE,
	outsideAddress,
	outTripAddress
} from '../src/lib/outside-links';

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

describe('a link out, from an instance', () => {
	test('goes to the device copy carrying the address', () => {
		const out = new URL(outTripAddress('https://docs.ontoplano.com/running-it'));
		expect(out.origin).toBe('https://localhost');
		expect(out.pathname).toBe(OUT_PATH);
		expect(out.searchParams.get(OUT_PARAM)).toBe('https://docs.ontoplano.com/running-it');
	});

	test('only a web address is handed to the browser', () => {
		expect(outsideAddress('https://ontoplano.com/')).toBe('https://ontoplano.com/');
		expect(outsideAddress('javascript:alert(1)')).toBeNull();
		expect(outsideAddress('intent://x#Intent;end')).toBeNull();
		expect(outsideAddress(null)).toBeNull();
	});

	test('only a shell new enough to have the page takes the trip', () => {
		expect(atLeast(OUT_SINCE, OUT_SINCE)).toBe(true);
		expect(atLeast('0.186.0', OUT_SINCE)).toBe(false);
		expect(atLeast('0.187.0', OUT_SINCE)).toBe(true);
		expect(atLeast('garbled', OUT_SINCE)).toBe(false);
	});
});
