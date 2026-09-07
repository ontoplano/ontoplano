/**
 * No key, in the tree or in the history.
 *
 * The Android signing key is the one secret here that cannot be rotated out of
 * a mistake: publishing it lets anybody ship an update as this app, and losing
 * it means never shipping one again. It used to default to a path inside the
 * checkout, safe only for as long as a line of `.gitignore` held — and the
 * F-Droid packaging wants that very line changed.
 *
 * So safety does not rest on the ignore file, or on remembering. This walks
 * what git actually tracks and fails on anything shaped like a key. It runs
 * from `make lint`, which is what makes it true rather than intended.
 *
 * It reads names, never contents: a scan that opened files would be a scan
 * that could print what it found.
 *
 *   node scripts/check-no-secrets.mjs
 */
import { execFileSync } from 'node:child_process';

/*
 * Names, not contents. Each of these is a container for a private key or the
 * passphrase to one — there is no version of this project in which a tracked
 * file called `something.keystore` is correct.
 */
const FORBIDDEN = [
	{ pattern: /\.(keystore|jks|p12|pfx)$/i, what: 'a Java or PKCS#12 key store' },
	{ pattern: /\.keystore\.pass$/i, what: 'a key store passphrase' },
	{ pattern: /(^|\/)(id_rsa|id_ed25519|id_ecdsa)$/, what: 'an SSH private key' },
	{ pattern: /\.pem$/i, what: 'a PEM file, which may hold a private key' },
	{ pattern: /(^|\/)creds\.env$/, what: 'a credentials file' },
	{ pattern: /(^|\/)service-account.*\.json$/i, what: 'a service account key' }
];

/*
 * Files that match a pattern and are not the thing it is looking for. Kept
 * short and explicit: a growing list of exceptions is how a check like this
 * stops meaning anything.
 */
const ALLOWED = new Set([]);

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
	.split('\0')
	.filter(Boolean);

const found = [];
for (const file of tracked) {
	if (ALLOWED.has(file)) continue;
	const hit = FORBIDDEN.find(({ pattern }) => pattern.test(file));
	if (hit) found.push(`${file} — ${hit.what}`);
}

if (found.length > 0) {
	console.error('\nSecrets are tracked by git:\n');
	for (const line of found) console.error(`  ${line}`);
	console.error(
		'\nRemove it from the index, and if it has been pushed, treat it as public:\n' +
			'  git rm --cached <file>\n' +
			'A signing key that has been published cannot be un-published — mint a new\n' +
			'one, and remember Play will not accept an update signed with it.\n'
	);
	process.exit(1);
}

console.log(`secrets: ${tracked.length} tracked files, none of them a key`);
