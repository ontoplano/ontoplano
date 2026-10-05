#!/usr/bin/env node
/**
 * Where the Android SDK is on this machine.
 *
 * Printed on stdout so a make recipe can use it, and looked for in the places
 * it actually turns up rather than in one: an SDK installed by Android Studio
 * is not where one installed by `sdkmanager` is.
 *
 * Says nothing and exits 1 when there is none, so the caller can print
 * something useful about the command being run.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const home = homedir();

/** An `adb` on PATH is inside `platform-tools`, which is inside the SDK. */
function fromAdb() {
	try {
		const adb = execFileSync('sh', ['-c', 'command -v adb'], { encoding: 'utf8' }).trim();
		if (!adb) return null;
		const platformTools = join(adb, '..', '..');
		return existsSync(join(platformTools, 'platform-tools')) ? platformTools : null;
	} catch {
		return null;
	}
}

const candidates = [
	process.env.ANDROID_HOME,
	process.env.ANDROID_SDK_ROOT,
	join(home, 'android-sdk'),
	join(home, 'Android', 'Sdk'),
	join(home, 'Library', 'Android', 'sdk'),
	fromAdb()
];

const found = candidates.find((path) => path && existsSync(path));
if (!found) process.exit(1);
console.log(found);
