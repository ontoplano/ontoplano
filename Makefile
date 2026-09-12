# Defaults first, overrides second.
#
# defaults.env is the one place a default value lives — no `?=` fallbacks
# scattered through this file. Anything specific to one machine or one
# deployment — where to deploy, which host, which origin the phone app is
# built against — belongs in `local.mk`, which is not tracked and loads
# after, so it wins. This file is only the parts that are true for anybody
# who clones the repository.
include defaults.env
-include local.mk

# Pinned, because the include above runs first and make's default goal is the
# first target it parses — a local.mk that defines a deploy target would make
# bare `make` start a deploy. Bare `make` says what exists and touches nothing.
.DEFAULT_GOAL := help

help:
	@sh scripts/make-help.sh $(MAKEFILE_LIST)

# What `help` deliberately leaves out: the switches, which are too many to put
# in front of somebody who only wanted to know the target's name.
#
# Grouped by the command that takes them, and worked out from the recipes —
# a recipe that expands `$(FOO)` reads FOO, whoever wrote it and whatever they
# remembered to write down. `make lint` fails when one has no description, so
# a switch cannot be added and left undiscoverable.
### develop

## which switches each make command takes
#: ONLY=shots  just that one command, rather than every command that takes a switch
#: SERVER_SRC=path  a server-repo checkout whose defaults.env is listed too, when present
vars:
	@node scripts/make-vars.mjs $(if $(ONLY),--only=$(ONLY),) \
		$(sort $(MAKEFILE_LIST)) defaults.env $(wildcard $(SERVER_SRC)/defaults.env)

# One variable's value, for a script that needs to know where something is
# rather than keep a second copy of the path:  make print-SSH_HOST
print-%:
	@echo '$($*)'


.PHONY: _billing-in-build vars print-% badges android-project fdroid _billing-provider package package-check _dev-port _dev-deps _dev-migrated reset-dev help docs docs-site docs-check icons icon up-phone deploy-local doctor dev dev-app dev-docs dev-site dev-all dev-stop dev-logs dev-fg build preview start stop clean install-service install-mail-service uninstall-service db-push db-seed db-generate db-migrate db-snapshot db-import db-studio db bdb backup-install backup-status backup-drill lint format test docker-build docker-image docker-up docker-down _docker-safe _docker-audit logs https-local android android-uninstall android-isolated-install android-phones isolated isolated-preview test-isolated android-isolated

# ─── Development ──────────────────────────────────────────────────────────────

# Resolved here too, so the public Makefile works without a local.mk.
#: NODE_BIN=/usr/bin/node  the node the dev service runs, if not the one on PATH
#: YARN_BIN=/usr/bin/yarn  the yarn it runs, if not the one on PATH
NODE_BIN ?= $(shell command -v node)
YARN_BIN ?= $(shell command -v yarn)

# The dev server runs as a systemd user service, so `make dev` hands the shell
# straight back instead of holding it hostage. The unit snapshots the database
# before every start (ExecStartPre — the database here is the real one, and the
# backup must happen however the unit is started), keeping the last 10. No
# prompt: a backup needs no ceremony, only doing — `deploy` is the one that
# stops to ask. `dev-fg` is the old foreground behaviour, for when you want
# vite's output in the terminal you are sitting at.
## the app as a background service — survives closing the terminal
dev: _dev-port _dev-deps _dev-migrated
	@[ -n "$(NODE_BIN)" ] || { echo "no node on PATH"; exit 1; }
	@[ -n "$(YARN_BIN)" ] || { echo "no yarn on PATH"; exit 1; }
	@mkdir -p ~/.config/systemd/user
	@REPO_DIR="$(CURDIR)" NODE_BIN="$(NODE_BIN)" NODE_DIR="$$(dirname "$(NODE_BIN)")" \
		YARN_BIN="$(YARN_BIN)" DATABASE_URL="$${DATABASE_URL:-}" \
		ONTOPLANO_SELF_HOST="$${ONTOPLANO_SELF_HOST:-true}" \
		envsubst < systemd/ontoplano-dev.service > ~/.config/systemd/user/ontoplano-dev.service
	@systemctl --user daemon-reload
	@mark=$$(mktemp); systemctl --user restart ontoplano-dev; \
	sleep 2; \
	if systemctl --user is-active --quiet ontoplano-dev; then \
		db="$${DATABASE_URL:-$$HOME/.local/share/ontoplano/ontoplano.db}"; \
		snap=$$(find "$$db".dev-* -newer "$$mark" 2>/dev/null | head -1); rm -f "$$mark"; \
		if [ -n "$$snap" ]; then echo "snapshotted: $$snap"; \
		else echo "no fresh snapshot found beside $$db — check make dev-logs"; fi; \
		echo "dev server running at http://localhost:1493"; \
		echo "  make dev-logs to follow it, make dev-stop to stop it"; \
	else \
		rm -f "$$mark"; \
		echo "the dev server did not come up:"; \
		journalctl --user -u ontoplano-dev -n 20 --no-pager; \
		exit 1; \
	fi

# ── Two things that must be true before vite starts ──────────────────────────
#
# Both of these have cost an evening. They are checked here rather than left to
# fail inside the unit, because a service that exits fills the journal with a
# stack trace and says nothing about what to do next.

# Port 1493, held by something that is not this.
#
# The failure it catches: an older way of running this app — a hand-written
# `ontoplano.service` doing `yarn dev` — enabled at login, holding the port
# forever. `make dev` then restarted a unit that could not bind, and the only
# clue was "Port 1493 is already in use" twenty lines into journalctl.
#
# Our own unit holding the port is fine: restarting it is the point.
_dev-port:
	@pid=$$( (ss -ltnpH "sport = :1493" 2>/dev/null || lsof -tiTCP:1493 -sTCP:LISTEN -Pn 2>/dev/null) \
		| grep -oE 'pid=[0-9]+|^[0-9]+$$' | head -1 | tr -dc '0-9'); \
	[ -n "$$pid" ] || exit 0; \
	unit=$$(sed -n 's#.*/\([^/]*\.service\)$$#\1#p' /proc/$$pid/cgroup 2>/dev/null | head -1); \
	[ "$$unit" != "ontoplano-dev.service" ] || exit 0; \
	cmd=$$(tr '\0' ' ' </proc/$$pid/cmdline 2>/dev/null); \
	echo "Port 1493 is already taken, so the dev server cannot start."; \
	echo "  held by pid $$pid$${unit:+, in $$unit}"; \
	[ -z "$$cmd" ] || echo "  $$cmd"; \
	if [ -n "$$unit" ] && [ "$$unit" != "ontoplano-dev.service" ]; then \
		echo; \
		echo "That is a service, so it comes back at every login. To retire it:"; \
		echo "  systemctl --user disable --now $$unit"; \
		if [ "$$unit" = "ontoplano.service" ]; then \
			echo; \
			echo "ontoplano.service is how this app used to be run in development."; \
			echo "make dev replaces it — ontoplano-dev.service does the same job and"; \
			echo "snapshots the database first. Nothing is lost by removing it."; \
		fi; \
	fi; \
	exit 1

