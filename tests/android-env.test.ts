/**
 * The environment the Android build hands Gradle.
 *
 * Every case here is a machine that reported "Several environment variables
 * and/or system properties contain different paths to the SDK", and the first
 * one is the report that started it: a shell where both variables agree, which
 * still failed, because Bubblewrap replaces `ANDROID_HOME` with the SDK it
 * recorded and leaves `ANDROID_SDK_ROOT` alone. Comparing the two cannot catch
 * that — they agree at the moment we look — so only one of them survives.
 */
import { describe, expect, test } from 'vitest';

// @ts-expect-error — a build script, not part of the app's TypeScript
import { androidEnv } from '../scripts/lib/android-env.mjs';

type Result = { env: Record<string, string>; notes: string[] };
const build = (source: Record<string, string>, recorded?: string): Result =>
	androidEnv(source, recorded) as Result;

describe('one SDK path, whatever the machine says', () => {
	test('drops ANDROID_SDK_ROOT even when it agrees with ANDROID_HOME', () => {
		// The reported machine: both set to the same directory, and Bubblewrap
		// holding a different one of its own.
		const { env } = build(
			{ ANDROID_HOME: '/opt/android-sdk', ANDROID_SDK_ROOT: '/opt/android-sdk' },
			'/home/someone/.bubblewrap/android_sdk'
		);

		expect(env.ANDROID_SDK_ROOT).toBeUndefined();
		expect(env.ANDROID_HOME).toBe('/opt/android-sdk');
	});

	test('says which SDK Bubblewrap will actually use when they differ', () => {
		const { notes } = build(
			{ ANDROID_HOME: '/opt/android-sdk', ANDROID_SDK_ROOT: '/opt/android-sdk' },
			'/home/someone/.bubblewrap/android_sdk'
		);

		// The difference that decides the build, and the only one not visible
		// from the shell.
		expect(notes.join('\n')).toContain('/home/someone/.bubblewrap/android_sdk');
		expect(notes.join('\n')).toContain('config.json');
	});

	test('drops it and says so when the two disagree outright', () => {
		const { env, notes } = build({
			ANDROID_HOME: '/opt/android-sdk',
			ANDROID_SDK_ROOT: '/usr/lib/android-sdk'
		});

		expect(env.ANDROID_SDK_ROOT).toBeUndefined();
		expect(env.ANDROID_HOME).toBe('/opt/android-sdk');
		expect(notes.join('\n')).toContain('Ignoring ANDROID_SDK_ROOT');
	});

	test('promotes the deprecated name when it is the only one set', () => {
		// A distro package or an old profile sets this one alone. It still says
		// where the SDK is; it just may not say it to Gradle.
		const { env } = build({ ANDROID_SDK_ROOT: '/usr/lib/android-sdk' });

		expect(env.ANDROID_HOME).toBe('/usr/lib/android-sdk');
		expect(env.ANDROID_SDK_ROOT).toBeUndefined();
	});

	test('falls back to what Bubblewrap recorded when the shell says nothing', () => {
		const { env, notes } = build({}, '/home/someone/.bubblewrap/android_sdk');

		expect(env.ANDROID_HOME).toBe('/home/someone/.bubblewrap/android_sdk');
		// Nothing to warn about: that is the SDK, and it is the one being used.
		expect(notes).toEqual([]);
	});

	test('leaves an environment with nothing in it alone', () => {
		const { env } = build({ PATH: '/usr/bin' });

		expect(env.ANDROID_HOME).toBeUndefined();
		expect(env.PATH).toBe('/usr/bin');
	});
});
