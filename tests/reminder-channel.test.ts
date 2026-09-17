/**
 * One channel, named in two languages.
 *
 * Android decides whether a notification makes a noise from its *channel*, not
 * from the notification — a channel made at the default importance posts
 * silently however loudly the notification asks. Reminders arrive by two
 * different roads: the shell's own ringer, for an instance with a server, and
 * the app booking Android's alarms for an instance that is the phone. The
 * first made the channel at IMPORTANCE_HIGH and rang; the second named no
 * channel at all, landed on the plugin's default, and arrived in silence.
 *
 * So both use this one, and the string lives in a `.ts` file and a `.java`
 * file with nothing between them. That is what this is for.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { REMINDER_CHANNEL, RETIRED_CHANNELS } from '../src/lib/phone-notifications';

const RINGER = 'capacitor/android/app/src/main/java/app/ontoplano/isolated/Ringer.java';

describe('the reminders channel', () => {
	test('is the same one the shell posts to', () => {
		const java = readFileSync(RINGER, 'utf8');
		const named = /CHANNEL\s*=\s*"([^"]+)"/.exec(java);
		expect(named, `no CHANNEL in ${RINGER}`).not.toBe(null);
		expect(named![1]).toBe(REMINDER_CHANNEL);
	});

	/*
	 * Retiring a channel only works if both halves retire the same one.
	 *
	 * A channel's importance is fixed at creation, so the only way to fix a
	 * phone that made its first one too quietly is a new id — and if one half
	 * moved to the new id while the other kept making the old one, the old row
	 * would be recreated the moment the other half ran.
	 */
	test('retires the same old names the shell does', () => {
		const java = readFileSync(RINGER, 'utf8');
		const listed = /RETIRED_CHANNELS = \{([^}]*)\}/.exec(java);
		expect(listed, `no RETIRED_CHANNELS in ${RINGER}`).not.toBe(null);

		const retired = [...listed![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
		expect(retired).toEqual(RETIRED_CHANNELS);
		expect(retired).not.toContain(REMINDER_CHANNEL);
	});

	test('is made loudly enough to be heard', () => {
		// IMPORTANCE_HIGH on the native side; 5 is the same value the plugin
		// takes. A channel made at DEFAULT would show the notification and play
		// nothing, which is the bug this pins.
		expect(readFileSync(RINGER, 'utf8')).toContain('IMPORTANCE_HIGH');
	});
});