# Dependencies that are actually installed.
#
# The first thing a fresh clone runs is `make dev`, and the first thing THAT
# did was open the database through better-sqlite3 — a package nothing had
# installed, because nothing had ever run `yarn install`. So it is run here,
# when node_modules is missing or older than yarn.lock; the integrity file is
# what yarn itself writes last, so a half-finished install does not count as
# one.
_dev-deps:
	@[ -n "$(YARN_BIN)" ] || { echo "no yarn on PATH"; exit 1; }
	@if [ ! -e node_modules/.yarn-integrity ] || [ yarn.lock -nt node_modules/.yarn-integrity ]; then \
		echo "Installing dependencies — first run, or yarn.lock moved."; \
		yarn install; \
	fi

# A database behind the code.
#
# The app refuses to serve when it is (src/lib/server/db/assert-migrated.ts),
# and the refusal arrives as vite's red overlay in the browser rather than in
# the terminal that ran `make dev` — so it reads like the app is broken. It is
# also sticky: migrating afterwards does not clear the module vite has already
# failed to evaluate, so the fix looks like it did not work either.
#
# Migrating here removes the whole shape. `db:migrate` snapshots first and does
# nothing when there is nothing to do, which is the common case and silent.
_dev-migrated:
	@out=$$(yarn -s db:migrate 2>&1) || { echo "$$out"; exit 1; }; \
	case "$$out" in *"migration"*) echo "$$out" | grep -v '^Snapshot:' ;; esac

# The way out of a wedged dev database — a migration mismatch, an experiment
# gone sideways. The old file is kept beside itself, never deleted; then a
# clean migrate, a dev account, and the seed. One command, no questions.
## a fresh dev database, the old one kept beside it
reset-dev:
	@db="$${DATABASE_URL:-$$HOME/.local/share/ontoplano/ontoplano.db}"; \
	if [ -f "$$db" ]; then \
		kept="$$db.kept-$$(date +%Y%m%dT%H%M%S)"; \
		mv "$$db" "$$kept"; rm -f "$$db-wal" "$$db-shm"; \
		echo "old database kept at $$kept"; \
	fi; \
	DATABASE_URL="$$db" node scripts/migrate.mjs && \
	printf 'ontoplano-dev\n' | DATABASE_URL="$$db" node scripts/make-operator.mjs dev@ontoplano.test >/dev/null && \
	node scripts/seed-dev.mjs "$$db" dev@ontoplano.test && \
	echo "fresh — sign in as dev@ontoplano.test / ontoplano-dev"

## stop that service
dev-stop:
	@systemctl --user stop ontoplano-dev
	@echo "stopped."

# ─── The other two things this project builds, locally ───────────────────────
#
# `make dev` is the app. These are its siblings: the documentation site and the
# marketing site, served here so a change to either can be looked at before it
# is anywhere near a box.
#
# Everything here is local and needs nothing but this checkout — no ssh, no
# server, no DNS. That is why they live in this Makefile rather than in the
# deployment one: a contributor has to be able to see what they changed.

# The ports the two previews bind. Not 1493, which is the app's.
#: DOCS_PORT=1494  where dev-docs serves
#: SITE_PORT=1495  where dev-site serves
DOCS_PORT ?= 1494
SITE_PORT ?= 1495
# Where the marketing site's checkout is, if it is here at all.
#: SITE_SRC_LOCAL=ontoplano-site  where the marketing site is checked out
SITE_SRC_LOCAL ?= ontoplano-site

# `dev` is the app; this is the name to type when you mean it by contrast.
## the app alone (what `dev` runs)
dev-app: dev

# The docs, generated from the code and served as the static site it becomes.
# Regenerated first, every time: the whole point of the docs is that it cannot
# drift from the code, and previewing a stale copy would be exactly that drift.
## the documentation, generated and served here
dev-docs:
	@yarn -s docs
	@yarn -s docs:site
	@node scripts/serve-docs.mjs build-docs $(DOCS_PORT)

# The marketing site, which is a separate repository. Absent from most
# checkouts, and that is not an error — it is a different audience and a
# different repo, so this says so and stops.
## the marketing site, from its own checkout
dev-site:
	@if [ ! -d "$(SITE_SRC_LOCAL)" ]; then \
		echo "No site checkout at $(SITE_SRC_LOCAL)."; \
		echo "ontoplano.com is a separate repository; this one is the app."; \
		echo "If you have it elsewhere:  make dev-site SITE_SRC_LOCAL=../elsewhere"; \
		exit 1; \
	fi
	@$(MAKE) -s -C $(SITE_SRC_LOCAL) preview PREVIEW_PORT=$(SITE_PORT)

# All of them, for a change that shows up in more than one. The app is a user
# service and returns; the other two each hold a terminal, so they run in the
# background here and Ctrl-C stops both.
## app, docs and site together
dev-all: dev
	@echo
	@echo "  app     http://localhost:1493"
	@echo "  docs    http://localhost:$(DOCS_PORT)"
	@if [ -d "$(SITE_SRC_LOCAL)" ]; then echo "  site    http://localhost:$(SITE_PORT)"; fi
	@echo
	@echo "Ctrl-C stops the docs and the site; make dev-stop stops the app."
	@trap 'kill 0' INT TERM; \
	$(MAKE) -s dev-docs & \
	if [ -d "$(SITE_SRC_LOCAL)" ]; then $(MAKE) -s dev-site & fi; \
	wait

# The development server on this machine.
#
#   make dev-logs                    the dev server
#   make dev-logs-docs               the docs preview, when it is running
#   make dev-logs UNIT=whatever      any other user unit here
#: UNIT=some-unit  follow another user unit instead of the dev service
#: DEV_LOG_UNIT=ontoplano-dev  the unit dev-logs follows when UNIT is not given
DEV_LOG_UNIT ?= ontoplano-dev

