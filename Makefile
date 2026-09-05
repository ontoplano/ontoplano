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
	@printf '\033[1montoplano\033[0m — bare `make` only prints this.\n'
	@echo
	@printf '\033[1mdevelop\033[0m\n'
	@echo "  dev / dev-stop / dev-logs   the app, as a user service (dev-fg holds the terminal)"
	@echo "  dev-docs · dev-site         the docs and the marketing site, served here"
	@echo "  dev-all                     all three at once"
	@echo "  vars                        every variable a make command line can carry"
	@echo "  lint · format               prettier+eslint, prettier --write"
	@echo "  test                        the Playwright e2e suite (yarn test for units)"
	@echo "  icons                       redraw every icon from src/lib/logo/mark.png"
	@echo "  docs                        rebuild docs/reference from the code (lint checks it is current)"
	@echo "  docs-site                   …and render it to build-docs/ as a static site"
	@echo
	@printf '\033[1mdatabase\033[0m\n'
	@echo "  db-generate                 write a migration from the schema diff"
	@echo "  db-migrate                  apply migrations (snapshots first)"
	@echo "  db-snapshot                 a consistent copy, before something regrettable"
	@echo "  db-seed                     synthetic data for the dev account"
	@echo "  db-import FILE= EMAIL=      restore an exported account over that address"
	@echo
	@printf '\033[1mrun it for real\033[0m\n'
	@echo "  build · preview             production build, and serve it locally"
	@echo "  install-service / update    the systemd user service: first install, then updates"
	@echo "  docker-up / docker-down     an instance in a container (docs/DOCKER.md)"
	@echo "  docker-image                build the published image here, and audit it"
	@echo "  package [deb|rpm|arch]      the .deb, the .rpm and the AUR PKGBUILD, into dist/"
	@echo "  package-check               …then unpack them and run what is inside"
	@echo "  backup-install              Litestream replication (backup-status, backup-drill)"
	@echo
	@printf '\033[1mphone\033[0m\n'
	@echo "  android                     build the APK (android-install / android-share to get it on)"
	@echo "  android-lan                 an APK pointed at this machine, over wifi"
	@if [ -f local.mk ]; then echo; \
		printf '\033[1mthis instance (local.mk)\033[0m\n'; \
		echo "  deploy [-app|-site|-docs|-demo]   ship it; bare deploy is all four"; \
		echo "  deploy-staging [-app|-site|-docs]  the staging instance on the box"; \
		echo "  restart [-app|-site|-docs|-demo]  without shipping anything"; \
		echo "  prune-assets                      drop the old hashed chunks the box keeps"; \
		echo "  release · docker-publish · github-push   publishing (release.mk)"; \
		echo "  logs-app · logs-staging · setup   see local.mk for the rest"; \
	fi

# What `help` deliberately leaves out: the variables, which are too many to
# put in front of somebody who only wanted to know the target's name. Reading
# them out of the makefiles means the list cannot describe a switch that was
# renamed — the failure mode of writing this table by hand.
vars:
	@sh scripts/make-vars.sh $(sort $(MAKEFILE_LIST) defaults.env $(wildcard $(SERVER_SRC)/defaults.env))


.PHONY: _billing-in-build vars _billing-provider package package-check _dev-port _dev-deps _dev-migrated help docs docs-site docs-check icons up-phone deploy-local android-lan android-check doctor dev dev-app dev-docs dev-site dev-all dev-stop dev-logs dev-fg build preview start stop clean install-service uninstall-service update db-push db-seed db-generate db-migrate db-snapshot db-import db-studio db bdb backup-install backup-status backup-drill lint format test docker-build docker-image docker-up docker-down _docker-safe _docker-audit logs https-tailscale https-tailscale-off android android-install android-uninstall android-share android-fingerprint android-keystore-reset android-clean

# ─── Development ──────────────────────────────────────────────────────────────

# Resolved here too, so the public Makefile works without a local.mk.
NODE_BIN ?= $(shell command -v node)
YARN_BIN ?= $(shell command -v yarn)

