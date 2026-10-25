#!/usr/bin/env node
/**
 * The Obtainium app configuration, and the link that adds it in one press.
 *
 * Obtainium is an Android app that keeps other apps up to date straight from
 * where their releases are published, so it manages the APK on a GitHub
 * release the way a store manages a listing. Nothing had to be built for it:
 * every release already carries exactly one `.apk`, signed with the same key
 * each time, so Obtainium finds it, installs it and updates it in place. What
 * was missing was the link — and a link nobody can read is a link nobody can
 * keep correct by hand, which is why it is generated here.
 *
 * A configuration is a small JSON object (`id`, `url`, `author`, `name`,
 * `additionalSettings`); `obtainium://app/<url-encoded JSON>` opens it in
 * Obtainium. Custom schemes are not clickable in GitHub's Markdown or in most
 * chat apps, so the one written into the docs goes through Obtainium's own
 * redirect page, which validates the payload and says what to do when
 * Obtainium is not installed.
 *
 * Every value comes from this repository rather than from this file: the
 * application id and the app's name from the committed Gradle project — the
 * `official` flavour, which is what a GitHub release carries — and the
 * repository address from `$lib/links`. A fork changes those and the link
 * follows.
 *
 *   node scripts/obtainium-config.mjs            # the config and both links
 *   node scripts/obtainium-config.mjs --json     # the config alone
 *   node scripts/obtainium-config.mjs --link     # the redirect link alone
 *   node scripts/obtainium-config.mjs --check    # the docs still carry it
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const GRADLE = 'capacitor/android/app/build.gradle';
const LINKS = 'src/lib/links.ts';

/**
 * Obtainium's own redirect, which turns the custom scheme into an https link.
 *
 * Markdown renderers drop an `obtainium://` href, so a doc that only carried
 * the scheme would show the words and go nowhere.
 */
const REDIRECT = 'https://apps.obtainium.imranr.dev/redirect';

/**
 * The files that carry the link, and must therefore agree with this.
 *
 * They are prose rather than generated pages, so the link is written into them
 * and `--check` is what keeps it from going stale — the same bargain
 * `check-reminder-window.mjs` makes.
 */
const CARRIERS = ['README.md', 'docs/ANDROID.md', 'docs/prose/on-your-phone.md'];

const read = (where, pattern, what) => {
	const found = pattern.exec(readFileSync(join(ROOT, where), 'utf8'));
	if (!found) {
		console.error(`obtainium: ${where} no longer states ${what}.`);
		process.exit(1);
	}
	return found[1];
};

// The `official` flavour is the one on a GitHub release: `play` shares its id
// but carries the proprietary Billing Library, and the other two are a
// developer's own phone.
const flavour = read(
	GRADLE,
	/official \{[^}]*?applicationId "([^"]+)"/s,
	"the official flavour's applicationId"
);
const name = read(
	GRADLE,
	/official \{[^}]*?resValue "string", "app_name", "([^"]+)"/s,
	"the official flavour's app_name"
);
const source = read(LINKS, /export const SOURCE_URL = '([^']+)';/, 'SOURCE_URL');

// Obtainium takes the author from whoever is asked, not from the URL, and it is
// the owner segment of the repository address.
const author = new URL(source).pathname.split('/').filter(Boolean)[0];

/**
 * `includePrereleases` is Obtainium's own default, and saying it is the point:
 * `make release` publishes a full release per version, so a prerelease here
 * would be something other than a release and must not be offered as an
 * update.
 *
 * Deliberately no `apkFilterRegEx`. A release carries one `.apk`, so there is
 * nothing to choose between, and a filter is baked into every person's copy of
 * this configuration the moment they press the link — renaming the asset later
 * would leave them with an app Obtainium can no longer find an APK for, which
 * is worse than the ambiguity it would guard against.
 */
const config = {
	id: flavour,
	url: source,
	author,
	name,
	additionalSettings: JSON.stringify({ includePrereleases: false })
};

const json = JSON.stringify(config);
const scheme = `obtainium://app/${encodeURIComponent(json)}`;
// `r` is read with `searchParams.get`, so it is decoded once on the way in:
// the scheme link is encoded again to survive being a query value.
const link = `${REDIRECT}?r=${encodeURIComponent(scheme)}`;

const args = process.argv.slice(2);

if (args.includes('--json')) {
	console.log(JSON.stringify(config, null, 2));
} else if (args.includes('--link')) {
	console.log(link);
} else if (args.includes('--check')) {
	const stale = CARRIERS.filter((where) => !readFileSync(join(ROOT, where), 'utf8').includes(link));
	if (stale.length) {
		console.error(
			`obtainium: the add-to-Obtainium link is not the one this repository describes.\n` +
				stale.map((where) => `    ${where}\n`).join('') +
				`  ${flavour} at ${source} now makes:\n    ${link}\n` +
				`  Put that in each file above — node scripts/obtainium-config.mjs --link`
		);
		process.exit(1);
	}
	console.log(`obtainium: ${CARRIERS.length} files carry the link for ${flavour}`);
} else {
	console.log(JSON.stringify(config, null, 2));
	console.log();
	console.log(scheme);
	console.log(link);
}