## follow the dev service log (UNIT= for another)
dev-logs:
	journalctl --user -u $(if $(UNIT),$(UNIT),$(DEV_LOG_UNIT)) -f -n 100

## …the docs service log
dev-logs-docs:
	@$(MAKE) -s dev-logs UNIT=ontoplano-docs

# The dev server in this terminal, the old way. Snapshots first, like the unit.
## the dev server in this terminal instead, holding it
dev-fg: _dev-deps _dev-migrated
	@yarn -s db:snapshot dev
	yarn dev --port 1493

# Node sizes its heap from the machine's RAM, and on a 1GB VPS that lands at
# about 470MB — which is where the adapter-node step ran out. Raising the cap
# above physical memory is deliberate: swap carries the difference, slowly, and
# the build finishes instead of dying at 53 seconds with a core dump.
# ─── The payment provider, if this build is one that sells ───────────────────
#
# This repository ships no payment code. A build that takes money copies one
# module into `src/lib/server/billing/providers/` first, from a checkout of the
# private repository sitting beside this one; with nothing there the app builds
# and runs completely, minus the ability to sell.
#
# Copied rather than symlinked so that what was built is a file in the tree, and
# `git status` in the private repo still says whether it has been edited here.
#: BILLING_SRC=ontoplano-billing  where the payment provider is checked out
BILLING_SRC ?= ontoplano-billing

_billing-provider:
	@if [ -f "$(BILLING_SRC)/paddle.ts" ]; then \
		cp "$(BILLING_SRC)/paddle.ts" src/lib/server/billing/providers/paddle.ts; \
		echo "billing: using $(BILLING_SRC)/paddle.ts"; \
		if [ -f "$(BILLING_SRC)/play.ts" ]; then \
			cp "$(BILLING_SRC)/play.ts" src/lib/server/billing/providers/play.ts; \
			echo "billing: using $(BILLING_SRC)/play.ts (the Play channel)"; \
		fi; \
	elif [ -f src/lib/server/billing/providers/paddle.ts ]; then \
		echo "billing: using the provider already in the tree"; \
	else \
		echo "billing: no provider — this build cannot sell anything (that is fine)"; \
	fi

# Did the build actually take the provider that is sitting in the tree?
#
# It copied the file and then shipped a build with no payment provider in it —
# on a box that sells, which is a broken instance discovered by a red banner
# hours later. The likeliest cause is Vite's transform cache: `import.meta.glob`
# is resolved at build time, so a cache from a build made before the provider
# existed keeps answering "no providers" however many times the file is copied.
#
# The glob's own key is what to look for: `./providers/<name>.ts` appears in the
# bundle when the module was compiled in, and does not otherwise.
# Two checks, in one shell on purpose: every recipe line is its own shell, so
# a guard line saying `exit 0` only ends that line — the checks after it still
# ran, and a fresh clone with no provider at all failed a check about the
# provider it does not have. No provider in the tree means nothing to verify.
#
# First check: nothing may throw the provider away at run time.
# `import.meta.glob` is a build-time rewrite of the CALL, not a function that
# exists in Node. A `typeof import.meta.glob === 'function'` guard around it
# survives into the bundle, evaluates false there, and discards the provider —
# which is exactly what shipped: the module bundled, imported and dropped.
# Nothing failed and nothing logged; the app simply decided it could not sell,
# for a fortnight.
#
# Second: the provider is actually in the bundle. It can be sitting in the
# tree and absent from the build — Vite resolves the glob once and caches it.
_billing-in-build:
	@if [ -f src/lib/server/billing/providers/paddle.ts ]; then \
		if grep -rqs 'typeof import.meta.glob' build/server --include='*.js'; then \
			$(NO) "this build guards import.meta.glob at run time"; \
			echo "  It is undefined in Node, so that guard is always false and the"; \
			echo "  provider it protects is discarded. src/lib/server/billing/index.ts."; \
			exit 1; \
		fi; \
		if grep -rqs 'providers/paddle' build/server --include='*.js'; then \
			$(OK) "the payment provider is in this build"; \
		else \
			$(NO) "the provider is in the tree and NOT in the build"; \
			echo "  rm -rf node_modules/.vite .svelte-kit && make build"; \
			exit 1; \
		fi; \
	fi

### build and run it here

## the production build
#: NODE_OPTIONS=--max-old-space-size=4096  what to give node, when the default 2048 is not enough
build: _billing-provider
	@heap=$$(free -m 2>/dev/null | awk '/^Mem:/ {print $$2}'); \
	if [ -n "$(NODE_OPTIONS)" ]; then \
		yarn build; \
	elif [ -n "$$heap" ] && [ "$$heap" -lt 2000 ]; then \
		echo "Small box ($${heap}MB of RAM): giving the build a 2GB heap and letting swap take it."; \
		NODE_OPTIONS=--max-old-space-size=2048 yarn build; \
	else \
		yarn build; \
	fi
	@$(MAKE) -s _billing-in-build

# The logo lives in exactly one file, src/lib/logo/mark.png. This is what turns
# it into the favicon, the four PWA icons and the one iOS reads — so changing
# the logo is changing a file, not finding eight copies of it.
## redraw every icon and favicon from the one source PNG
icons:
	@yarn -s icons

# One picture becomes every icon the app has.
#
# The favicon, the touch icons, the maskable ones, the dev and staging
# variants, every Android flavour's launcher icon, and the mark in the app's
# own header — all drawn from `src/lib/logo/mark.png`. This puts a new picture
# there and redraws the lot, so the next build and deploy are already right.
## adopt a new logo: make icon FROM=static/icons/new-icon.png
#: FROM=path/to/icon.png  the picture to become the mark
icon:
	@[ -n "$(FROM)" ] || { echo "Which picture? make icon FROM=static/icons/new-icon.png"; exit 1; }
	@node scripts/adopt-icon.mjs "$(FROM)"

## serve that build locally
preview:
	yarn preview

# The instance that runs on the device itself: static files, no server, the
# database in the browser's own storage. This is what the phone app wraps.
## the isolated build (static, serverless)
isolated:
	ONTOPLANO_ISOLATED_BUILD=1 PUBLIC_ONTOPLANO_ISOLATED=true yarn build

## serve the isolated build, the way its shell would
isolated-preview:
	node scripts/serve-isolated.mjs

## the isolated e2e, against the static build
test-isolated:
	yarn playwright test -c playwright.isolated.config.ts

