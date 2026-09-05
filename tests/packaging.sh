#!/bin/bash
# What is actually inside the packages, and whether it runs.
#
#   yarn test:packaging          # builds, then checks
#   SKIP_BUILD=1 yarn test:packaging
#
# The point of this file is that a package is only correct in ways nothing else
# in this repo can see. The unit tests never open the .deb; the e2e suite runs
# against the development server; `yarn build` succeeding says nothing about
# whether the thing somebody installs has a runtime that can open its own
# database. Every check here is one that has already been wrong once:
#
#   - the native module was compiled for a different Node ABI than the runtime
#     the package carries, which installs cleanly and crash-loops on start;
#   - `node_modules/.bin` shims pointed back at the build machine;
#   - the unit, the migrator and the CLI disagreed about where the data lives.
#
# It never installs anything on this machine. The packages are unpacked into a
# temporary directory and run from there, as a normal user.
# No `pipefail` here, deliberately. Every check in this file is
# `something-large | grep -q`, and `grep -q` exits the moment it matches — which
# sends SIGPIPE to the writer, which under pipefail makes the whole pipeline
# report failure. The effect is that a match near the *end* of a long listing
# passes and a match near the beginning fails, which reads as the package
# missing files it plainly contains.
set -u

cd "$(dirname "$0")/.."
ROOT=$PWD
VERSION=$(node -p "require('./package.json').version")
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

blue=$'\033[34m'; red=$'\033[31m'; dim=$'\033[2m'; off=$'\033[0m'
[ -t 1 ] || { blue=; red=; dim=; off=; }
fails=0

ok()   { echo "  ${blue}✓${off} $1"; }
bad()  { echo "  ${red}✗${off} $1"; fails=$((fails + 1)); }
head_() { echo; echo "${dim}$1${off}"; }

# A format this machine cannot build is not a failure of the packaging.
#
# `scripts/package.mjs` skips a format whose tool is missing and says so — and
# this file used to call the resulting absence a failed check, so `make release`
# died at the last step on any machine without rpmbuild, having built everything
# it could. Missing *tool* is a skip, named here and again in the summary so a
# release is never published under the impression it carried something it did
# not. Missing *artifact with the tool present* is still a failure.
skipped=""
skip() { echo "  ${dim}— $1${off}"; skipped="$skipped $2"; }

# `check <description> <command...>` — the command's success is the assertion.
check() { local what=$1; shift; if "$@" >/dev/null 2>&1; then ok "$what"; else bad "$what"; fi; }

# ── Build ──────────────────────────────────────────────────────────────────
if [ "${SKIP_BUILD:-0}" != 1 ]; then
	head_ "Building"
	yarn build >/dev/null 2>&1 || { echo "${red}the app would not build${off}"; exit 1; }

	# What the repository's own tree looked like before packaging touched it.
	# An earlier version of the packager pruned this tree to its production set
	# and restored it badly, and the first anybody knew was `vite: command not
	# found` on the next deploy — with yarn insisting the install was current.
	before=$(ls node_modules/.bin 2>/dev/null | sort)

	yarn package >"$WORK/package.log" 2>&1 || {
		echo "${red}packaging failed${off}"; tail -30 "$WORK/package.log"; exit 1;
	}
	ok "the packages built"

	if [ "$(ls node_modules/.bin 2>/dev/null | sort)" = "$before" ]
	then ok "the repository's own node_modules is untouched"
	else bad "packaging changed this repository's node_modules — the next build here will fail"; fi
fi

DEB=$ROOT/dist/ontoplano_${VERSION}_amd64.deb
RPM=$ROOT/dist/x86_64/ontoplano-${VERSION}-1.x86_64.rpm
PKGBUILD=$ROOT/dist/arch/PKGBUILD

# ── What is in them ────────────────────────────────────────────────────────
head_ "The .deb"
if [ ! -f "$DEB" ] && ! command -v dpkg-deb >/dev/null; then
	skip "not built: dpkg-deb is not on this machine (apt install dpkg, pacman -S dpkg)" deb
elif [ ! -f "$DEB" ]; then
	bad "no .deb at $DEB, though dpkg-deb is installed"