# The dev server runs as a systemd user service, so `make dev` hands the shell
# straight back instead of holding it hostage. The unit snapshots the database
# before every start (ExecStartPre — the database here is the real one, and the
# backup must happen however the unit is started), keeping the last 10. No
# prompt: a backup needs no ceremony, only doing — `deploy` is the one that
# stops to ask. `dev-fg` is the old foreground behaviour, for when you want
# vite's output in the terminal you are sitting at.
dev: _dev-port _dev-deps _dev-migrated
	@[ -n "$(NODE_BIN)" ] || { echo "no node on PATH"; exit 1; }
	@[ -n "$(YARN_BIN)" ] || { echo "no yarn on PATH"; exit 1; }
	@mkdir -p ~/.config/systemd/user
	@REPO_DIR="$(CURDIR)" NODE_BIN="$(NODE_BIN)" NODE_DIR="$$(dirname "$(NODE_BIN)")" \
		YARN_BIN="$(YARN_BIN)" DATABASE_URL="$${DATABASE_URL:-}" \
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
SITE_SRC_LOCAL ?= ontoplano-site
PYTHON ?= python3

# `dev` is the app; this is the name to type when you mean it by contrast.
dev-app: dev

# The docs, generated from the code and served as the static site it becomes.
# Regenerated first, every time: the whole point of the docs is that it cannot
# drift from the code, and previewing a stale copy would be exactly that drift.
dev-docs:
	@yarn -s docs
	@yarn -s docs:site
	@echo "documentation at http://localhost:$(DOCS_PORT) — Ctrl-C to stop"
	@cd build-docs && $(PYTHON) -m http.server $(DOCS_PORT) --bind 127.0.0.1

# The marketing site, which is a separate repository. Absent from most
# checkouts, and that is not an error — it is a different audience and a
# different repo, so this says so and stops.
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

dev-logs:
	journalctl --user -u ontoplano-dev -f

# The dev server in this terminal, the old way. Snapshots first, like the unit.
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
_billing-in-build:
	@[ -f src/lib/server/billing/providers/paddle.ts ] || exit 0
	@# Nothing may throw the provider away at run time.
	@#
	@# `import.meta.glob` is a build-time rewrite of the CALL, not a function
	@# that exists in Node. A `typeof import.meta.glob === 'function'` guard
	@# around it survives into the bundle, evaluates false there, and discards
	@# the provider — which is exactly what shipped: the module bundled,
	@# imported and dropped. Nothing failed and nothing logged; the app simply
	@# decided it could not sell, for a fortnight.
	@if grep -rqs 'typeof import.meta.glob' build/server --include='*.js'; then \
		$(NO) "this build guards import.meta.glob at run time"; \
		echo "  It is undefined in Node, so that guard is always false and the"; \
		echo "  provider it protects is discarded. src/lib/server/billing/index.ts."; \
		exit 1; \
	fi
	@# And the provider is actually in the bundle. It can be sitting in the tree
	@# and absent from the build — Vite resolves the glob once and caches it.
	@if grep -rqs 'providers/paddle' build/server --include='*.js'; then \
		$(OK) "the payment provider is in this build"; \
	else \
		$(NO) "the provider is in the tree and NOT in the build"; \
		echo "  rm -rf node_modules/.vite .svelte-kit && make build"; \
		exit 1; \
	fi

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
icons:
	@yarn -s icons

preview:
	yarn preview

start: build
	node build/index.js

# ─── Database ─────────────────────────────────────────────────────────────────

# Local development only. `push` rebuilds tables to change them and has
# produced a wrong migration three times; production goes through
# generate → review → db-migrate. The guard refuses the production database.
db-push:
	yarn db:push

db-seed:
	npx tsx src/lib/server/db/seed.ts

db-generate:
	yarn db:generate

