#!/usr/bin/env node
/**
 * The changelog entry for the version in `package.json`, on its own.
 *
 * A release's notes should be the thing already written rather than a summary
 * somebody types twice — `make release` pipes this into `gh release create`.
 * Nothing here decides anything: the version comes from `package.json`, the
 * words come from `CHANGELOG.md`, and if the two disagree this says so rather
 * than publishing a release with the wrong version's notes in it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');

const heading = new RegExp(`^## ${version.replace(/\./g, '\\.')}(?: —.*)?$`, 'm');
const at = changelog.search(heading);
if (at === -1) {
	console.error(`CHANGELOG.md has no section for ${version}.`);
	process.exit(1);
}

const rest = changelog.slice(at);
const next = rest.slice(1).search(/^## /m);
const section = (next === -1 ? rest : rest.slice(0, next + 1)).trim();

// Without its own heading: GitHub puts the version at the top of the page
// already, and a release titled v0.40.0 whose body opens with "0.40.0" reads
// like a mistake.
console.log(section.split('\n').slice(1).join('\n').trim());