else
	list=$(dpkg-deb -c "$DEB")
	control=$(dpkg-deb -I "$DEB")

	for path in \
		./usr/lib/ontoplano/build/index.js \
		./usr/lib/ontoplano/node/bin/node \
		./usr/lib/ontoplano/migrate.mjs \
		./usr/lib/ontoplano/drizzle/ \
		./usr/bin/ontoplano \
		./usr/lib/systemd/system/ontoplano.service \
		./usr/lib/systemd/system/ontoplano-reminders.timer \
		./usr/lib/ontoplano/jobs \
		./usr/lib/sysusers.d/ontoplano.conf \
		./usr/lib/tmpfiles.d/ontoplano.conf \
		./etc/ontoplano/ontoplano.env
	do
		if grep -q " $path" <<<"$list"; then ok "carries $path"; else bad "missing $path"; fi
	done

	# The config file has to be declared, or an upgrade silently overwrites what
	# the operator wrote in it.
	if dpkg-deb --ctrl-tarfile "$DEB" | tar -xO ./conffiles 2>/dev/null |
		grep -q '^/etc/ontoplano/ontoplano.env$'
	then ok "the config file is a conffile"; else bad "the config file is not declared as a conffile"; fi

	# No dependency on the distribution's Node: the runtime is inside.
	if grep -q '^ Depends:.*nodejs' <<<"$control"
	then bad "depends on the distribution's nodejs, which the bundled runtime makes wrong"
	else ok "does not depend on the distribution's nodejs"; fi

	# Absolute symlinks into the build machine. rpm says so; dpkg does not.
	strays=$(dpkg-deb -c "$DEB" | grep -c " -> $ROOT" || true)
	if [ "$strays" = 0 ]; then ok "no symlinks pointing back at this machine"
	else bad "$strays symlinks point into $ROOT"; fi
fi

head_ "The .rpm"
if [ ! -f "$RPM" ] && ! command -v rpmbuild >/dev/null; then
	skip "not built: rpmbuild is not on this machine (apt install rpm, pacman -S rpm-tools, dnf install rpm-build)" rpm
elif [ ! -f "$RPM" ]; then
	bad "no .rpm at $RPM, though rpmbuild is installed"
elif ! command -v rpm >/dev/null; then
	echo "  ${dim}rpm is not installed here — skipping${off}"
else
	files=$(rpm -qlp "$RPM" 2>/dev/null)
	for path in \
		/usr/lib/ontoplano/build/index.js \
		/usr/lib/ontoplano/node/bin/node \
		/usr/bin/ontoplano \
		/usr/lib/systemd/system/ontoplano.service \
		/usr/lib/systemd/system/ontoplano-reminders.timer \
		/etc/ontoplano/ontoplano.env
	do
		if grep -qx "$path" <<<"$files"; then ok "carries $path"; else bad "missing $path"; fi
	done

	# noreplace, for the same reason the .deb needs conffiles.
	if rpm -qp --qf '[%{FILENAMES} %{FILEFLAGS}\n]' "$RPM" 2>/dev/null |
		grep '^/etc/ontoplano/ontoplano.env ' | grep -qv ' 0$'
	then ok "the config file is marked config(noreplace)"
	else bad "the config file is not marked config(noreplace)"; fi

	if rpm -qp --scripts "$RPM" 2>/dev/null | grep -q 'systemd-sysusers'
	then ok "makes the service account on install"; else bad "no sysusers step in %post"; fi
fi

head_ "The PKGBUILD"
if [ ! -f "$PKGBUILD" ]; then
	bad "no PKGBUILD at $PKGBUILD"
else
	check "carries this version" grep -qx "pkgver=$VERSION" "$PKGBUILD"
	check "declares the config file in backup=" grep -q "backup=('etc/ontoplano/ontoplano.env')" "$PKGBUILD"
	check "depends on the distribution's nodejs, which is right for a source build" \
		grep -q "depends=.*nodejs" "$PKGBUILD"
	# The one thing a PKGBUILD must not do: bundle a runtime. Arch builds on the
	# machine that runs it, so there is exactly one Node and it is the right one.
	if grep -q 'nodejs\.org' "$PKGBUILD"; then bad "downloads a Node runtime"; else ok "bundles no runtime"; fi
