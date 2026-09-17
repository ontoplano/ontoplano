import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

/**
 * What the app must declare before a page can reach a microphone.
 *
 * Capacitor's web view client answers the page's request by asking Android for
 * RECORD_AUDIO *and* MODIFY_AUDIO_SETTINGS together, and it grants the page
 * only if every one of them comes back granted — see `onPermissionRequest` in
 * `BridgeWebChromeClient`.
 *
 * MODIFY_AUDIO_SETTINGS is a normal permission: Android grants it at install
 * and never asks, but only to an app that declares it. Undeclared it comes
 * back denied, so the pair fails however firmly somebody has just said yes to
 * the microphone — the dialog appears, "Only this time" is chosen, and the app
 * still says the device would not give it one.
 *
 * Both, therefore, or recording does not work on a phone. Nothing in a build
 * or a browser test can see this, which is why it is written down.
 */
const MANIFEST = 'capacitor/android/app/src/main/AndroidManifest.xml';

describe('the Android manifest', () => {
	const manifest = readFileSync(MANIFEST, 'utf8');

	for (const permission of ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS']) {
		test(`declares ${permission}, which the web view's own client asks for`, () => {
			expect(manifest).toContain(`android.permission.${permission}`);
		});
	}

	test('asks for nothing about the camera, which nothing here wants', () => {
		expect(manifest).not.toContain('android.permission.CAMERA');
	});
});