# The Capacitor shell wraps the same static build the browser gets; the
# native project lives in capacitor/.
## the isolated Android app (debug APK, via the Capacitor shell)
android-isolated: isolated
	@# The shell's own dependencies, fetched on first use — a fresh clone has
	@# no capacitor/node_modules and must not be expected to know that.
	@[ -d capacitor/node_modules ] || (cd capacitor && npm install --no-audit --no-fund)
	@node scripts/brand-android.mjs
	cd capacitor && npx cap sync android
	@# The flavours: each one's name, icon and the instance it opens on.
	@node scripts/android-flavours.mjs
	@sdk="$${ANDROID_HOME:-}"; \
	[ -n "$$sdk" ] || { [ -d "$$HOME/android-sdk" ] && sdk="$$HOME/android-sdk"; }; \
	if [ -z "$$sdk" ] || [ ! -d "$$sdk" ]; then \
		echo "No Android SDK found. Set ANDROID_HOME to where it lives."; \
		exit 1; \
	fi; \
	cd capacitor/android && ANDROID_HOME="$$sdk" ./gradlew -q assembleDeviceDebug
	@echo "APK: capacitor/android/app/build/outputs/apk/device/debug/app-device-debug.apk"

# Three apps on one phone: the real instance, a laptop on the LAN, and
# staging. Same shell, same build — different application id, name, icon and
# opening instance, which is what lets Android keep them apart and what lets
# a bug on staging be read while your own week sits in the other app.
## build and install Ontoplano, Ontoplano DEV and Ontoplano — Staging
#: ONTOPLANO_DEV_ORIGIN=http://192.168.1.10:1493  where the DEV app points
android-phones: isolated
	@[ -d capacitor/node_modules ] || (cd capacitor && npm install --no-audit --no-fund)
	@node scripts/brand-android.mjs
	cd capacitor && npx cap sync android
	@# The DEV app's address comes from the environment or from defaults.env,
	@# which local.mk includes — a build in a container cannot work out which
	@# address on the wifi is this laptop's.
	@ONTOPLANO_DEV_ORIGIN="$(ONTOPLANO_DEV_ORIGIN)" node scripts/android-flavours.mjs
	@sdk="$${ANDROID_HOME:-}"; \
	[ -n "$$sdk" ] || { [ -d "$$HOME/android-sdk" ] && sdk="$$HOME/android-sdk"; }; \
	if [ -z "$$sdk" ] || [ ! -d "$$sdk" ]; then \
		echo "No Android SDK found. Set ANDROID_HOME to where it lives."; \
		exit 1; \
	fi; \
	cd capacitor/android && ANDROID_HOME="$$sdk" ./gradlew -q \
		assembleOfficialDebug assembleDevDebug assembleStagingDebug
	@# adb the way the rest of the android targets find their toolchain: the
	@# SDK's copy when it is not on PATH.
	@sdk="$${ANDROID_HOME:-$$HOME/android-sdk}"; \
	adb="$$(command -v adb || echo "$$sdk/platform-tools/adb")"; \
	built=capacitor/android/app/build/outputs/apk; \
	if [ ! -x "$$adb" ]; then \
		echo "Built all three. No adb here to install them:"; \
		for f in official dev staging; do echo "  $$built/$$f/debug/app-$$f-debug.apk"; done; \
		exit 0; \
	fi; \
	if [ -z "$$("$$adb" devices | sed -n '2p')" ]; then \
		echo "Built all three. No phone over adb — plug in, enable USB debugging, then:"; \
		echo "  make android-phones"; \
		exit 0; \
	fi; \
	failed=0; \
	for flavour in official dev staging; do \
		echo "installing $$flavour…"; \
		"$$adb" install -r -d "$$built/$$flavour/debug/app-$$flavour-debug.apk" >/dev/null \
			|| { echo "  $$flavour did not install"; failed=1; }; \
	done; \
	[ "$$failed" = 0 ] \
		&& echo "Ontoplano, Ontoplano DEV and Ontoplano — Staging are on the phone." \
		|| { echo "Some did not install. An app signed by a different key has to go first:"; \
			 echo "  adb uninstall app.ontoplano   (and .dev, .staging)"; exit 1; }

## install the isolated app over adb
android-isolated-install:
	@command -v adb >/dev/null || { echo "adb not found. Install android-tools-adb."; exit 1; }
	@apk=capacitor/android/app/build/outputs/apk/device/debug/app-device-debug.apk; \
	[ -f "$$apk" ] || { echo "No APK yet: run 'make android-isolated' first."; exit 1; }; \
	[ -n "$$(adb devices | sed -n '2p')" ] || { echo "No device over adb. Plug in, enable USB debugging, accept the prompt."; exit 1; }; \
	echo "Installing to $$(adb devices | sed -n '2p' | cut -f1)…"; \
	adb install -r -d "$$apk"

## run the built server
start: build
	node build/index.js

# ─── Database ─────────────────────────────────────────────────────────────────

# Local development only. `push` rebuilds tables to change them and has
# produced a wrong migration three times; production goes through
# generate → review → db-migrate. The guard refuses the production database.
### database

## apply the schema straight to the dev database
db-push:
	yarn db:push

## synthetic data for the dev account
db-seed:
	npx tsx src/lib/server/db/seed.ts

## write a migration from the schema diff
db-generate:
	yarn db:generate

# Snapshots the database, then applies pending migrations. Part of `deploy`,
# so a schema change can never ship without the migration that backs it.
## snapshot, then apply pending migrations
db-migrate:
	yarn db:migrate

# Restore an exported account over the one with this address, on this machine.
#
# The browser does the same thing under Settings → Account, and is the right
# tool for a normal-sized export. This is for the move that is too big for a
# request: a year of use is megabytes, and a proxy refuses it before the app
# ever sees it.
#
# It snapshots first, because it replaces and there is no undo.
#: FILE=export.json  the export db-import restores
#: EMAIL=you@example.com  the account it is restored over
## restore an exported account over one address
db-import:
	@[ -n "$(FILE)" ] || { echo "make db-import FILE=export.json EMAIL=you@example.com"; exit 1; }
	@[ -n "$(EMAIL)" ] || { echo "make db-import FILE=export.json EMAIL=you@example.com"; exit 1; }
	@$(MAKE) -s db-snapshot
	npx tsx scripts/import-account.ts "$(FILE)" "$(EMAIL)"

## a consistent copy, before something regrettable
db-snapshot:
	yarn db:snapshot manual