# Snapshots the database, then applies pending migrations. Part of `deploy`,
# so a schema change can never ship without the migration that backs it.
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
db-import:
	@[ -n "$(FILE)" ] || { echo "make db-import FILE=export.json EMAIL=you@example.com"; exit 1; }
	@[ -n "$(EMAIL)" ] || { echo "make db-import FILE=export.json EMAIL=you@example.com"; exit 1; }
	@$(MAKE) -s db-snapshot
	npx tsx scripts/import-account.ts "$(FILE)" "$(EMAIL)"

db-snapshot:
	yarn db:snapshot manual

db-studio:
	yarn db:studio

# ─── Backups ──────────────────────────────────────────────────────────────────
#
# Snapshots live beside the database and cover a bad migration; replication
# ships the WAL offsite and covers a dead disk. See docs/BACKUP.md.

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

backup-status:
	@systemctl --user --no-pager status ontoplano-litestream | head -5 || true
	@litestream generations -config $$HOME/.config/litestream.yml

# A backup nobody has restored is a hypothesis.
backup-drill:
	@scripts/restore-drill.sh

db:
	sqlite3 ~/.local/share/ontoplano/ontoplano.db

bdb:
	sqlitebrowser ~/.local/share/ontoplano/ontoplano.db &

db-setup: db-push db-seed

# ─── Code Quality ────────────────────────────────────────────────────────────

lint:
	yarn lint
	@$(MAKE) -s docs-check
	@yarn -s changelog:check
	@# The scheduled jobs run under `tsx` in a production install. A service
	@# that reaches for a development-only package works everywhere except
	@# there, and the box is where nobody is watching.
	@node scripts/check-job-deps.mjs

format:
	yarn format

# ─── Docs ─────────────────────────────────────────────────────────────────────

# The docs is built from the schema snapshot, the route files, the scope table
# and the shortcut map. It is committed so it can be read on the forge without
# a checkout, which is exactly the arrangement that lets a generated file go
# stale — so `make lint` fails when it has.
docs:
	yarn docs

# The same docs as a static site, for docs.ontoplano.com. Regenerates the
# markdown first, so what is published is never staler than the code.
docs-site: docs
	@yarn -s docs:site

docs-check:
	@yarn -s docs:check

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

docker-build:
	docker compose build

docker-up:
	docker compose up -d

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
package: build
	@node scripts/package.mjs $(PACKAGE)

# The half that matters: unpack what was built, run it, and check the unit says
# what the package does. Nothing is installed on this machine.
package-check:
	@bash tests/packaging.sh

logs:
	journalctl --user -u ontoplano -f

# ─── Systemd ─────────────────────────────────────────────────────────────────

PROD_DIR = $(HOME)/.local/share/ontoplano/app

# Installing on the machine you are already sitting at. `deploy` below is the
# one for the server; this is what `install-service` builds on, and what you
# want when the box and the checkout are the same box.
deploy-local: build db-migrate
	@echo "Deploying to $(PROD_DIR)..."
	@mkdir -p $(PROD_DIR)
	@rm -rf $(PROD_DIR)/build
	@cp -r build $(PROD_DIR)/build
	@cp package.json $(PROD_DIR)/package.json
	@rsync -a --delete node_modules $(PROD_DIR)/
	@echo "Deploy complete."

update: deploy-local
	@echo "Restarting ontoplano service..."
	@systemctl --user restart ontoplano
	@echo "Update complete. Check: systemctl --user status ontoplano"

up-phone: android android-install
	@echo "Phone updated against $(ONTOPLANO_ORIGIN)."

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
	@echo "The service will run $(NODE_BIN) ($$($(NODE_BIN) -v))"
	@systemctl --user daemon-reload
	@systemctl --user enable ontoplano
	@systemctl --user start ontoplano
	@echo "Service installed and started. Check: systemctl --user status ontoplano"

uninstall-service:
	@systemctl --user stop ontoplano || true
	@systemctl --user disable ontoplano || true
	@rm -f ~/.config/systemd/user/ontoplano.service
	@systemctl --user daemon-reload
	@echo "Service uninstalled."

