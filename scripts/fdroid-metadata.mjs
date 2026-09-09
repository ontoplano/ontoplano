/**
 * Everything F-Droid needs, written out on demand.
 *
 * F-Droid's own repository — `fdroiddata` — holds one YAML file per app: what
 * it is, where the source is, and one build entry per version they have ever
 * built. Publishing a new version is a merge request that adds an entry to that
 * file. So the file is not a thing to keep a copy of here: it lives in a fork
 * of theirs, it grows on their side, and a stale duplicate in this repository
 * would be a lie a few releases later.
 *
 * What is worth keeping is the *generator*. Every number in that file comes
 * from this repository — the version, the derived versionCode, the tag, the
 * subdirectory — so a script can write it, and updating for a release stops
 * being a thing to get right by hand.
 *
 *   node scripts/fdroid-metadata.mjs                      # a fresh recipe
 *   node scripts/fdroid-metadata.mjs --from path/to.yml   # add this release
 *
 * `--from` takes the recipe as it currently stands in the fdroiddata fork and
 * appends this version to it, leaving every other line exactly as it was. That
 * is the ordinary case after the first submission, and it is done as text
 * rather than by parsing and re-emitting YAML on purpose: their file will
 * eventually carry comments, anti-feature notes and hand edits from reviewers,
 * and a round-trip through a YAML library throws all of that away.
 *
 * It also copies the store listing out of ontoplano-marketing, writes the two
 * pieces of prose that have to be posted by a human, and refuses to pretend a
 * version is ready when the tag it would build does not exist.
 *
 * Output goes to `fdroid-out/`, which is ignored. Nothing here is committed.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGE = 'app.ontoplano.twa';
const SOURCE = 'https://github.com/ontoplano/ontoplano';

const args = process.argv.slice(2);
const flag = (name) => {
	const i = args.indexOf(name);
	return i === -1 ? null : args[i + 1];
};

const OUT = flag('--out') ?? join(ROOT, 'fdroid-out');
const FROM = flag('--from');

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const [major, minor, patch] = version.split('.').map(Number);

/** The same arithmetic `build-twa.mjs` does: 0.110.0 is 11000. */
const versionCode = major * 100000 + minor * 100 + patch;
const tag = `v${version}`;

/* ── The tag has to exist ─────────────────────────────────────────────────── */

/*
 * F-Droid builds a tag, not a branch. A recipe naming one that is not pushed
 * is a merge request that fails in their builder, which costs a review round
 * trip measured in weeks — so it is worth being loud about here.
 */
let tagged;
try {
	execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}`], {
		cwd: ROOT,
		stdio: 'ignore'
	});
	tagged = true;
} catch {
	tagged = false;
}

/* ── The recipe ───────────────────────────────────────────────────────────── */

const buildEntry = `  - versionName: ${version}
    versionCode: ${versionCode}
    commit: ${tag}
    subdir: android/app
    gradle:
      - yes
`;

/**
 * A whole file, for the first submission.
 *
 * `Builds` is a list that only ever grows: F-Droid keeps every version it has
 * built so an old device can still be offered one it can run.
 */
function freshRecipe() {
	return `Categories:
  - Time
License: AGPL-3.0-only
AuthorName: Estevão Lobo
SourceCode: ${SOURCE}
IssueTracker: ${SOURCE}/issues
Changelog: ${SOURCE}/blob/master/CHANGELOG.md

RepoType: git
Repo: ${SOURCE}.git

Builds:
${buildEntry}
AutoUpdateMode: Version
UpdateCheckMode: Tags
CurrentVersion: ${version}
CurrentVersionCode: ${versionCode}
`;
}

/**
 * The recipe as it stands, plus this version.
 *
 * Three edits, all textual: append to `Builds`, and move the two `Current`
 * lines. Everything else — ordering, comments, anti-feature blocks a reviewer
 * added — is left exactly where it was.
 */
function updatedRecipe(existing) {
	if (existing.includes(`versionCode: ${versionCode}\n`)) {
		return { text: existing, already: true };
	}

	const current = /^CurrentVersionCode:.*$/m;
	if (!current.test(existing)) {
		throw new Error(`${FROM} has no CurrentVersionCode line — is it an F-Droid recipe?`);
	}

	// Before the first top-level key that follows the build list, which is
	// where a new entry belongs: newest last, the way their bot writes them.
	const builds = existing.indexOf('\nBuilds:\n');
	if (builds === -1) throw new Error(`${FROM} has no Builds: block`);

	const after = existing.slice(builds + '\nBuilds:\n'.length);
	const ends = after.search(/^\S/m);
	const at = ends === -1 ? existing.length : builds + '\nBuilds:\n'.length + ends;

	// Trailing blank line so the key that follows the list keeps its gap.
	const text = existing.slice(0, at) + buildEntry + '\n' + existing.slice(at);

	return {
		already: false,
		text: text
			.replace(/^CurrentVersion:.*$/m, `CurrentVersion: ${version}`)
			.replace(/^CurrentVersionCode:.*$/m, `CurrentVersionCode: ${versionCode}`)
	};
}

/* ── Writing it all out ───────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'metadata'), { recursive: true });

const recipePath = join(OUT, 'metadata', `${PACKAGE}.yml`);
let note;

if (FROM) {
	const result = updatedRecipe(readFileSync(FROM, 'utf8'));
	writeFileSync(recipePath, result.text);
	note = result.already
		? `${version} was already in that recipe — nothing added`
		: `${version} added to the recipe from ${FROM}`;
} else {
	writeFileSync(recipePath, freshRecipe());
	note = 'a fresh recipe, for the first submission';
}

/* The listing, which lives in the marketing repository because a person
 * cloning this one to fix a bug does not want two megabytes of store
 * furniture. F-Droid reads it from `fdroiddata` when the app's own repository
 * has none, which is exactly our arrangement. */
const listing = join(ROOT, 'ontoplano-marketing', 'store', 'fastlane', 'metadata', 'android');
const listingOut = join(OUT, 'metadata', PACKAGE);
let listed = false;
if (existsSync(listing)) {
	cpSync(listing, listingOut, { recursive: true });
	listed = true;
}

writeFileSync(
	join(OUT, 'RFP.md'),
	`<!-- Post as a new issue at https://gitlab.com/fdroid/rfp/-/issues -->