## drizzle's browser, on the dev database
db-studio:
	yarn db:studio

## a sqlite3 shell on the local database
db:
	sqlite3 ~/.local/share/ontoplano/ontoplano.db

## …the same database in sqlitebrowser
bdb:
	sqlitebrowser ~/.local/share/ontoplano/ontoplano.db &

## push the schema and seed it, for a new checkout
db-setup: db-push db-seed

# ─── Backups ──────────────────────────────────────────────────────────────────
#
# Snapshots live beside the database and cover a bad migration; replication
# ships the WAL offsite and covers a dead disk. See docs/BACKUP.md.

### backups

## Litestream replication, as a user service
backup-install:
	@command -v litestream >/dev/null || { echo "litestream is not installed — see docs/BACKUP.md"; exit 1; }
	@set -a; . $$HOME/.config/ontoplano/env; set +a; \
		mkdir -p "$$ONTOPLANO_BACKUP_DIR"; \
		envsubst < litestream.yml > $$HOME/.config/litestream.yml
	@mkdir -p ~/.config/systemd/user
	@envsubst < systemd/ontoplano-litestream.service > ~/.config/systemd/user/ontoplano-litestream.service
	@systemctl --user daemon-reload
	@systemctl --user enable ontoplano-litestream
	@systemctl --user restart ontoplano-litestream
	@echo "Replication running. Check: make backup-status"

## whether replication is running and current
backup-status:
	@systemctl --user --no-pager status ontoplano-litestream | head -5 || true
	@litestream generations -config $$HOME/.config/litestream.yml

# A backup nobody has restored is a hypothesis.
## restore the backup somewhere safe and check it
backup-drill:
	@scripts/restore-drill.sh

# ─── Code Quality ────────────────────────────────────────────────────────────

### checks, docs and generated files

## prettier, eslint, and every generated file checked current
lint:
	yarn lint
	@$(MAKE) -s docs-check
	@yarn -s changelog:check
	@yarn -s badges:check
	@node scripts/check-no-secrets.mjs
	@node scripts/check-android-version.mjs
	@node scripts/check-make-help.mjs
	@# Every switch a recipe expands is one somebody has to be able to find.
	@# Over the makefiles actually loaded, the way `vars` reads them: a fresh
	@# clone checks its own Makefile, and this checkout checks local.mk too.
	@node scripts/make-vars.mjs --check $(sort $(MAKEFILE_LIST)) defaults.env $(wildcard $(SERVER_SRC)/defaults.env)
	@# The scheduled jobs run under `tsx` in a production install. A service
	@# that reaches for a development-only package works everywhere except
	@# there, and the box is where nobody is watching.
	@node scripts/check-job-deps.mjs

## rewrite the tree with prettier
format:
	yarn format

# ─── Docs ─────────────────────────────────────────────────────────────────────

# The README's badges, drawn from this repo rather than fetched from a badge
# service — the front page of the project should not need a third party to be
# up, willing, and not counting who looked. `make lint` fails when they are
# stale, so a version bump cannot leave the release badge naming last month's.
## redraw the README's badges from this repo
badges:
	yarn badges

# The docs is built from the schema snapshot, the route files, the scope table
# and the shortcut map. It is committed so it can be read on the forge without
# a checkout, which is exactly the arrangement that lets a generated file go
# stale — so `make lint` fails when it has.
## rebuild docs/reference from the code
docs:
	yarn docs

# The same docs as a static site, for docs.ontoplano.com. Regenerates the
# markdown first, so what is published is never staler than the code.
## …and render it to build-docs/ as a static site
docs-site: docs
	@yarn -s docs:site

## fail if the generated docs are behind the code
docs-check:
	@yarn -s docs:check

## the Playwright end-to-end suite
test:
	yarn test:e2e

# ─── Docker ───────────────────────────────────────────────────────────────────
#
# `docker-up` / `docker-down` / `docker-build` run an instance HERE, which is
# what anybody self-hosting wants. `docker-image` builds the image the project
# publishes — the exact thing a self-hoster pulls — and audits what went into
# it; pushing it to the registry is the maintainer's job and lives with the
# maintainer's tooling, not in this Makefile.
#
# The name and the tags are variables so a fork builds its own:
#   make docker-image IMAGE=you/ontoplano

# Printing, defined here rather than borrowed. `local.mk` has its own set, and
# a public checkout has no local.mk at all — a target that only prints properly
# on one person's machine is a target that fails on everybody else's.
OK   = printf '  \033[34m✓ %s\033[0m\n'
NO   = printf '  \033[1;31m✗ %s\033[0m\n'
LOUD = printf '\033[1m%s\033[0m\n'

#: IMAGE=ontoplano/ontoplano  the name the Docker image is built and published under
IMAGE ?= ontoplano/ontoplano
# The tags a push writes: the version in package.json, and `latest`.
IMAGE_VERSION = $(shell node -p "require('./package.json').version")

### docker

## build the image from this checkout
docker-build:
	docker compose build

## an instance in a container
docker-up:
	docker compose up -d

## stop it
docker-down:
	docker compose down

# What ends up inside a public image, checked twice.
#
# A published image is permanent, public, and readable layer by layer — a file
# deleted in a later layer is still there in the earlier one. There is no taking
# it back, so this is checked before every push and the two checks look at
# different things:
#
#   _docker-safe    that `.dockerignore` is still an ALLOWLIST — the first line
#                   being `*`. A denylist fails open: anything added to the
#                   checkout later ships until somebody remembers to exclude it.
#   _docker-audit   what is actually inside the built image, compared against
#                   the paths that are meant to be. An ignore rule that reads
#                   fine and matches nothing is exactly the bug the first check
#                   cannot see, and this one can.
#
# Both are stated as what *should* be there rather than as what should not.
# A list of things to keep out has to name them, and this Makefile is public —
# naming the private things beside this checkout would itself be the leak.
DOCKER_ALLOWED = src static drizzle scripts docs build node_modules 	package.json yarn.lock .npmrc svelte.config.js vite.config.ts tsconfig.json 	drizzle.config.ts eslint.config.js .prettierrc .prettierignore 	README.md LICENSE CHANGELOG.md CONTRIBUTING.md ROADMAP.md

