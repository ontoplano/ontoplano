/**
 * The API level the app compiles and targets.
 *
 * Play rejects a bundle outright when `targetSdk` is behind what it currently
 * demands — not a warning on the listing, an error that blocks the release,
 * after the build, the signing and the upload have all been done. The number
 * moves once a year and nothing in the repo would otherwise notice, so it is
 * held here: the floor, and the rule that the two levels move together.
 *
 * Read out of `variables.gradle` rather than duplicated, because that file is
 * what Gradle actually reads.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

/**
 * What Google Play demands of a new bundle today.
 *
 * Raised each August or so, and the console's error names the number:
 * "esse nível precisa ser de pelo menos 36". Raise this when they do — a
 * release that fails on the upload has already cost a build and a signing.
 */
const PLAY_REQUIRES = 36;

const variables = readFileSync('capacitor/android/variables.gradle', 'utf8');

const levelOf = (name: string): number => {
	const found = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(variables);
	if (!found) throw new Error(`capacitor/android/variables.gradle no longer sets ${name}`);
	return Number(found[1]);
};

describe('the Android project', () => {
	test('targets at least what Play will accept', () => {
		expect(levelOf('targetSdkVersion')).toBeGreaterThanOrEqual(PLAY_REQUIRES);
	});

	test('compiles against at least what it targets', () => {
		// Gradle's own rule, and the reason the two are raised together: an app
		// cannot target APIs it was not compiled against.
		expect(levelOf('compileSdkVersion')).toBeGreaterThanOrEqual(levelOf('targetSdkVersion'));
	});

	test('still runs on the phones it always did', () => {
		// Raising the target must not quietly raise the floor: minSdk is who can
		// install this at all, and 23 is Android 6.
		expect(levelOf('minSdkVersion')).toBeLessThanOrEqual(23);
	});

	test('builds with a plugin that knows the level it compiles against', () => {
		// AGP refuses a platform it has never heard of, and the failure reads as
		// "Android Gradle plugin update required" halfway through a release.
		// 8.9 is the first that knows API 36.
		const build = readFileSync('capacitor/android/build.gradle', 'utf8');
		const found = /com\.android\.tools\.build:gradle:(\d+)\.(\d+)/.exec(build);
		expect(found, 'no Android Gradle plugin is named').not.toBe(null);
		const [major, minor] = [Number(found![1]), Number(found![2])];
		expect(major * 100 + minor).toBeGreaterThanOrEqual(809);
	});
});
