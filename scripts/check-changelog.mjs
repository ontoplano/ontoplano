/**
 * The changelog and the version cannot drift apart.
 *
 * The rule was already written down — bump the version in the same commit,
 * every user-visible change gets a line under it — and it was broken anyway,
 * twelve commits in a row, because `## Unreleased` was there to write under and
 * nothing checked. A rule that has to be remembered is a rule that gets missed;
 * this is the same bargain as `docs:check`, which is why it runs beside it.
 *
 * What it enforces, and nothing more:
 *
 *   1. The first heading in CHANGELOG.md names the version in package.json.
 *   2. It carries a date.
 *   3. There is no unversioned section anywhere — no "Unreleased", no "Next".
 *
 * So adding a line means opening a heading, and opening a heading means bumping
 * the version, which is what makes the version on /settings/instance answer
 * "did I deploy the thing I think I deployed".
 *
 *   node scripts/check-changelog.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');

const headings = [...changelog.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
const problems = [];

if (headings.length === 0) {
	problems.push('CHANGELOG.md has no version headings at all.');
} else {
	const first = headings[0];
	const match = /^(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})$/.exec(first);

	if (!match) {
		problems.push(
			`The first heading is "## ${first}".\n` +
				`  It has to read "## ${version} — YYYY-MM-DD": a version, an em dash, a date.`
		);
	} else if (match[1] !== version) {
		problems.push(
			`The changelog's newest version is ${match[1]}, package.json says ${version}.\n` +
				`  Bump package.json in the same commit, or write the entry under ${version}.`
		);
	}
}

const unversioned = headings.filter((h) => /unreleased|unversioned|next|upcoming|wip/i.test(h));
for (const heading of unversioned) {
	problems.push(
		`"## ${heading}" is a section with no version.\n` +
			`  There is no such thing here: an entry belongs to a version, and a version\n` +
			`  is what a running instance can show. Bump and give it a heading.`
	);
}

if (problems.length) {
	console.error('The changelog and package.json disagree.\n');
	for (const p of problems) console.error(`  ${p}\n`);
	process.exit(1);
}

console.log(`changelog: ${version} is the newest entry`);