_docker-safe:
	@[ -f .dockerignore ] || { $(NO) ".dockerignore is missing — refusing to build an image"; exit 1; }
	@# The first rule that is not a comment has to be `*`. Anything else means
	@# somebody turned it back into a denylist, which fails open.
	@first=$$(grep -vE '^\s*(#|$$)' .dockerignore | head -1); \
	if [ "$$first" != '*' ]; then \
		$(NO) ".dockerignore is not an allowlist (its first rule is '$$first')"; \
		echo "  It must start with '*' and name back only what the build needs."; \
		echo "  A list of exclusions ships whatever nobody remembered to exclude."; \
		exit 1; \
	fi
	@$(OK) ".dockerignore is an allowlist"
	@# And every name on the allowlist can actually be matched by the audit.
	@#
	@# Not circular: it catches a name the list *contains* and the matcher
	@# cannot see, which is what happened — the list is written over several
	@# lines and make keeps the indenting tab, so three legitimate entries were
	@# reported as things the image should not contain. Checked before the
	@# build rather than after it, because after it is ten minutes later.
	@allowed=" $$(echo $(DOCKER_ALLOWED)) "; \
	blind=''; \
	for entry in $(DOCKER_ALLOWED); do \
		case "$$allowed" in *" $$entry "*) ;; *) blind="$$blind $$entry" ;; esac; \
	done; \
	if [ -n "$$blind" ]; then \
		$(NO) "DOCKER_ALLOWED names things the audit cannot match:$$blind"; \
		echo "  Whitespace in the list, almost certainly. It is flattened before"; \
		echo "  matching, so this should not be reachable — look at _docker-audit."; \
		exit 1; \
	fi
	@$(OK) "the allowlist is legible to the audit"

# The built image, opened and looked in. Nothing here is about intent.
_docker-audit:
	@found=$$(docker run --rm --entrypoint /bin/sh $(IMAGE):$(IMAGE_VERSION) \
		-c 'ls -A /app' 2>/dev/null); \
	: "The list, with its whitespace flattened before anything is matched"; \
	: "against it. It is written over several lines, and make keeps the tab"; \
	: "each continuation is indented with — so the pattern below, which needs"; \
	: "a space on both sides, missed every entry that happened to follow one."; \
	: "package.json, drizzle.config.ts and README.md were all rejected from"; \
	: "the image they are supposed to be in. Unquoted \$$(echo …) collapses"; \
	: "every run of whitespace to one space, so an editor cannot break it."; \
	allowed=" $$(echo $(DOCKER_ALLOWED)) "; \
	unexpected=''; \
	for entry in $$found; do \
		case "$$allowed" in \
			*" $$entry "*) ;; \
			*) unexpected="$$unexpected $$entry" ;; \
		esac; \
	done; \
	if [ -n "$$unexpected" ]; then \
		$(NO) "the image contains things it should not:"; \
		for entry in $$unexpected; do echo "      /app/$$entry"; done; \
		echo; \
		echo "  Either .dockerignore let them through, or they belong in"; \
		echo "  DOCKER_ALLOWED. Do not publish until you know which."; \
		exit 1; \
	fi
	@$(OK) "the image contains only what it should"

# The image, built here and sent nowhere. What to run before publishing, and
# what to run to try the thing a self-hoster will actually get.
## build the published image, and audit it
docker-image: _docker-safe
	@command -v docker >/dev/null || { echo "docker is not on PATH"; exit 1; }
	@echo "Building $(IMAGE):$(IMAGE_VERSION) for this machine's architecture"
	@docker build -t $(IMAGE):$(IMAGE_VERSION) -t $(IMAGE):latest .
	@$(MAKE) -s _docker-audit
	@$(OK) "built. 'make docker-up' runs it"

# ─── Packages ───────────────────────────────────────────────────────────────
#
# What somebody who is not you installs. `scripts/package.mjs` says why the .deb
# and the .rpm carry their own Node and the Arch one does not.
#
#   make package                 all three
#   make package deb             one of them — or: yarn package deb
#: PACKAGE=deb  build one format instead of all three (deb, rpm, arch)
#: PACKAGE_BUILD=false  package build/ as it stands, do not build again
PACKAGE_BUILD_DEP := $(if $(filter false 0 no,$(PACKAGE_BUILD)),,build)
### packages

## the .deb, .rpm and AUR PKGBUILD, into dist/
package: $(PACKAGE_BUILD_DEP)
	@[ -f build/index.js ] || { echo "no build/ to package — run make build, or drop PACKAGE_BUILD=false"; exit 1; }
	@node scripts/package.mjs $(PACKAGE)

# The half that matters: unpack what was built, run it, and check the unit says
# what the package does. Nothing is installed on this machine.
## …then unpack each and run what is inside
package-check:
	@bash tests/packaging.sh

# The copy installed on THIS machine by `make install-service`, not the box.
# `make dev-logs` is the development server; `make prod-logs` (local.mk) is
# the one over there.
### the installed service

## follow the installed service's log
logs:
	journalctl --user -u ontoplano -f

# ─── Systemd ─────────────────────────────────────────────────────────────────

PROD_DIR = $(HOME)/.local/share/ontoplano/app

# Installing on the machine you are already sitting at. `deploy` below is the
# one for the server; this is what `install-service` builds on, and what you
# want when the box and the checkout are the same box.
## rebuild, reinstall and restart the local service
deploy-local: build db-migrate
	@echo "Deploying to $(PROD_DIR)..."
	@mkdir -p $(PROD_DIR)
	@rm -rf $(PROD_DIR)/build
	@cp -r build $(PROD_DIR)/build
	@cp package.json $(PROD_DIR)/package.json
	@rsync -a --delete node_modules $(PROD_DIR)/
	@# And the service picks it up, when there is one — a deploy that leaves
	@# the old build running is not a deploy, it is a copy.
	@if systemctl --user cat ontoplano >/dev/null 2>&1; then \
		systemctl --user restart ontoplano; \
		echo "Deployed and restarted. Check: systemctl --user status ontoplano"; \
	else \
		echo "Deploy complete."; \
	fi

## rebuild and reinstall the phone app
up-phone: android android-install
	@echo "Phone updated against $(ONTOPLANO_ORIGIN)."