# ─── Android ─────────────────────────────────────────────────────────────────
#
# The APK lives in android-twa/, which is inside the repo, so `android-install`
# and `android-share` need nothing but the file — no JDK, no Android SDK. Only
# `android` (the build) needs the toolchain; see docs/ANDROID.md.

APK := android-twa/app-release-signed.apk
AAB := android-twa/app-release-bundle.aab

# Where the phone downloads from. The first address on this machine, which is
# the one a phone on the same wifi can reach — not 127.0.0.1.
# Whichever address this machine would use to reach the outside world, which is
# the one a phone on the same wifi can reach. Asking the routing table rather
# than naming an interface, which would be one machine’s network card.
LAN_IP := $(shell ip route get 1.1.1.1 2>/dev/null | awk '{print $$7; exit}')

# The address the app opens.
#
# A TWA is bound to one origin at build time and there is no switching it
# afterwards, so there is no sensible default and none in defaults.env: set
# ONTOPLANO_ORIGIN in local.mk for the instance you deploy, or use
# `make android-lan` to build against this machine over wifi.

android:
	@# Catches an empty or host-less ONTOPLANO_ORIGIN, which would otherwise
	@# build an app pointed at nothing and fail confusingly on the phone
	@# rather than here.
	@case "$(ONTOPLANO_ORIGIN)" in \
		""|*://:*|*://) \
			echo "ONTOPLANO_ORIGIN has no host: $(ONTOPLANO_ORIGIN)"; \
			echo "LAN_IP came back empty. Either fix it or pass an origin:"; \
			echo "  make android ONTOPLANO_ORIGIN=https://plan.example.com"; \
			exit 1;; \
	esac
	@echo "Building against $(ONTOPLANO_ORIGIN)"
	ONTOPLANO_ORIGIN="$(ONTOPLANO_ORIGIN)" node scripts/build-twa.mjs
	@$(MAKE) -s android-check

# Against this machine over wifi, for working on the phone without deploying.
#: LAN_IP=192.168.0.10  this machine's address, for android-lan and android-share
android-lan:
	@$(MAKE) android ONTOPLANO_ORIGIN=http://$(LAN_IP):$(APP_PORT)

# Does the server agree that this app is allowed to drop its URL bar?
#
# The single most common TWA complaint is "it works but it looks like a
# browser", and the cause is always the same: the site is not serving this
# keystore's fingerprint at /.well-known/assetlinks.json. That is invisible
# until the app is installed, so it is worth asking the server now.
android-check:
	@case "$(ONTOPLANO_ORIGIN)" in https://*) ;; *) exit 0;; esac; \
	fp=$$($(MAKE) -s android-fingerprint 2>/dev/null | head -1); \
	body=$$(curl -fsS -m 10 "$(ONTOPLANO_ORIGIN)/.well-known/assetlinks.json" 2>/dev/null); \
	if [ -z "$$body" ]; then \
		echo; \
		echo "Warning: $(ONTOPLANO_ORIGIN)/.well-known/assetlinks.json did not answer."; \
		echo "The app will work and will show a URL bar."; \
	elif [ -n "$$fp" ] && ! echo "$$body" | grep -qiF "$$fp"; then \
		echo; \
		echo "Warning: the server is not serving this keystore's fingerprint."; \
		echo "On the server, in ~/.config/ontoplano/env:"; \
		echo "  ANDROID_CERT_FINGERPRINTS=$$fp"; \
		echo "then: systemctl --user restart ontoplano"; \
	else \
		echo "Server confirms this app: the URL bar will be hidden."; \
	fi

