#!/usr/bin/env node
/**
 * Ontoplano as something a distribution's package manager installs.
 *
 *   yarn package            # every format this machine can build
 *   yarn package deb        # just the .deb
 *   yarn package rpm arch   # or a list
 *
 * Three formats, from one staged tree:
 *
 *   deb    Debian, Ubuntu, Mint, Pop!_OS, Raspberry Pi OS
 *   rpm    Fedora, RHEL and its rebuilds, openSUSE
 *   arch   a PKGBUILD for the AUR — source, built on the user's machine
 *
 * ## Why the .deb and the .rpm carry their own Node
 *
 * `better-sqlite3` is a native module: it is compiled against one Node ABI and
 * refuses to load under any other. The distributions above ship Node 18, 20, 22
 * and 24 between them, and a package built against one of those crash-loops
 * with `ERR_DLOPEN_FAILED` on the rest. The choice is a package per distribution
 * release, or one package that brings the runtime it was compiled against. This
 * takes the second: about 50MB, and it works the same everywhere.
 *
 * The Arch package does not, because a PKGBUILD is built on the machine that
 * will run it — there is exactly one Node there, and it is the right one.
 *
 * ## What it makes, and where
 *
 * `dist/` — one file per format, named for the version and the architecture.
 * Nothing is signed here: signing belongs to whoever publishes, with a key this
 * script must never see.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version;
const OUT = join(ROOT, 'dist');
const WORK = join(ROOT, '.package-work');

/** The Node the packages carry. Pinned, so a rebuild is the same package. */
const NODE_VERSION = '22.14.0';

const ARCHES = {
	// dpkg, rpm and Node each spell the same machine differently.
	x64: { deb: 'amd64', rpm: 'x86_64', node: 'linux-x64' },
	arm64: { deb: 'arm64', rpm: 'aarch64', node: 'linux-arm64' }
};

const say = (m) => console.log(m);
const run = (cmd, args, opts = {}) =>
	execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
const quiet = (cmd, args, opts = {}) =>
	execFileSync(cmd, args, { encoding: 'utf8', cwd: ROOT, ...opts });