## the app and its jobs as a systemd user service
install-service: deploy-local
	@echo "Installing ontoplano systemd service..."
	@[ -n "$(NODE_BIN)" ] || { echo "No node on PATH — nothing to put in the unit."; exit 1; }
	@# Fails here, with the reason, rather than as a crash loop at 3am.
	@cd $(PROD_DIR) && $(NODE_BIN) -e "require('better-sqlite3')" 2>/dev/null || { \
		echo; \
		echo "better-sqlite3 will not load under $(NODE_BIN) ($$($(NODE_BIN) -v))."; \
		echo "It was compiled against a different Node. Rebuild it with the same one:"; \
		echo "  rm -rf node_modules && yarn install && make install-service"; \
		echo; \
		echo "If there is more than one node here, that is the cause:"; \
		echo "  which -a node"; \
		exit 1; \
	}
	@mkdir -p ~/.config/systemd/user
	@NODE_BIN="$(NODE_BIN)" envsubst < systemd/ontoplano.service > ~/.config/systemd/user/ontoplano.service
	@# The reminders timer rides along: it asks the app's job endpoint, behind
	@# the health token — generated here once, into the env file the unit and
	@# the app both read. The weekly review mail does NOT: it needs SMTP, which
	@# most installs never configure — \`make install-mail-service\` is its own
	@# deliberate step.
	@mkdir -p ~/.config/ontoplano; touch ~/.config/ontoplano/env
	@grep -q '^ONTOPLANO_HEALTH_TOKEN=' ~/.config/ontoplano/env || \
		printf 'ONTOPLANO_HEALTH_TOKEN=%s\n' "$$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')" >> ~/.config/ontoplano/env
	@NODE_BIN="$(NODE_BIN)" envsubst < systemd/ontoplano-reminders.service > ~/.config/systemd/user/ontoplano-reminders.service
	@cp systemd/ontoplano-reminders.timer ~/.config/systemd/user/ontoplano-reminders.timer
	@echo "The service will run $(NODE_BIN) ($$($(NODE_BIN) -v))"
	@systemctl --user daemon-reload
	@systemctl --user enable ontoplano
	@systemctl --user start ontoplano
	@systemctl --user enable --now ontoplano-reminders.timer
	@echo "Service and reminders installed and started. Check: systemctl --user status ontoplano"
	@echo "The weekly review mail is not installed — it needs SMTP. make install-mail-service adds it."

# The Monday mail, as its own deliberate step: it needs SMTP configured in
# ~/.config/ontoplano/env, and an install that cannot send should not carry a
# timer that pretends it might.
## …and the weekly review mail, if you run SMTP
install-mail-service:
	@mkdir -p ~/.config/systemd/user
	@NODE_BIN="$(NODE_BIN)" envsubst < systemd/ontoplano-weekly-review.service > ~/.config/systemd/user/ontoplano-weekly-review.service
	@cp systemd/ontoplano-weekly-review.timer ~/.config/systemd/user/ontoplano-weekly-review.timer
	@systemctl --user daemon-reload
	@systemctl --user enable --now ontoplano-weekly-review.timer
	@echo "Weekly review mail timer installed. It sends nothing until SMTP_HOST is set in ~/.config/ontoplano/env."

## remove those services
uninstall-service:
	@systemctl --user stop ontoplano || true
	@systemctl --user disable ontoplano || true
	@systemctl --user disable --now ontoplano-reminders.timer ontoplano-weekly-review.timer 2>/dev/null || true
	@rm -f ~/.config/systemd/user/ontoplano.service \
		~/.config/systemd/user/ontoplano-reminders.service ~/.config/systemd/user/ontoplano-reminders.timer \
		~/.config/systemd/user/ontoplano-weekly-review.service ~/.config/systemd/user/ontoplano-weekly-review.timer
	@systemctl --user daemon-reload
	@echo "Service uninstalled."

# ─── Android ─────────────────────────────────────────────────────────────────
#
# One shell, and it is Capacitor's: `capacitor/` holds the native project and
# it wraps the same build a browser gets. What used to be here was a Trusted
# Web Activity — a Chrome tab in an app's clothing, built by bubblewrap into
# `android-twa/`, bound to one origin by Digital Asset Links and needing a
# keystore, a fingerprint and a served `assetlinks.json` before it would even
# hide its address bar. Everything it did the shell does better, and the shell
# can also carry the instance that runs on the device itself, which a tab
# never could. It is gone rather than kept beside the new one.
#
# Which instance an app opens is a build flavour, not a cage — see
# `android-phones` above for the three that go on a developer's own phone.
# `android` is the one that goes to a store.

### phone

# The project the stores build, regenerated and committed.
#
# F-Droid builds from a git tag on a machine with no network and no toolchain
# of ours, so what is committed has to be buildable as it stands: the Gradle
# project, its icons, and each flavour's own name and address. The icon
# scripts write the same bytes from the same source every time, which is what
# lets them be committed without a build dirtying the tree.
## regenerate the committed Gradle project the stores build
android-project:
	@[ -d capacitor/node_modules ] || (cd capacitor && npm install --no-audit --no-fund)
	@node scripts/brand-android.mjs
	cd capacitor && npx cap sync android
	@node scripts/android-flavours.mjs

# Everything F-Droid needs for this version, written into fdroid-out/.
#
# Their metadata lives in their repository, not in ours: one YAML file that
# grows a build entry per release, plus the store listing. Keeping a copy here
# would be a duplicate that is wrong three releases later, so nothing is
# committed — the generator is, and this writes the current answer.
#
#   make fdroid                              a fresh recipe, first submission
#   make fdroid FROM=path/to/existing.yml    the same recipe plus this release
#
# FROM is the file as it stands in your fdroiddata fork; it is edited as text,
# so reviewers' comments and hand edits survive. It also writes the RFP issue
# and the merge request description, and fails loudly if the tag this version
# would build has not been pushed.
## F-Droid's recipe and listing for this version
#: FROM=metadata/app.ontoplano.yml  an existing recipe to add this release to
fdroid:
	@node scripts/fdroid-metadata.mjs $(if $(FROM),--from $(FROM),)

# The store artifact: the official flavour, release, unsigned.
#
# Unsigned on purpose — F-Droid signs what it builds, and a key of ours in
# that path would only be a key to lose. For a phone in your hand,
# `android-phones` builds and installs the debug ones.
## the release APK for the stores
android: isolated android-project
	@sdk="$${ANDROID_HOME:-}"; \
	[ -n "$$sdk" ] || { [ -d "$$HOME/android-sdk" ] && sdk="$$HOME/android-sdk"; }; \
	if [ -z "$$sdk" ] || [ ! -d "$$sdk" ]; then \
		echo "No Android SDK found. Set ANDROID_HOME to where it lives."; \
		exit 1; \
	fi; \
	cd capacitor/android && ANDROID_HOME="$$sdk" ./gradlew -q assembleOfficialRelease
	@echo "APK: capacitor/android/app/build/outputs/apk/official/release/app-official-release-unsigned.apk"

