import { describe, expect, test } from 'vitest';
import { appBehindInstance } from './platform';
import { launchAddress } from './instance-choice';

/**
 * The update warning stands on two answers: what the launch address announces,
 * and whether the shell is far enough behind to say so. Both fail closed — no
 * version, or one that does not parse, draws nothing — because a warning built
 * on a garbled string is a warning about nothing.
 */
describe('launchAddress', () => {
	test('wears the mark and the version, keeping the address itself', () => {
		const out = new URL(launchAddress('https://app.ontoplano.com/tasks/plan?view=day'));
		expect(out.searchParams.get('app')).toBe('android');
		expect(out.searchParams.get('app_version')).toMatch(/^\d+\.\d+\.\d+$/);
		expect(out.pathname).toBe('/tasks/plan');
		expect(out.searchParams.get('view')).toBe('day');
	});

	test('leaves an unparseable address alone', () => {
		expect(launchAddress('not an address')).toBe('not an address');
	});
});

describe('appBehindInstance', () => {
	test('behind on the minor warns', () => {
		expect(appBehindInstance('0.171.9', '0.172.0')).toBe(true);
	});

	test('behind on the major warns', () => {
		expect(appBehindInstance('0.172.0', '1.0.0')).toBe(true);
	});

	test('patch drift is the ordinary state of a store install, not a warning', () => {
		expect(appBehindInstance('0.172.0', '0.172.9')).toBe(false);
	});

	test('level, and ahead, are quiet', () => {
		expect(appBehindInstance('0.172.0', '0.172.0')).toBe(false);
		// A self-hosted instance behind the store is the instance's problem to
		// deploy, not the phone's to downgrade.
		expect(appBehindInstance('0.173.0', '0.172.0')).toBe(false);
	});

	test('what does not parse compares as not-behind', () => {
		expect(appBehindInstance('garbage', '0.172.0')).toBe(false);
		expect(appBehindInstance('0.172.0', 'garbage')).toBe(false);
	});
});
