/**
 * A release can only ever move the versionCode up.
 *
 * Android refuses an app whose code is lower than the one it holds, and Play
 * refuses an upload whose code it has already seen — so a code that goes down
 * means uninstalling every copy, losing whatever is in an isolated instance,
 * and a code that repeats means a release that cannot be uploaded at all.
 *
 * The arithmetic used to live in two scripts with two factors for the major:
 * the builder wrote 1.0.0 as 10000, which is below every 0.17x that ever
 * shipped, and the check expected 100000. The disagreement was invisible for
 * exactly as long as the major stayed 0, which is the worst kind of visible.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { versionCode } from '../scripts/version-code.mjs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

describe('the versionCode a release wears', () => {
	it('is the number the committed Android project carries', () => {
		const gradle = readFileSync('capacitor/android/app/build.gradle', 'utf8');
		const committed = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);
		expect(versionCode(version)).toBe(committed);
	});

	it('lands 1.0.0 above everything the 0.x line can ship', () => {
		// The bug this pins: a major factor of 10000 put 1.0.0 below 0.178.1,
		// and the first phone offered that "upgrade" would have refused it.
		expect(versionCode('1.0.0')).toBeGreaterThan(versionCode(version));
		expect(versionCode('1.0.0')).toBeGreaterThan(versionCode('0.999.99'));
	});

	it('refuses a patch that would wear the next minor’s code', () => {
		// 0.178.100 and 0.179.0 are the same number; the build must say so,
		// not the Play console after the upload.
		expect(() => versionCode('0.178.100')).toThrow(/0\.179\.0/);
		expect(versionCode('0.178.99')).toBe(versionCode('0.179.0') - 1);
	});

	it('refuses a minor that would wear the next major’s code', () => {
		expect(() => versionCode('0.1000.0')).toThrow(/1\.0\.0/);
	});

	it('refuses anything that is not major.minor.patch', () => {
		for (const garbage of ['1.2', 'v1.2.3', '1.2.3-rc1', '', '1.2.3.4']) {
			expect(() => versionCode(garbage), garbage).toThrow();
		}
	});
});