fi

# ── Does the thing in the box work ─────────────────────────────────────────
head_ "Unpacked and run"
if [ ! -f "$DEB" ]; then
	bad "nothing to run"
else
	dpkg-deb -x "$DEB" "$WORK/root"
	LIB=$WORK/root/usr/lib/ontoplano
	export ONTOPLANO_CONFIG_DIR=$WORK/etc ONTOPLANO_DATA_DIR=$WORK/var
	mkdir -p "$ONTOPLANO_CONFIG_DIR" "$ONTOPLANO_DATA_DIR"

	# The runtime in the package, not this machine's.
	if "$LIB/node/bin/node" -v >/dev/null 2>&1; then ok "the bundled runtime runs"; else bad "the bundled runtime does not run"; fi

	# The failure this whole ordering exists to prevent: a native module built
	# for a different ABI than the runtime shipped beside it.
	if (cd "$LIB" && ./node/bin/node -e "new (require('better-sqlite3'))(':memory:').close()") 2>/dev/null
	then ok "it opens a database"; else bad "better-sqlite3 will not open under the bundled runtime"; fi

	if "$LIB/migrate" >"$WORK/migrate.log" 2>&1 && [ -f "$WORK/var/ontoplano.db" ]
	then ok "the migrator makes the database where the unit will look for it"
	else bad "the migrator failed"; sed -n '1,12p' "$WORK/migrate.log"; fi

	# And it serves. A free port, so a development server on 1493 is undisturbed.
	PORT_=$((20000 + RANDOM % 20000))
	ONTOPLANO_CONFIG_DIR=$WORK/etc ONTOPLANO_DATA_DIR=$WORK/var \
		ORIGIN=http://127.0.0.1:$PORT_ PORT=$PORT_ HOST=127.0.0.1 \
		BETTER_AUTH_SECRET=packaging-test-secret-not-a-real-one \
		"$LIB/run" >"$WORK/run.log" 2>&1 &
	server=$!
	for _ in $(seq 1 40); do
		curl -fsS "http://127.0.0.1:$PORT_/healthz" >/dev/null 2>&1 && break
		sleep 0.5
	done
	health=$(curl -fsS "http://127.0.0.1:$PORT_/healthz" 2>/dev/null || echo '{}')
	login=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_/login" 2>/dev/null)
	kill "$server" 2>/dev/null
	wait "$server" 2>/dev/null

	case $health in *'"database":"ok"'*) ok "it serves, and its database answers" ;;
		*) bad "the packaged app did not come up"; tail -8 "$WORK/run.log" ;;
	esac
	if [ "$login" = 200 ]; then ok "the sign-in page renders"; else bad "/login answered $login"; fi
fi

# ── The unit says what the package does ────────────────────────────────────
head_ "The unit"
UNIT=$ROOT/packaging/systemd/ontoplano.service
check "runs as its own account"        grep -qx "User=ontoplano" "$UNIT"
check "does not run as root"           grep -qvx "User=root" "$UNIT"
check "listens on loopback by default" grep -qx "Environment=HOST=127.0.0.1" "$UNIT"
check "reads the config directory the migrator writes" \
	grep -qx "Environment=ONTOPLANO_DATA_DIR=/var/lib/ontoplano" "$UNIT"
check "keeps the secret in its own file" grep -qx "EnvironmentFile=/etc/ontoplano/secret.env" "$UNIT"
check "restarts always"                grep -qx "Restart=always" "$UNIT"
check "cannot gain privileges"         grep -qx "NoNewPrivileges=true" "$UNIT"

echo
if [ -n "$skipped" ]; then
	# Loud, and last: this is the line that decides whether a release page is
	# honest about what it carries.
	echo "${red}not built here:${off}${skipped} — a release from this machine will not have"
	echo "${dim}them. Install the tool named above, or say on the release which formats it has.${off}"
fi
if [ "$fails" = 0 ]; then echo "${blue}all good${off}"; else echo "${red}$fails failed${off}"; exit 1; fi