<!-- Title: ontoplano -->

**Package:** \`${PACKAGE}\`
**Source:** ${SOURCE}
**Licence:** AGPL-3.0-only
**Category:** Time

ontoplano is a life management tool: the week as blocks you draw on a grid,
plus todos, goals, habits, a diary and notebooks, bills, a shopping list,
recipes and a home inventory. It is one app instead of eight, and it is meant
to be self-hosted — the server is the same AGPL repository linked above.

The Android app is a Trusted Web Activity over that site, with home-screen
widgets, push notifications and app shortcuts as native code. On first run it
asks which instance to use — the one I host, or an address you type — so it is
a client for ontoplano and not for my copy of it. The Play build carries Play
Billing; the build in \`android/\` in the repository does not, and has no
proprietary dependencies: it links only \`androidx\` and
\`com.google.androidbrowserhelper\`, both Apache-2.0.

There is a paid plan on the instance I host. Payment happens on the web, not in
the app: there is no in-app purchase code in this build at all.

The Gradle project is committed at \`android/\`, so a build needs no network
beyond Gradle's own dependency fetch:

    git clone --depth 1 ${SOURCE}.git
    cd ontoplano/android && ./gradlew assembleRelease

I have a recipe ready and will open a merge request against fdroiddata.
`
);

writeFileSync(
	join(OUT, 'MERGE-REQUEST.md'),
	`<!-- Description for the fdroiddata merge request -->
<!-- Title: New app: ontoplano (${PACKAGE}) -->

Adds \`${PACKAGE}\` — ontoplano, an AGPL life management tool, and its listing.

**Source:** ${SOURCE}
**Builds:** \`${tag}\`, versionCode \`${versionCode}\`

The Gradle project is committed at \`android/\` in the app repository, so the
build is \`subdir: android/app\` with no prebuilt anything and no init step.

**Native features.** The policy asks for them when an app wraps a website, so:
three home-screen widgets drawing to bitmaps (\`TodayWidgetProvider\` and
friends, plain Java against the app's API), push notifications through the
service worker, and app shortcuts. It is not a browser bookmark.

**On the shape of it.** This is a Trusted Web Activity, so two questions come
up and both have answers:

- *Is the service free software?* Yes, and the app is not tethered to mine. The
  server is this repository, AGPL, and the app asks on first launch which
  instance to talk to — the launcher icon starts a chooser, not the web view,
  and "Switch instance" on its long-press menu changes it later. The origin the
  build names is the default offered, not a fixed target, so I don't believe
  \`NonFreeNet\` applies; say so if you read it differently.
- *Does it need a proprietary browser?* It needs a browser that supports TWAs,
  which is any Chromium-based one — Bromite, Cromite, Vanadium, Chrome. Not
  Play Services, and not Chrome specifically.

**No Play Billing.** The Play Store build links
\`com.google.androidbrowserhelper:billing\`, which pulls the proprietary
\`com.android.billingclient\`. The committed project does not: \`make
android-project\` generates it with billing off precisely so this build is
free. \`aapt2 dump badging\` on the result declares only \`INTERNET\` and
\`POST_NOTIFICATIONS\`.

**Signing, and the URL bar.** A TWA drops its address bar only when the site's
\`/.well-known/assetlinks.json\` names the signing certificate. F-Droid signs
with its own key, so I need that fingerprint to add alongside the Play one
(and to document, so self-hosters can serve it from their own instances) —
the site already serves a list, so it is a configuration change and not a code
one. Tell me the fingerprint and I will add it; without it the app works and
shows an address bar, which I would rather it did not.

Not reproducible for now — happy to work on reproducible builds once this is in.
`
);

/* ── What is left for a person ────────────────────────────────────────────── */

console.log(`\nfdroid-out/ — ${note}\n`);
console.log(`  metadata/${PACKAGE}.yml       the recipe`);
if (listed) console.log(`  metadata/${PACKAGE}/    the listing, copied from marketing`);
console.log('  RFP.md                             post at gitlab.com/fdroid/rfp');
console.log('  MERGE-REQUEST.md                   the fdroiddata merge request\n');

if (!tagged) {
	console.error(`  ⚠  ${tag} is not a tag in this repository.`);
	console.error('     F-Droid builds tags. Cut the release before submitting:\n');
	console.error(`       git tag ${tag} && git push origin ${tag}\n`);
	process.exitCode = 1;
}