# Straight onto a phone over USB or wireless debugging.
android-install: $(APK)
	@command -v adb >/dev/null || { \
		echo "adb not found. Install android-tools-adb, or use 'make android-share'"; \
		echo "to download the APK onto the phone over wifi instead."; \
		exit 1; \
	}
	@if [ -z "$$(adb devices | sed -n '2p')" ]; then \
		echo "No device. Either:"; \
		echo "  USB      — plug in, enable USB debugging, accept the prompt on the phone"; \
		echo "  wireless — Developer options > Wireless debugging, then:"; \
		echo "               adb pair <phone-ip>:<pair-port>   (one time)"; \
		echo "               adb connect <phone-ip>:<port>"; \
		exit 1; \
	fi
	@echo "Installing to $$(adb devices | sed -n '2p' | cut -f1)…"
	@# -r reinstalls over an existing copy; -d allows going back to an older
	@# version, which happens whenever you rebuild without bumping the version.
	@# Android refuses an update signed by a different key than the installed
	@# copy, which is a deliberate protection and not something -r can override —
	@# so say what it means instead of leaving the raw failure.
	@if ! adb install -r -d $(APK) 2>&1 | tee /tmp/ontoplano-adb.log; then :; fi
	@if grep -q INSTALL_FAILED_UPDATE_INCOMPATIBLE /tmp/ontoplano-adb.log; then \
		echo; \
		echo "The copy on the phone was signed with a different key than this build."; \
		echo "Android will not replace it — that check is what stops someone else"; \
		echo "shipping an update to your app. Remove the old one first:"; \
		echo; \
		echo "  make android-uninstall && make android-install"; \
		echo; \
		echo "Its data goes with it. For a TWA that is only the browser storage;"; \
		echo "your planner data lives on the server."; \
		exit 1; \
	fi
	@grep -q "^Success" /tmp/ontoplano-adb.log && echo "Installed. Look for Ontoplano in the launcher."

# No adb, no cable: serve the APK and scan the code with the phone's camera.
#
# Served out of a directory holding nothing but a copy of the APK, because
# android-twa/ also contains the signing keystore and pointing an open HTTP
# server at that directory would publish the key to the local network. The
# directory is stable rather than temporary, so there is nothing to clean up
# when this is ended with Ctrl-C — which is how it is meant to be ended.
SHARE_DIR := android-twa/dist

android-share: $(APK)
	@if [ -z "$(LAN_IP)" ]; then echo "Could not determine this machine's IP address."; exit 1; fi
	@mkdir -p $(SHARE_DIR)
	@cp -f $(APK) $(SHARE_DIR)/
	@echo
	@echo "  http://$(LAN_IP):$(APK_PORT)/$(notdir $(APK))"
	@echo
	@command -v qrencode >/dev/null \
		&& qrencode -t ANSIUTF8 "http://$(LAN_IP):$(APK_PORT)/$(notdir $(APK))" \
		|| echo "  (apt install qrencode for a scannable code)"
	@echo
	@echo "  Open that on the phone, then allow installing from this browser."
	@echo "  If the phone cannot reach it, check both are on the same wifi."
	@echo "  Ctrl-C when the download finishes."
	@echo
	@cd $(SHARE_DIR) && python3 -m http.server $(APK_PORT) --bind 0.0.0.0

# The fingerprint that goes in ANDROID_CERT_FINGERPRINTS on the server, without
# which the app shows a URL bar.
android-fingerprint:
	@command -v keytool >/dev/null || { echo "keytool not found — install a JDK."; exit 1; }
	@keystore="$(ANDROID_KEYSTORE)"; \
	if [ ! -f "$$keystore" ]; then \
		echo "No keystore at $$keystore. Build once with 'make android' first."; \
		exit 1; \
	fi; \
	pass=$${ANDROID_KEYSTORE_PASSWORD:-$$BUBBLEWRAP_KEYSTORE_PASSWORD}; \
	if [ -z "$$pass" ] && [ -f "$$keystore.pass" ]; then pass=$$(cat "$$keystore.pass"); fi; \
	if [ -n "$$pass" ]; then set -- -storepass "$$pass"; else set --; fi; \
	fp=$$(keytool -list -v -keystore "$$keystore" \
		-alias "$(ANDROID_KEY_ALIAS)" "$$@" 2>/dev/null \
		| grep "SHA256:" | head -1 | sed 's/.*SHA256: *//'); \
	if [ -z "$$fp" ]; then \
		echo "Could not read the fingerprint from $$keystore."; \
		echo "Wrong alias, or no password — the build writes one to $$keystore.pass,"; \
		echo "or set ANDROID_KEYSTORE_PASSWORD for a key from elsewhere."; \
		exit 1; \
	fi; \
	echo "$$fp"; \
	echo; \
	echo "Set this on the server so the app can drop its URL bar:"; \
	echo "  ANDROID_CERT_FINGERPRINTS=$$fp"; \
	echo; \
	echo "Once published, add Play's app-signing fingerprint too — Play re-signs"; \
	echo "uploads, so trusting only this key shows a URL bar for store installs."

