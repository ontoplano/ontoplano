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

const PACKAGE = 'app.ontoplano';
const SOURCE = 'https://github.com/ontoplano/ontoplano';

const args = process.argv.slice(2);
const flag = (name) => {
	const i = args.indexOf(name);
	return i === -1 ? null : args[i + 1];
};

const OUT = flag('--out') ?? join(ROOT, 'fdroid-out');
const FROM = flag('--from');

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

/*
 * Read from the committed Gradle project, not derived again here: the number
 * F-Droid's builder produces is whatever `capacitor/android/app/build.gradle`
 * says, and a second copy of the arithmetic (`android-flavours.mjs` writes
 * that file) is a number that drifts.
 */
const gradle = readFileSync(join(ROOT, 'capacitor/android/app/build.gradle'), 'utf8');
const versionCode = Number(/versionCode (\d+)/.exec(gradle)?.[1]);
const gradleVersion = /versionName "([^"]+)"/.exec(gradle)?.[1];
if (!versionCode || gradleVersion !== version) {
	console.error(
		`package.json says ${version} but capacitor/android/app/build.gradle says ` +
			`${gradleVersion ?? 'nothing'} (${versionCode || '?'}). Regenerate it: make android-project`
	);
	process.exit(1);
}
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

/*
 * The build entry, and every line of it is a fact about this repository:
 *
 * - `gradle: - official`: the project has flavours (official, dev, staging —
 *   one per instance a developer talks to) and F-Droid builds the official
 *   one. `yes` would ask for a flavourless project this is not.
 * - The web app the shell carries is NOT committed (`assets/public` is
 *   ignored), so the builder makes it from source: the root yarn workspace,
 *   the isolated build (`ONTOPLANO_ISOLATED_BUILD=1`, the same thing `make
 *   android` runs), and `cap sync` to put it into the project. Node 20 in
 *   their image is too old for the toolchain, hence the pinned tarball.
 *
 * REHEARSE THIS before every submission — `fdroid build` in their server
 * image, see ontoplano-marketing/store/FDROID-RELEASE.md — because a recipe
 * that fails in their builder costs a review round trip measured in weeks.
 */
const NODE_BUILD = 'v22.14.0';
const buildEntry = `  - versionName: ${version}
    versionCode: ${versionCode}
    commit: ${tag}
    subdir: capacitor/android/app
    sudo:
      - curl -Lo /tmp/node.tar.xz https://nodejs.org/dist/${NODE_BUILD}/node-${NODE_BUILD}-linux-x64.tar.xz
      - tar -xJf /tmp/node.tar.xz -C /opt
      - for b in node npm npx corepack; do ln -sf /opt/node-${NODE_BUILD}-linux-x64/bin/$b /usr/local/bin/$b; done
      - npm install -g yarn
    init:
      - cd ../../.. && yarn install --frozen-lockfile
      - cd ../.. && npm ci --no-audit --no-fund
    prebuild:
      - cd ../../.. && NODE_OPTIONS=--max-old-space-size=4096 ONTOPLANO_ISOLATED_BUILD=1
        PUBLIC_ONTOPLANO_ISOLATED=true yarn build && cd capacitor && npx cap sync android
    gradle:
      - official
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
License: AGPL-3.0-or-later
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
**Licence:** AGPL-3.0-or-later
**Category:** Time

ontoplano is a life management tool: the week as blocks you draw on a grid,
plus todos, goals, habits, a diary and notebooks, finances, a shopping list,
recipes and a home inventory. It is one app instead of eight, and it is meant
to be self-hosted — the server is the same AGPL repository linked above.

The Android app carries the whole of ontoplano inside it (a Capacitor shell
around the same code). On first launch it asks where your ontoplano lives:
an instance you host, the one I host, or this phone by itself — no account,
no server, nothing leaves the device. So it is a client for ontoplano, not
for my copy of it, and it is complete without any network at all.

Native pieces: three home-screen widgets in plain Java, reminders booked with
Android's own alarms, and links that leave ontoplano open outside the app.
Dependencies are androidx and Capacitor with three of its plugins (app,
browser, local-notifications) — no Play services, no billing library, nothing
proprietary in the committed project.

There is a paid plan on the instance I host. Payment happens on the web, not
in the app: there is no in-app purchase code in this build at all.

The Gradle project is committed at \`capacitor/android/\`; the web app it
carries is built from the same repository (see the recipe in the merge
request I will open against fdroiddata).
`
);

writeFileSync(
	join(OUT, 'MERGE-REQUEST.md'),
	`<!-- Description for the fdroiddata merge request -->
<!-- Title: New app: ontoplano (${PACKAGE}) -->

Adds \`${PACKAGE}\` — ontoplano, an AGPL life management tool, and its listing.

**Source:** ${SOURCE}
**Builds:** \`${tag}\`, versionCode \`${versionCode}\`

**Shape.** A Capacitor shell carrying the whole app: the Gradle project is
committed at \`capacitor/android/\` and the web app inside it is NOT a
committed blob — the recipe builds it from the same tag (node toolchain in
\`sudo:\`, the isolated build in \`prebuild:\`, then \`cap sync\`).
\`gradle: official\` names the flavour to build; the dev and staging
flavours exist for development against other instances.

**Not a wrapper.** On first launch the app asks where your ontoplano lives:
an instance you host, the official one, or this phone by itself — the last
one runs the entire app on the device with no account and no network, so the
app is complete without any service, mine included. The address the build
suggests is a default, not a target; I don't believe \`NonFreeNet\` applies,
say so if you read it differently.

**Native features**, since the policy asks when an app carries a web view:
three home-screen widgets drawing to bitmaps (\`TodayWidgetProvider\` and
friends, plain Java), reminders booked with Android's own alarms
(\`@capacitor/local-notifications\`), links that leave ontoplano opening
outside the app, and the back gesture walking the app's own history.

**Nothing proprietary.** Dependencies are androidx, Capacitor and three of
its plugins (app, browser, local-notifications). No Play services and no
billing library anywhere in this project: there is a paid plan on the
instance I host, paid on the web — the app contains no purchase code, and
pages drawn inside it do not offer a checkout.

**Permissions**: \`INTERNET\`, plus what the notifications plugin declares
for reminders (\`POST_NOTIFICATIONS\`, exact alarms).

Not reproducible for now — happy to work on reproducible builds once this is
in.
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
	// `github`, not `origin`: F-Droid's builder clones the public GitHub
	// repository, and in this checkout `origin` is the forge.
	console.error(`       git tag ${tag} && git push github ${tag}\n`);
	process.exitCode = 1;
}
