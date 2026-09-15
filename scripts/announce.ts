/**
 * Tell the mailing list that a release is out.
 *
 *   make announce         # send it
 *   make announce DRY=1   # print what would go, send nothing
 *
 * TypeScript, run through `tsx` the way `db-seed` is: it calls the app's own
 * services rather than a copy of them written for a script.
 *
 * The body is the release notes, which already exist and are already the
 * thing the release is described by: `CHANGELOG.md`, under the version in
 * `package.json`. Writing them a second time here would be a second answer to
 * what shipped, and the two would disagree by the third release.
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

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

/**
 * The entry for this version, as sentences.
 *
 * The changelog is written for somebody using the app — one bullet per
 * user-visible change — which is what a message to the list wants to be as
 * well. The bold lead of each bullet is kept; the markdown around it is not,
 * because this becomes a plain-text mail.
 */
function notesFor(release: string): string[] {
	const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
	const start = changelog.indexOf(`## ${release} —`);
	if (start < 0) throw new Error(`CHANGELOG.md has no entry for ${release}`);

	const rest = changelog.slice(start);
	const end = rest.indexOf('\n## ', 1);
	const body = end < 0 ? rest : rest.slice(0, end);

	return body
		.split('\n- ')
		.slice(1)
		.map((bullet) =>
			bullet
				.replace(/\*\*/g, '')
				.replace(/`/g, '')
				.split('\n')
				.map((line) => line.trim())
				.join(' ')
				.trim()
		)
		.filter(Boolean);
}

const lines = notesFor(version);
if (!lines.length) throw new Error(`CHANGELOG.md lists nothing under ${version}`);

const issue = { version, subject: `Ontoplano ${version}`, lines };

if (DRY) {
	const { newsletterEnabled, counts, announced } =
		await import('../src/lib/server/services/newsletter.js');
	console.log(`subject: ${issue.subject}`);
	console.log(`to:      ${newsletterEnabled() ? counts().confirmed : 0} confirmed addresses`);
	console.log(`already sent: ${announced(version)}`);
	console.log();
	for (const line of issue.lines) console.log(`  · ${line}`);
	console.log('\nNothing was sent.');
	process.exit(0);
}

const { announce } = await import('../src/lib/server/services/newsletter.js');
const { sent, failed } = await announce(issue);
console.log(`${issue.subject}: ${sent} sent, ${failed} failed.`);
if (failed) {
	console.log('The failures are retryable from /admin, like every other mail.');
	process.exit(1);
}
