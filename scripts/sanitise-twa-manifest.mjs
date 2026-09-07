/**
 * Take somebody's home directory out of the committed Android project.
 *
 * Bubblewrap writes `twa-manifest.json` with the absolute path of whatever
 * signing key it last used — `/home/someone/codes/ontoplano/…` — and that file
 * is in the repository so F-Droid can regenerate from it. Nothing published
 * may name a path on a machine, and the key itself lives outside the checkout
 * now, so the path is rewritten to where it would be relative to the project.
 *
 * Gradle never reads this file: it is Bubblewrap's own record, and the build
 * takes its key from ANDROID_KEYSTORE. So the value only has to be honest
 * about shape, not about any particular machine.
 *
 *   node scripts/sanitise-twa-manifest.mjs android/twa-manifest.json
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
	console.error('usage: node scripts/sanitise-twa-manifest.mjs <twa-manifest.json>');
	process.exit(2);
}

const manifest = JSON.parse(readFileSync(path, 'utf8'));
const alias = manifest.signingKey?.alias ?? 'ontoplano';
manifest.signingKey = { path: './android.keystore', alias };

writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${path}: signing key path made relative`);