const has = (cmd) => {
	try {
		execFileSync('command', ['-v', cmd], { shell: '/bin/sh', stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
};

/* ─────────────────────────────────────────────────────── the staged tree ── */

/**
 * Everything that lands on disk, laid out exactly as it will be installed.
 *
 * Built once and reused by every format, so the .deb and the .rpm cannot
 * disagree about what is in them — which is the failure this shape exists to
 * prevent, and the reason the formats are not three separate scripts.
 */
function stage({ bundleNode, arch }) {
	const root = join(WORK, 'root');
	rmSync(root, { recursive: true, force: true });

	const lib = join(root, 'usr/lib/ontoplano');
	mkdirSync(lib, { recursive: true });
	mkdirSync(join(root, 'usr/bin'), { recursive: true });
	mkdirSync(join(root, 'usr/lib/systemd/system'), { recursive: true });
	mkdirSync(join(root, 'usr/lib/sysusers.d'), { recursive: true });
	mkdirSync(join(root, 'usr/lib/tmpfiles.d'), { recursive: true });
	mkdirSync(join(root, 'etc/ontoplano'), { recursive: true });
	mkdirSync(join(root, 'usr/share/doc/ontoplano'), { recursive: true });

	// The app, as `yarn build` leaves it.
	if (!existsSync(join(ROOT, 'build/index.js'))) {
		throw new Error('build/index.js is missing — run `yarn build` first');
	}
	cpSync(join(ROOT, 'build'), join(lib, 'build'), { recursive: true });
	cpSync(join(ROOT, 'drizzle'), join(lib, 'drizzle'), { recursive: true });
	cpSync(join(ROOT, 'scripts/migrate.mjs'), join(lib, 'migrate.mjs'));
	cpSync(join(ROOT, 'scripts/db-snapshot.mjs'), join(lib, 'db-snapshot.mjs'));

	// `package.json`, trimmed to what a running instance reads: the type field
	// (without it Node treats the .mjs siblings' imports as CommonJS) and the
	// version the app reports on /healthz.
	writeFileSync(
		join(lib, 'package.json'),
		JSON.stringify({ name: PKG.name, version: VERSION, type: PKG.type }, null, '\t') + '\n'
	);
	writeFileSync(join(lib, 'VERSION'), VERSION + '\n');

	// The runtime first, then the modules — in that order, always. The native
	// module is compiled against whichever Node installs it, so installing with
	// the build machine's Node and then shipping a different one produces a
	// package that cannot open its own database: better-sqlite3 looks for
	// `node-v127-linux-x64` and finds `node-v115`. The bundled runtime has to
	// exist before the install runs, so the install can be run under it.
	const { runtime, toolchain } = bundleNode
		? bundleRuntime(lib, arch)
		: { runtime: process.execPath, toolchain: dirname(process.execPath) };
	productionModules(lib, toolchain);
	rebuildNative(lib, toolchain);
	stripBinShims(lib);
	assertOpens(lib, runtime);

	for (const name of ['run', 'migrate', 'ontoplano', 'jobs']) {
		cpSync(join(ROOT, 'packaging/bin', name), join(lib, name));
		chmodSync(join(lib, name), 0o755);
	}
	// /usr/bin/ontoplano is a two-line shim rather than a symlink: rpm and dpkg
	// both handle symlinks fine, but a shim survives an operator who moves the
	// tree, and it is one less thing that differs between the formats.
	writeFileSync(
		join(root, 'usr/bin/ontoplano'),
		'#!/bin/sh\nexec /usr/lib/ontoplano/ontoplano "$@"\n'
	);
	chmodSync(join(root, 'usr/bin/ontoplano'), 0o755);

	cpSync(
		join(ROOT, 'packaging/systemd/ontoplano.service'),
		join(root, 'usr/lib/systemd/system/ontoplano.service')
	);
	// The reminders timer rides along — without it the app works perfectly
	// and never reminds anybody of anything. The weekly review mail does NOT:
	// it needs SMTP, which a packaged install rarely has, and a timer that can
	// never send reads as working. Setting it up is docs/running-it's manual
	// step.
	for (const unit of ['ontoplano-reminders.service', 'ontoplano-reminders.timer']) {
		cpSync(join(ROOT, 'packaging/systemd', unit), join(root, 'usr/lib/systemd/system', unit));
	}
	cpSync(
		join(ROOT, 'packaging/systemd/ontoplano.sysusers'),
		join(root, 'usr/lib/sysusers.d/ontoplano.conf')
	);
	cpSync(
		join(ROOT, 'packaging/systemd/ontoplano.tmpfiles'),
		join(root, 'usr/lib/tmpfiles.d/ontoplano.conf')
	);
	cpSync(join(ROOT, 'packaging/ontoplano.env'), join(root, 'etc/ontoplano/ontoplano.env'));
	cpSync(join(ROOT, 'LICENSE'), join(root, 'usr/share/doc/ontoplano/LICENSE'));
	cpSync(join(ROOT, 'CHANGELOG.md'), join(root, 'usr/share/doc/ontoplano/CHANGELOG.md'));

	return root;
}

/**
 * The production `node_modules`, installed somewhere else entirely.
 *
 * The first version of this pruned the repository's own `node_modules` with
 * `yarn install --production`, copied the result, and put the development tree
 * back afterwards. It did not put it back properly: what survived was the
 * production `.bin`, so the next `make deploy` on the developer's machine said
 * `vite: command not found` — and `yarn` refused to fix it, because the
 * integrity file said the install was already up to date.
 *
 * Building a package must not touch the tree it is built from. `--modules-folder`
 * installs into the staged package instead, so nothing outside `.package-work`
 * and `dist` is written at all, and there is no restore step to get wrong.
 */
function productionModules(lib, toolchain) {
	say('  the production node_modules');
	run(
		'yarn',
		[
			'install',
			'--frozen-lockfile',
			'--production',
			'--silent',
			'--modules-folder',
			join(lib, 'node_modules')
		],
		{
			// PATH, not a flag: yarn is a script with `#!/usr/bin/env node`, and
			// everything under it — prebuild-install choosing which prebuilt binary
			// to fetch, node-gyp choosing which headers to compile against — reads
			// the ABI of the Node it is running under. Putting the bundled one first
			// is what makes the whole tree agree.
			env: { ...process.env, PATH: `${toolchain}:${process.env.PATH}` }
		}
	);
}

/**
 * The Node runtime, downloaded and checked against the official manifest.
 *
 * Verified rather than trusted: an unverified download in a build that produces
 * something other people install is the supply chain, and `SHASUMS256.txt` is
 * published beside the tarball for exactly this.
 */
function bundleRuntime(lib, arch) {
	const slug = `node-v${NODE_VERSION}-${ARCHES[arch].node}`;
	const tarball = join(WORK, `${slug}.tar.xz`);
	const base = `https://nodejs.org/dist/v${NODE_VERSION}`;

	if (!existsSync(tarball)) {
		say(`  downloading ${slug}`);
		mkdirSync(WORK, { recursive: true });
		run('curl', ['-fsSL', '-o', tarball, `${base}/${slug}.tar.xz`]);
	}

	const sums = quiet('curl', ['-fsSL', `${base}/SHASUMS256.txt`]);
	const wanted = sums
		.split('\n')
		.find((line) => line.endsWith(`  ${slug}.tar.xz`))
		?.split(' ')[0];
	const got = createHash('sha256').update(readFileSync(tarball)).digest('hex');
	if (!wanted) throw new Error(`no checksum published for ${slug}.tar.xz`);
	if (wanted !== got) {
		rmSync(tarball, { force: true });
		throw new Error(`${slug}.tar.xz does not match its published checksum — refusing to ship it`);
	}
	say(`  ${slug} matches its published checksum`);

	// Unpacked whole, here, because the rebuild below needs its npm — and then
	// only the binary is copied into the package. `npm`, `npx`, the headers and
	// the manual pages are another 30MB of things a service account never opens.
	const full = join(WORK, slug);
	if (!existsSync(join(full, 'bin/node'))) {
		mkdirSync(full, { recursive: true });
		run('tar', ['-xJf', tarball, '-C', full, '--strip-components=1']);
	}

	const into = join(lib, 'node/bin');
	mkdirSync(into, { recursive: true });
	cpSync(join(full, 'bin/node'), join(into, 'node'));
	chmodSync(join(into, 'node'), 0o755);

	return { runtime: join(into, 'node'), toolchain: join(full, 'bin') };
}

/**
 * The native module, compiled for the runtime that is going in the box.
 *
 * `yarn install --production` prunes the development packages and leaves
 * everything else exactly as it found it — including better-sqlite3's already
 * compiled `build/Release/better_sqlite3.node`, which on this machine is built
 * for whatever Node the developer has. Shipping that beside a different runtime
 * is a package that installs cleanly and cannot open its own database.
 *
 * `npm rebuild` under the bundled Node fetches the published binary for that
 * ABI, or compiles one if there is none.
 */
function rebuildNative(lib, toolchain) {
	say('  rebuilding better-sqlite3 for the packaged runtime');
	run(join(toolchain, 'npm'), ['rebuild', 'better-sqlite3'], {
		cwd: lib,
		env: { ...process.env, PATH: `${toolchain}:${process.env.PATH}` },
		stdio: 'pipe'
	});
}

/**
 * The `.bin` shims, which point at this machine.
 *
 * yarn writes `node_modules/.bin/*` as absolute symlinks into the tree it
 * installed from, so a copied `node_modules` carries links to `/workspace/...`
 * that are dangling everywhere else. rpmbuild says so out loud; dpkg ships them
 * in silence. Nothing at runtime uses them — the unit runs `build/index.js` and
 * the migrator runs a .mjs — so they go rather than being repaired.
 */
function stripBinShims(lib) {
	const found = quiet('find', [join(lib, 'node_modules'), '-name', '.bin', '-type', 'd'])
		.split('\n')
		.filter(Boolean);
	for (const dir of found) rmSync(dir, { recursive: true, force: true });
	if (found.length)
		say(`  dropped ${found.length} .bin director${found.length === 1 ? 'y' : 'ies'}`);
}

/**
 * The check that the ABI actually agrees, before anybody installs it.
 *
 * This is the failure the whole ordering above exists to prevent, and it is
 * invisible until the service starts: the package installs cleanly, the unit
 * crash-loops, and the journal says ERR_DLOPEN_FAILED with a list of paths. One
 * `require` here turns that into a build that stops.
 */
function assertOpens(lib, runtime) {
	try {
		// `new Database`, not `require`: better-sqlite3 loads its binary lazily,
		// on the first database it opens. An import of it succeeds under a runtime
		// it cannot possibly work with, which is exactly how a broken package got
		// as far as being installed.
		execFileSync(runtime, ['-e', "new (require('better-sqlite3'))(':memory:').close()"], {
			cwd: lib,
			stdio: 'pipe'
		});
	} catch (error) {
		const said = String(error.stderr ?? error.message);
		throw new Error(
			`better-sqlite3 cannot open a database under the runtime this package ships.\n` +
				`The native module and the Node in the package were built for different ABIs.\n\n${said}`,
			{ cause: error }
		);
	}
	say('  the packaged runtime opens a database');
}

/* ────────────────────────────────────────────────────────────── the .deb ── */

const MAINTAINER_SCRIPTS = {
	/**
	 * After unpacking: the account, the directory, the secret, the database.
	 *
	 * Every step is written so that running it twice changes nothing — which is
	 * what an upgrade does, and what a half-finished install leaves behind.
	 */
	postinst: `#!/bin/sh
set -e

# The service account and its directory, through systemd's own tools rather
# than useradd — every distribution this package targets ships them, and the
# hand-rolled version is where the differences between them live.
if command -v systemd-sysusers >/dev/null 2>&1; then
	systemd-sysusers /usr/lib/sysusers.d/ontoplano.conf >/dev/null 2>&1 || true
fi
if command -v systemd-tmpfiles >/dev/null 2>&1; then
	systemd-tmpfiles --create /usr/lib/tmpfiles.d/ontoplano.conf >/dev/null 2>&1 || true
fi

# The session secret: made once, never regenerated. Changing it signs everybody
# out, so an upgrade that rewrote this file would look like the app losing
# every login for no reason.
secret=/etc/ontoplano/secret.env
if [ ! -s "$secret" ]; then
	umask 077
	printf 'BETTER_AUTH_SECRET=%s\\n' "$(head -c 32 /dev/urandom | base64 | tr -d '\\n')" > "$secret"
fi
# The health token: what the companion timers ask the app's job endpoints
# with. Appended rather than rewritten, because the secret above may already
# be there from an earlier version.
if ! grep -q '^ONTOPLANO_HEALTH_TOKEN=' "$secret" 2>/dev/null; then
	umask 077
	printf 'ONTOPLANO_HEALTH_TOKEN=%s\\n' "$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')" >> "$secret"
fi
chown root:ontoplano "$secret" 2>/dev/null || true
chmod 640 "$secret"
chown root:ontoplano /etc/ontoplano/ontoplano.env 2>/dev/null || true
chmod 640 /etc/ontoplano/ontoplano.env

# The database, brought to this version before the service that opens it starts.
# An upgrade migrates without being asked; a first install creates the file.
/usr/lib/ontoplano/migrate >/dev/null || {
	echo "ontoplano: the database could not be migrated — the service was not started." >&2
	echo "  sudo ontoplano migrate     to see why" >&2
	exit 0
}
chown -R ontoplano:ontoplano /var/lib/ontoplano 2>/dev/null || true
`,
	prerm: `#!/bin/sh
set -e
`,
	postrm: `#!/bin/sh
set -e

# The database and the secret are deliberately left behind on remove: they are
# the person's, not the package's. \`purge\` is the word that means "and the data
# too", and it is the only one that takes them.
if [ "$1" = purge ]; then
	rm -rf /var/lib/ontoplano
	rm -f /etc/ontoplano/secret.env
	rmdir /etc/ontoplano 2>/dev/null || true
fi
`
};

function buildDeb(arch) {
	const debArch = ARCHES[arch].deb;
	say(`\ndeb (${debArch})`);
	const root = stage({ bundleNode: true, arch });

	const debian = join(root, 'DEBIAN');
	mkdirSync(debian, { recursive: true });

	const size = Math.ceil(Number(quiet('du', ['-sk', root]).split('\t')[0]));
	writeFileSync(
		join(debian, 'control'),
		[
			'Package: ontoplano',
			`Version: ${VERSION}`,
			`Architecture: ${debArch}`,
			'Maintainer: Estevão <contact@ontoplano.com>',
			`Installed-Size: ${size}`,
			// No `nodejs` dependency: the runtime is in the package. `adduser` and
			// `systemd` are what the maintainer scripts actually call.
			'Depends: systemd, coreutils',
			'Section: web',
			'Priority: optional',
			'Homepage: https://ontoplano.com',
			'Description: Life management on your own machine',
			' A planner, a diary, a cookbook, a shopping list, goals, habits and the',
			' people in your life — those are some of the rooms, not all of them. It',
			' keeps everything in one SQLite file that belongs to you: one process,',
			' no database server, nothing that phones anywhere.',
			' .',
			' The service listens on 127.0.0.1:1493 and is not started until you have',
			' set ORIGIN in /etc/ontoplano/ontoplano.env.'
		].join('\n') + '\n'
	);

	// The config file, declared so dpkg keeps an edited one across upgrades and
	// asks rather than overwriting. Without this line an upgrade silently
	// replaces whatever the operator wrote in it.
	writeFileSync(join(debian, 'conffiles'), '/etc/ontoplano/ontoplano.env\n');

	for (const [name, body] of Object.entries(MAINTAINER_SCRIPTS)) {
		writeFileSync(join(debian, name), body);
		chmodSync(join(debian, name), 0o755);
	}

	mkdirSync(OUT, { recursive: true });
	const file = join(OUT, `ontoplano_${VERSION}_${debArch}.deb`);
	run('fakeroot', ['dpkg-deb', '--build', '-Zxz', root, file]);
	return file;
}

/* ────────────────────────────────────────────────────────────── the .rpm ── */

function buildRpm(arch) {
	const rpmArch = ARCHES[arch].rpm;
	say(`\nrpm (${rpmArch})`);
	const root = stage({ bundleNode: true, arch });

	const top = join(WORK, 'rpmbuild');
	rmSync(top, { recursive: true, force: true });
	for (const d of ['SPECS', 'RPMS', 'BUILD', 'BUILDROOT'])
		mkdirSync(join(top, d), { recursive: true });

	const spec = readFileSync(join(ROOT, 'packaging/rpm/ontoplano.spec'), 'utf8')
		.replace(/@VERSION@/g, VERSION)
		.replace(/@ARCH@/g, rpmArch);
	writeFileSync(join(top, 'SPECS/ontoplano.spec'), spec);

	mkdirSync(OUT, { recursive: true });
	run('rpmbuild', [
		'-bb',
		'--define',
		`_topdir ${top}`,
		'--define',
		`_rpmdir ${OUT}`,
		'--define',
		'_build_id_links none',
		// The staged tree is the buildroot: nothing is compiled here, the files
		// are already exactly as they will be installed.
		'--buildroot',
		root,
		'--target',
		rpmArch,
		join(top, 'SPECS/ontoplano.spec')
	]);
	return join(OUT, rpmArch, `ontoplano-${VERSION}-1.${rpmArch}.rpm`);
}

/* ───────────────────────────────────────────────────────────── the AUR ──── */

/**
 * A PKGBUILD, which is a recipe rather than a package.
 *
 * Arch builds on the machine that will run it, so this one compiles
 * better-sqlite3 against that machine's Node and needs nothing bundled. It is
 * also the only format here that a distribution's own users can read before
 * they install it, which is worth the difference in shape.
 */
function buildArch() {
	say('\narch (PKGBUILD)');
	mkdirSync(join(OUT, 'arch'), { recursive: true });

	const tag = `v${VERSION}`;
	const pkgbuild = readFileSync(join(ROOT, 'packaging/arch/PKGBUILD'), 'utf8')
		.replace(/@VERSION@/g, VERSION)
		.replace(/@TAG@/g, tag);
	writeFileSync(join(OUT, 'arch/PKGBUILD'), pkgbuild);

	// The .install file systemd packages carry: what to say after installing,
	// and what to leave alone when removing.
	cpSync(join(ROOT, 'packaging/arch/ontoplano.install'), join(OUT, 'arch/ontoplano.install'));
	return join(OUT, 'arch/PKGBUILD');
}

/* ────────────────────────────────────────────────────────────────── main ── */

const asked = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const wanted = asked.length ? asked : ['deb', 'rpm', 'arch'];
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

const NEEDS = { deb: ['dpkg-deb', 'fakeroot'], rpm: ['rpmbuild'], arch: [] };
const made = [];

say(`ontoplano ${VERSION} — packaging for ${arch}\n`);

for (const format of wanted) {
	if (!NEEDS[format]) {
		console.error(`no such format: ${format} (deb, rpm, arch)`);
		process.exit(1);
	}
	const missing = NEEDS[format].filter((tool) => !has(tool));
	if (missing.length) {
		// Named rather than skipped in silence: a package that quietly did not
		// get built is one somebody publishes a release without.
		say(`\n${format}: needs ${missing.join(', ')} — not built`);
		continue;
	}
	made.push(format === 'deb' ? buildDeb(arch) : format === 'rpm' ? buildRpm(arch) : buildArch());
}

rmSync(join(WORK, 'root'), { recursive: true, force: true });

say('');
for (const file of made) {
	// A PKGBUILD is a couple of kilobytes and a .deb is tens of megabytes; one
	// unit for both prints the recipe as "0MB".
	const bytes = existsSync(file) ? readFileSync(file).length : 0;
	const size = !bytes
		? ''
		: bytes < 1e6
			? `${Math.round(bytes / 1e3)}kB`
			: `${Math.round(bytes / 1e6)}MB`;
	say(`  ${file.replace(ROOT + '/', '')} ${size}`);
}
if (!made.length) process.exit(1);
