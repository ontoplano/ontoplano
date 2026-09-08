/**
 * The committed Android project is the one F-Droid can build.
 *
 * `android/` is generated and checked in so F-Droid can build a tag on a
 * machine with no network. Generated and checked in is exactly the arrangement
 * where a file goes stale: the app was on 0.110.0 while the project still said
 * 0.101.0, which would have published a build announcing a version that had
 * been superseded nine times.
 *
 * It matters more than an ordinary stale file. Play refuses an upload whose
 * versionCode it has seen, and F-Droid decides what is new by comparing the
 * one in the built APK against the one in its recipe — so a wrong number here
 * is a release that cannot be uploaded or one that nobody is offered.
 *
 * It also checks that Play Billing is not in it. `androidbrowserhelper:billing`
 * pulls `com.android.billingclient`, which is proprietary, and F-Droid builds
 * from source with free dependencies only — so its presence here is not a
 * stale file but a submission that gets rejected. `make android` writes the
 * Play build, with billing, into an ignored directory; regenerating this one
 * with the wrong command is the easy mistake, and this is the thing that
 * catches it.
 *
 * `make android-project` regenerates it. This only checks, so it runs
 * anywhere, including a CI machine with no Android SDK.
 *
 *   node scripts/check-android-version.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADLE = join(ROOT, 'android', 'app', 'build.gradle');

if (!existsSync(GRADLE)) {
	console.log('android: no committed project to check');
	process.exit(0);
}

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const gradle = readFileSync(GRADLE, 'utf8');

const name = /versionName\s+"([^"]+)"/.exec(gradle)?.[1];
const code = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);

/**
 * The same arithmetic `build-twa.mjs` does: 0.110.0 is 11000, 1.2.3 is 100203.
 * Duplicated on purpose — importing the builder would pull in Bubblewrap and
 * the SDK checks, which is a great deal of machinery for reading two numbers.
 */
const [major, minor, patch] = version.split('.').map(Number);
const expected = major * 100000 + minor * 100 + patch;

const wrong = [];
if (name !== version) wrong.push(`versionName is "${name}", package.json says "${version}"`);
if (code !== expected) wrong.push(`versionCode is ${code}, ${version} is ${expected}`);

if (/androidbrowserhelper:billing/.test(gradle)) {
	wrong.push('Play Billing is linked — F-Droid cannot build a proprietary dependency');
}

const MANIFEST = join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (existsSync(MANIFEST) && /com\.android\.vending\.BILLING/.test(readFileSync(MANIFEST, 'utf8'))) {
	wrong.push('the manifest declares com.android.vending.BILLING');
}

if (wrong.length > 0) {
	console.error('\nThe committed Android project is not the one to ship:\n');
	for (const line of wrong) console.error(`  ${line}`);
	console.error('\n  make android-project\n');
	process.exit(1);
}

console.log(`android: the committed project is ${version} (${code}), no billing`);
