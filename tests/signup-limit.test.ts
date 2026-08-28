import { beforeEach, describe, expect, it } from 'vitest';
import {
	SIGNUP_PER_HOUR,
	SIGNUP_PER_MINUTE,
	resetRateLimit,
	signUpBudget
} from '../src/lib/server/rate-limit';

/**
 * Signing up is throttled apart from signing in.
 *
 * The bug this guards against is the quiet one: sharing the credential bucket
 * looks like a rate limit and lets one address leave three thousand rows a day
 * on a disk that has two gigabytes left.
 */
describe('signUpBudget', () => {
	beforeEach(() => {
		for (const w of ['m', 'h']) resetRateLimit(`signup:${w}:1.2.3.4`);
	});

	it('lets a household sign up a couple of people', () => {
		for (let i = 0; i < SIGNUP_PER_MINUTE; i++) {
			expect(signUpBudget('1.2.3.4').allowed).toBe(true);
		}
	});

	it('stops the next one, and says how long to wait', () => {
		for (let i = 0; i < SIGNUP_PER_MINUTE; i++) signUpBudget('1.2.3.4');
		const refused = signUpBudget('1.2.3.4');
		expect(refused.allowed).toBe(false);
		expect(refused.retryAfterSeconds).toBeGreaterThan(0);
	});

	it('is per address, so one bot does not lock everybody out', () => {
		for (let i = 0; i < SIGNUP_PER_MINUTE + 2; i++) signUpBudget('1.2.3.4');
		expect(signUpBudget('5.6.7.8').allowed).toBe(true);
		for (const w of ['m', 'h']) resetRateLimit(`signup:${w}:5.6.7.8`);
	});

	it('holds an hourly ceiling under the per-minute one', () => {
		// The point of two windows: waiting out the minute must not reset the
		// hour, or a patient script gets a signup every thirty seconds forever.
		expect(SIGNUP_PER_HOUR).toBeGreaterThan(SIGNUP_PER_MINUTE);

		for (let i = 0; i < SIGNUP_PER_HOUR; i++) {
			resetRateLimit('signup:m:9.9.9.9');
			expect(signUpBudget('9.9.9.9').allowed).toBe(true);
		}
		resetRateLimit('signup:m:9.9.9.9');
		expect(signUpBudget('9.9.9.9').allowed).toBe(false);
		for (const w of ['m', 'h']) resetRateLimit(`signup:${w}:9.9.9.9`);
	});
});
