/**
 * Tell the mailing list that a release is out.
 *
 *   make announce-there         # send it, from the box that holds the list
 *   make announce-there DRY=1   # print what would go, send nothing
 *   make announce               # the same, against this machine's database
 *
 * TypeScript, run through `tsx` the way `db-seed` is: it calls the app's own
 * services rather than a copy of them written for a script.
 *
 * The body is the release notes, which already exist and are already the
 * thing the release is described by: `CHANGELOG.md`, from the version in
 * `package.json` (or `--version`) down to the last one the list heard about.
 * Writing them a second time here would be a second answer to what shipped,
 * and the two would disagree by the third release.
 *
 * Run on the instance that holds the list — the addresses are rows in its
 * database, not a file — which is the same box the app runs on.
 */
/*
 * The server's database, bound before anything reads one.
 *
 * `$lib/db` is a binding the services share and nothing opens on its own —
 * whoever owns the connection hands it over, which on a server is this import
 * and in the phone app is the worker. Imported for its side effect, which is
 * why it has no name.
 */
import '../src/lib/server/db/index.js';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

/** The version being released: `--version x.y.z`, or the one in package.json. */
const asked = process.argv.indexOf('--version');
const version =
	asked >= 0
		? process.argv[asked + 1]
		: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const { newsletterEnabled, counts, announced, announcedVersions, announce } =
	await import('../src/lib/server/services/newsletter.js');
const { notesSince } = await import('../src/lib/server/changelog-notes.js');

// Already sent is done, not a failure: `make release` runs this every time,
// and a release run twice must not stop on its second go.
if (announced(version)) {
	console.log(`${version} has already gone out to the list. Nothing to send.`);
	process.exit(0);
}

/*
 * The changelog's lines since the last mail — see `changelog-notes.ts`. The
 * changelog is written for somebody using the app, one bullet per visible
 * change, which is what a message to the list wants to be as well.
 */
const { versions, lines } = notesSince(
	readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'),
	version,
	announcedVersions()
);
if (!lines.length) throw new Error(`CHANGELOG.md lists nothing under ${version}`);

const issue = { version, subject: `Ontoplano ${version}`, lines };

if (DRY) {
	console.log(`subject: ${issue.subject}`);
	console.log(`covers:  ${versions.join(', ')}`);
	console.log(`to:      ${newsletterEnabled() ? counts().confirmed : 0} addresses`);
	console.log();
	for (const line of issue.lines) console.log(`  · ${line}`);
	console.log('\nNothing was sent.');
	process.exit(0);
}

const { sent, failed } = await announce(issue);
console.log(`${issue.subject}: ${sent} sent, ${failed} failed.`);
if (failed) {
	console.log('The failures are retryable from /admin, like every other mail.');
	process.exit(1);
}