# Removing the app is the only way past a signing-key change.
android-uninstall:
	@command -v adb >/dev/null || { echo "adb not found."; exit 1; }
	adb uninstall "$(ANDROID_PACKAGE_NAME)"

# Start a new signing key, when the old one's password is lost.
#
# Only safe while the app is self-distributed: a published app is tied to its
# key forever, and a new key means a new Play listing that existing users will
# not receive updates from.
android-keystore-reset:
	@keystore="$(ANDROID_KEYSTORE)"; \
	if [ ! -f "$$keystore" ]; then echo "No keystore at $$keystore — nothing to reset."; exit 0; fi; \
	echo "This deletes $$keystore and the app can no longer update the copy"; \
	echo "installed on any phone — you will need 'make android-uninstall' there."; \
	printf 'Type the word reset to continue: '; \
	read answer; \
	[ "$$answer" = reset ] || { echo "Cancelled."; exit 1; }; \
	stamp=$$(date +%Y%m%d%H%M%S); \
	mv "$$keystore" "$$keystore.$$stamp.bak"; \
	[ -f "$$keystore.pass" ] && mv "$$keystore.pass" "$$keystore.pass.$$stamp.bak"; \
	echo "Old key kept alongside as .bak."; \
	echo "Now run: make android — it will make a new key and its own password."

android-clean:
	rm -rf android-twa

$(APK):
	@echo "$(APK) does not exist yet. Build it with:"
	@echo "  ONTOPLANO_ORIGIN=https://plan.example.com make android"
	@exit 1


# ─── HTTPS ───────────────────────────────────────────────────────────────────
#
# The Android app shows a browser-style URL bar until it can prove it owns the
# site it opens, and that proof — Digital Asset Links — is only checked over
# HTTPS. On plain http there is no way to hide the bar, and no service worker
# either, since browsers only run those in a secure context.
#
# Tailscale is the least painful way to get a real certificate for a machine
# with no public address: it issues one for a name it controls, and nothing has
# to be port-forwarded or exposed.

https-tailscale:
	@command -v tailscale >/dev/null || { \
		echo "tailscale is not installed. https://tailscale.com/download"; \
		exit 1; \
	}
	@tailscale status >/dev/null 2>&1 || { echo "Not logged in: tailscale up"; exit 1; }
	@host=$$(tailscale status --json | python3 -c \
		'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))'); \
	if [ -z "$$host" ]; then echo "Could not read this machine's tailnet name."; exit 1; fi; \
	echo "Serving http://127.0.0.1:$(APP_PORT) as https://$$host"; \
	tailscale serve --bg --https=443 http://127.0.0.1:$(APP_PORT) || exit 1; \
	echo; \
	echo "Now point the app at it. In the service environment:"; \
	echo "  ORIGIN=https://$$host"; \
	echo "  ONTOPLANO_TRUST_PROXY=true    # so rate limiting sees the real client"; \
	echo "  ONTOPLANO_HTTPS=true          # enables HSTS"; \
	echo "  ANDROID_CERT_FINGERPRINTS=$$(make -s android-fingerprint 2>/dev/null | head -1)"; \
	echo; \
	echo "Then rebuild the app against it:"; \
	echo "  make android ONTOPLANO_ORIGIN=https://$$host"; \
	echo "  make android-uninstall && make android-install"

https-tailscale-off:
	@tailscale serve --https=443 off || true
	@echo "Stopped. Remember to put ORIGIN back to the http address."

# ─── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf build dist .svelte-kit node_modules
