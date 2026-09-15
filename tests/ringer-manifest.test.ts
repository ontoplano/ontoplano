/**
 * The app's own manifest carries what the Ringer needs.
 *
 * The RingerReceiver is woken by BOOT_COMPLETED and puts reminders on the
 * screen, which takes RECEIVE_BOOT_COMPLETED and POST_NOTIFICATIONS. Both
 * also happen to arrive through @capacitor/local-notifications' manifest
 * merge — which is exactly the trap: remove that plugin one day and nothing
 * names what broke, the phone just stops ringing after a restart. The app's
 * own feature must not borrow its permissions from somebody else's manifest.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = readFileSync('capacitor/android/app/src/main/AndroidManifest.xml', 'utf8');

describe('the manifest behind the ringer', () => {
	it('declares the boot permission its boot receiver runs on', () => {
		// The receiver is the reason the permission is needed; assert both so
		// removing either without the other fails by name.
		expect(manifest).toContain('android.intent.action.BOOT_COMPLETED');
		expect(manifest).toContain('android.permission.RECEIVE_BOOT_COMPLETED');
	});

	it('declares the permission its notifications are shown under', () => {
		expect(manifest).toContain('android.permission.POST_NOTIFICATIONS');
	});

	it('keeps the receiver closed to other apps', () => {
		const receiver = /<receiver[^>]*RingerReceiver[^>]*>/s.exec(manifest)?.[0];
		expect(receiver, 'the RingerReceiver is declared').toBeTruthy();
		expect(receiver).toContain('android:exported="false"');
	});
});