## remove the app from the phone over adb
android-uninstall:
	@sdk="$${ANDROID_HOME:-$$HOME/android-sdk}"; \
	adb="$$(command -v adb || echo "$$sdk/platform-tools/adb")"; \
	[ -x "$$adb" ] || { echo "No adb. Install android-tools-adb."; exit 1; }; \
	for id in app.ontoplano app.ontoplano.dev app.ontoplano.staging app.ontoplano.isolated; do \
		"$$adb" uninstall "$$id" >/dev/null 2>&1 && echo "removed $$id"; \
	done; true

# ─── HTTPS ───────────────────────────────────────────────────────────────────
#
# Whichever address this machine would use to reach the outside world, which is
# the one a phone on the same wifi can reach. Asking the routing table rather
# than naming an interface, which would be one machine's network card.
LAN_IP := $(shell ip route get 1.1.1.1 2>/dev/null | awk '{print $$7; exit}')
#
# The Android app shows a browser-style URL bar until it can prove it owns the
# site it opens, and that proof — Digital Asset Links — is only checked over
# HTTPS. On plain http there is no way to hide the bar, and no service worker
# either, since browsers only run those in a secure context.
#
# HTTPS however you already have it.
#
# The one requirement is a certificate a browser trusts, on a name the phone can
# reach. There is no way to fake that and no shortcut worth documenting: a
# domain you own with Caddy or nginx in front of the app, or a tunnel from a
# machine that has one, are the two shapes this takes.
#
# `https-local` is for when you have neither. It serves the app through Caddy's
# own certificate authority — nothing leaves the network and no third party is
# involved at any point — and the price is that a certificate signed by a CA
# nobody has heard of is not trusted until the phone is told about it. Once per
# device, and then the browser treats it as a secure context: notifications,
# installing it as an app, and offline all start working.
#
# It is not enough for the Android app's URL bar. That is Digital Asset Links,
# verified by the browser's own network stack rather than by the page, and a
# privately-issued certificate does not satisfy it. For that you need a real
# one.

# A certificate this machine signs itself, and a phone told to trust it.
#
#   make https-local                 # serve, and trust the CA on this machine
#   make https-local TRUST_LOCAL=0   # serve only — nothing asks for a password
#
# The only thing here that wants root is putting Caddy's own certificate
# authority into *this* machine's trust stores, which is what makes your own
# browser accept the address without a warning. Caddy asks for it directly, in
# the middle of its own output, which is a surprising place to be asked for a
# password — so it is announced before it happens and it can be skipped.
#
# Nothing about the phone needs root. The phone needs the CA file, which is
# served on the port below so it can simply be opened.
CADDY_DATA := $(if $(XDG_DATA_HOME),$(XDG_DATA_HOME),$(HOME)/.local/share)/caddy
CA_FILE := $(CADDY_DATA)/pki/authorities/local/root.crt
#: CA_PORT=1494  where https-local serves its certificate authority
CA_PORT ?= 1494
#: TRUST_LOCAL=0  serve https-local without asking this machine to trust the CA
TRUST_LOCAL ?= 1

### odds and ends

## serve the dev app over HTTPS, for phone testing
https-local:
	@command -v caddy >/dev/null || { \
		echo "caddy is not installed."; \
		echo "  arch:   sudo pacman -S caddy"; \
		echo "  debian: sudo apt install caddy"; \
		exit 1; \
	}
	@test -n "$(LAN_IP)" || { echo "Could not work out this machine's LAN address."; exit 1; }
	@printf '%s\n' \
		"{" \
		"$(if $(filter 0,$(TRUST_LOCAL)),	skip_install_trust,	# this machine trusts the CA: the one sudo prompt)" \
		"	admin off" \
		"}" \
		"" \
		"https://$(LAN_IP) {" \
		"	tls internal" \
		"	reverse_proxy 127.0.0.1:$(APP_PORT)" \
		"}" \
		"" \
		"# Plain HTTP on purpose: this is how the phone fetches the certificate" \
		"# it does not trust yet, and there is nothing secret in a public key." \
		"http://$(LAN_IP):$(CA_PORT) {" \
		"	root * $(dir $(CA_FILE))" \
		"	file_server" \
		"}" > /tmp/ontoplano-caddy.caddyfile
	@caddy fmt --overwrite /tmp/ontoplano-caddy.caddyfile >/dev/null 2>&1 || true
	@echo
	@echo "  ontoplano over HTTPS, on this network"
	@echo "  ────────────────────────────────────────────────────────────────"
	@echo "  The app:        https://$(LAN_IP)"
	@echo "  Its authority:  http://$(LAN_IP):$(CA_PORT)/root.crt"
	@echo
ifeq ($(TRUST_LOCAL),0)
	@echo "  Nothing here will ask for a password (TRUST_LOCAL=0). Your own"
	@echo "  browser will warn about the certificate; the phone is unaffected."
else
	@echo "  Caddy will ask for your password once, in its own output below."
	@echo "  It is adding its certificate authority to THIS machine's trust"
	@echo "  stores, so your own browser accepts the address. Nothing else"
	@echo "  here needs root. Skip it with: make https-local TRUST_LOCAL=0"
endif
	@echo
	@echo "  On an Android phone, once:"
	@echo "    1. Open http://$(LAN_IP):$(CA_PORT)/root.crt and let it download."
	@echo "    2. Settings → Security → More security settings →"
	@echo "       Encryption & credentials → Install a certificate →"
	@echo "       CA certificate → Install anyway → pick root.crt."
	@echo "       (Some phones: Settings → Security → Install from storage.)"
	@echo "    3. Open https://$(LAN_IP) in Chrome."
	@echo
	@echo "  Chrome trusts what you install there. Firefox for Android does"
	@echo "  not — it carries its own list and ignores the system one, so use"
	@echo "  Chrome for this, or put the app behind a real certificate."
	@echo
	@echo "  On iOS: open the same link, Settings → Profile Downloaded →"
	@echo "  Install, then General → About → Certificate Trust Settings and"
	@echo "  switch it on. That second step is the one everybody misses."
	@echo
	@echo "  Ctrl-C stops it."
	@echo
	@caddy run --config /tmp/ontoplano-caddy.caddyfile --adapter caddyfile

# ─── Clean ────────────────────────────────────────────────────────────────────

## delete build output and node_modules
clean:
	rm -rf build dist .svelte-kit node_modules
