/**
 * @vitest-environment happy-dom
 */
/**
 * Which ontoplano a phone app opens on.
 *
 * Every Android build carries the whole app and boots on the copy it carries,
 * so where it goes next is read out of what was chosen last time. Three
 * answers, and the difference between two of them is the whole point: "this
 * phone" has to be written down, because nothing written down means nobody has
 * been asked and the app asks. Erasing the key for "this phone" — which is
 * what it used to do — asked again at every launch.
 */
import { beforeEach, describe, expect, test } from 'vitest';

import {
	ARRIVING_AT,
	ARRIVING_HOME,
	APP_USER_AGENT,
	CHOOSE_PATH,
	DEVICE_ORIGIN,
	choseThisPhone,
	chooseOnThisPhone,
	forgetInstance,
	rememberInstance,
	storedChoice,
	storedInstance
} from '../src/lib/instance-choice';

describe('what was chosen here', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	test('nobody asked yet is not the same as this phone', () => {
		expect(storedChoice()).toBeNull();
		expect(choseThisPhone()).toBe(false);

		rememberInstance(null);

		expect(storedChoice()).not.toBeNull();
		expect(choseThisPhone()).toBe(true);
		// And it is not an address, so nothing navigates anywhere at launch.
		expect(storedInstance()).toBeNull();
	});

	test('an instance is remembered as the address to open', () => {
		rememberInstance('https://ontoplano.example');

		expect(storedInstance()).toBe('https://ontoplano.example');
		expect(choseThisPhone()).toBe(false);
	});

	test('leaving one asks again', () => {
		rememberInstance('https://ontoplano.example');
		forgetInstance();

		expect(storedChoice()).toBeNull();
		expect(choseThisPhone()).toBe(false);
	});
});

describe('handing the answer back to the copy on the phone', () => {
	/*
	 * A page an instance served cannot write this phone's answer: storage
	 * belongs to an origin and that is not the origin the app boots from. So the
	 * answer travels in the address instead.
	 */
	test('this phone', () => {
		const url = new URL(chooseOnThisPhone(null));

		expect(url.origin).toBe(DEVICE_ORIGIN);
		expect(url.pathname).toBe(CHOOSE_PATH);
		expect(url.searchParams.has(ARRIVING_HOME)).toBe(true);
	});

	test('an instance, whatever is in its address', () => {
		const instance = 'http://192.168.1.10:1493';
		const url = new URL(chooseOnThisPhone(instance));

		expect(url.origin).toBe(DEVICE_ORIGIN);
		expect(url.searchParams.get(ARRIVING_AT)).toBe(instance);
		expect(url.searchParams.has(ARRIVING_HOME)).toBe(false);
	});
});

describe('knowing it is inside the app', () => {
	test('the marker is what the flavours append to the user agent', () => {
		// `scripts/android-flavours.mjs` reads this same export out of this file
		// and writes it into every flavour's Capacitor config, so a page on
		// somebody else's origin can still tell it is in the app. If this string
		// changes, that one changes with it.
		expect(APP_USER_AGENT).toBeTruthy();
		expect(`Mozilla/5.0 (Linux; Android 14) ${APP_USER_AGENT}`).toContain(APP_USER_AGENT);
	});
});
