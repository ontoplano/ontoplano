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


.PHONY: messages hooks dev-site-fg dev-site-logs dev-site-stop _site-checkout announce _billing-in-build vars print-% badges android-project fdroid _billing-provider package package-check _dev-port _dev-deps _dev-migrated reset-dev help docs docs-site docs-check icons icon help-shots deploy-local doctor dev dev-app dev-docs dev-site dev-all dev-stop dev-logs dev-fg build preview start stop clean install-service install-mail-service uninstall-service db-push db-strangers db-dry-run db-seed db-generate db-migrate db-snapshot db-import db-studio db bdb backup-install backup-status backup-drill lint format test docker-build docker-image docker-up docker-down _docker-safe _docker-audit logs https-local _a-real-workstation android android-all android-store android-install android-install-all _adb-install _apks-are-fresh android-uninstall isolated isolated-preview test-isolated

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
##
## It migrates before it starts (and starts the database again from scratch if
## it cannot, see `_dev-migrated`), and the page in the browser reloads itself
## on a change — a component is hot-swapped by vite, and a server file reloads
## the tab outright, which is `reloadOnServerChange` in `vite.config.ts`.
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
	@# And the hooks, quietly, every time: a checkout that has never run this
	@# is a checkout that can push a red pipeline.
	@git config core.hooksPath githooks 2>/dev/null || true

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
#
# And when it cannot migrate, it starts again.
#
# The other half of the same shape. A database can be *ahead* of the code as
# well as behind it — a branch tried out and left, migrations renumbered after
# a rebase — and the migrator rightly refuses that rather than re-creating
# tables that already exist. On a server that is an emergency; on a dev
# machine it is a Tuesday, and the answer is always the same three commands
# typed out of the error message.
#
# So they are not typed. `reset-dev` does them, and it is the one that refuses
# a database holding accounts that are not the dev one — so this cannot eat
# anybody's real data, and on the machine where it can it costs seconds.
_dev-migrated:
	@if out=$$(yarn -s db:migrate 2>&1); then \
		case "$$out" in *"migration"*) echo "$$out" | grep -v '^Snapshot:' ;; esac; \
	else \
		echo "$$out"; \
		echo; \
		echo "This database cannot take the code's migrations — starting again with a clean one."; \
		$(MAKE) --no-print-directory reset-dev; \
	fi

# A clean dev database, every time: nothing kept, nothing carried over.
#
# Deletes the database and everything beside it — the write-ahead log, the
# copies past resets kept, the snapshots taken before past migrations — then
# migrates, makes the same account it always makes, and seeds. What you get is
# the same slate whatever state you were in.
#
# It used to move the old file aside instead of deleting it, which was worse
# than useless: `make dev` runs as a service that holds the database open, and
# a moved file is still that service's file. The app went on serving the old
# data and the reset "did nothing". So the service is stopped first and started
# again afterwards, and the old data is gone rather than kept where the next
# reset will pretend it matters.
#
# It still refuses a database that is not a dev one — see below.
#
#: RESET_DEV_ANYWAY=1  reset a database holding accounts that are not the dev one
## a clean, seeded dev database — same account, every time
reset-dev:
	@db="$${DATABASE_URL:-$$HOME/.local/share/ontoplano/ontoplano.db}"; \
	if [ -z "$$RESET_DEV_ANYWAY" ] && systemctl is-active --quiet ontoplano 2>/dev/null; then \
		echo "ontoplano is running as a system service against $$db."; \
		echo ""; \
		echo "That is a deployment, not a dev machine, and this deletes the whole"; \
		echo "database. If you mean it:"; \
		echo ""; \
		echo "  make reset-dev RESET_DEV_ANYWAY=1"; \
		exit 1; \
	fi; \
	if [ -z "$$RESET_DEV_ANYWAY" ] && [ -f "$$db" ]; then \
		others=$$(node scripts/strangers-in-the-db.mjs "$$db" 2>/dev/null || echo unknown); \
		if [ "$$others" != "0" ]; then \
			echo "$$db holds $$others account(s) that are not the dev one."; \
			echo ""; \
			echo "A dev database has one account, dev@ontoplano.test, and this deletes"; \
			echo "the whole file. Anything else is somebody's data."; \
			echo ""; \
			echo "  make reset-dev RESET_DEV_ANYWAY=1"; \
			exit 1; \
		fi; \
	fi; \
	running=""; \
	if systemctl --user is-active --quiet ontoplano-dev 2>/dev/null; then \
		running=yes; systemctl --user stop ontoplano-dev; \
		echo "stopped ontoplano-dev — it was holding the database open"; \
	fi; \
	rm -f "$$db" "$$db"-wal "$$db"-shm "$$db".*; \
	DATABASE_URL="$$db" node scripts/migrate.mjs >/dev/null && \
	printf 'ontoplano-dev\n' | DATABASE_URL="$$db" node scripts/make-operator.mjs dev@ontoplano.test >/dev/null && \
	node scripts/seed-dev.mjs "$$db" dev@ontoplano.test && \
	if [ -n "$$running" ]; then systemctl --user start ontoplano-dev; echo "started ontoplano-dev again"; fi; \
	echo "clean — sign in as dev@ontoplano.test / ontoplano-dev"

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

# There is no commit hook any more.
#
# One formatted, regenerated the docs and linted on every commit — including
# the fifteen in an afternoon that nobody was about to push — and it put the
# cost on the wrong event. A commit is a note to yourself; a push to GitHub is
# the thing with a pipeline behind it and an audience.
#
# The same work runs once now, at `make github-push`, over the whole tree
# rather than over whatever happened to be staged. This target stays so a
# checkout that installed the old `core.hooksPath` can take it back off.
## take the old git hooks off (they run at `make github-push` now)
hooks:
	@git config --unset core.hooksPath 2>/dev/null || true
	@echo "hooks: none — the formatting, the docs and the lint run at 'make github-push'."

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
#
# Its `dev`, not its `preview`: preview serves whatever the last build wrote
# and watches nothing, so every change to the site's copy or to the backdrop's
# knobs meant stopping this and starting it again. `dev` rebuilds on a change
# and reloads the page, keeping the scroll position.
#
# And detached, like `make dev` is. Editing the site means editing files and
# looking at the page; a watcher holding the terminal it was started from
# means a second terminal for everything else, which is the thing `make dev`
# stopped doing years ago. `make dev-site-logs` follows it, `make
# dev-site-stop` ends it, and `make dev-site-fg` is the old behaviour for
# anybody who wants to watch it build.
#: SITE_DEV_LOG=.dev-site.log  where the detached site watcher writes
SITE_DEV_LOG ?= $(CURDIR)/.dev-site.log

## the marketing site, watched and reloaded, in the background
dev-site: _site-checkout
	@if curl -fsS -m 2 -o /dev/null "http://localhost:$(SITE_PORT)/" 2>/dev/null; then \
		$(GOOD) "already up — http://localhost:$(SITE_PORT)"; \
		echo "  make dev-site-logs   follow it"; \
		echo "  make dev-site-stop   stop it"; \
		exit 0; \
	fi
	@: > "$(SITE_DEV_LOG)"
	@cd $(SITE_SRC_LOCAL) && setsid $(MAKE) -s dev PREVIEW_PORT=$(SITE_PORT) \
		>> "$(SITE_DEV_LOG)" 2>&1 < /dev/null &
	@# Wait for it to answer rather than printing an address that is not up
	@# yet: the first build is a couple of seconds, and a link that 404s for
	@# two of them is a link somebody presses twice.
	@for i in $$(seq 40); do \
		curl -fsS -m 1 -o /dev/null "http://localhost:$(SITE_PORT)/" 2>/dev/null && break; \
		sleep 0.5; \
	done
	@if curl -fsS -m 2 -o /dev/null "http://localhost:$(SITE_PORT)/" 2>/dev/null; then \
		$(GOOD) "site  ->  http://localhost:$(SITE_PORT)  (watching, reloads on save)"; \
		echo "  make dev-site-logs   follow it"; \
		echo "  make dev-site-stop   stop it"; \
	else \
		$(BAD) "the site watcher did not come up — $(SITE_DEV_LOG) says why"; \
		tail -20 "$(SITE_DEV_LOG)" 2>/dev/null | sed 's/^/    /'; \
		exit 1; \
	fi

## …in this terminal instead, holding it
dev-site-fg: _site-checkout
	@$(MAKE) -s -C $(SITE_SRC_LOCAL) dev PREVIEW_PORT=$(SITE_PORT)

## …follow the background one
dev-site-logs:
	@tail -f -n 50 "$(SITE_DEV_LOG)"

## …and stop it
dev-site-stop:
	@# By the port it holds rather than by a stored pid: a pid file outlives
	@# the process that wrote it, and the thing anybody actually knows about
	@# this server is which port it is on.
	@pid=$$(ss -lntp 2>/dev/null | sed -n 's/.*:$(SITE_PORT) .*pid=\([0-9]*\).*/\1/p' | head -1); \
	if [ -z "$$pid" ]; then echo "nothing on $(SITE_PORT)."; exit 0; fi; \
	kill -- -$$(ps -o pgid= $$pid | tr -d ' ') 2>/dev/null || kill $$pid 2>/dev/null || true; \
	echo "stopped."

_site-checkout:
	@if [ ! -d "$(SITE_SRC_LOCAL)" ]; then \
		echo "No site checkout at $(SITE_SRC_LOCAL)."; \
		echo "ontoplano.com is a separate repository; this one is the app."; \
		echo "If you have it elsewhere:  make dev-site SITE_SRC_LOCAL=../elsewhere"; \
		exit 1; \
	fi

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
	@echo "Ctrl-C stops the docs; make dev-stop stops the app, make dev-site-stop the site."
	@if [ -d "$(SITE_SRC_LOCAL)" ]; then $(MAKE) -s dev-site; fi
	@$(MAKE) -s dev-docs

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

# Every word the app says lives in messages/<language>.json. This turns those
# into the typed modules the app imports — so a key that does not exist is a
# compile error, and a language that is behind is a number the settings page
# says out loud rather than a surprise on a screen.
## rewrite the message catalogues the app imports, from messages/
messages:
	@yarn -s messages

# The logo lives in exactly one file, src/lib/logo/mark.png. This is what turns
# it into the favicon, the four PWA icons and the one iOS reads — so changing
# the logo is changing a file, not finding eight copies of it.
## redraw every icon and favicon from the one source PNG
icons:
	@yarn -s icons

# The screenshots the app shows in its own help, retaken from the running
# code. A script rather than a build step because it writes into static/,
# and a build must never change the tree it builds from — so it runs when a
# pictured screen changes, not on every build.
## retake the help screenshots from the real pages
help-shots:
	@node scripts/help-shots.mjs

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

# How much heap the isolated build gets, from what the machine actually has.
#
# A flat number is wrong in both directions: node's default is about 490MB on a
# small VPS, which this build exhausts, and 4GB on a box with 1GB of RAM is a
# promise the kernel keeps by killing something. Half of physical memory, held
# between 1GB and 4GB, fits a laptop and a server without either being told.
#: ISOLATED_HEAP_MB=1024  megabytes of node heap the isolated build may use
ISOLATED_HEAP_MB ?= $(shell \
	total=$$(free -m 2>/dev/null | awk '/^Mem:/ {print $$2}'); \
	[ -n "$$total" ] || total=8192; \
	half=$$((total / 2)); \
	[ "$$half" -lt 1024 ] && half=1024; \
	[ "$$half" -gt 4096 ] && half=4096; \
	echo $$half)

# The instance that runs on the device itself: static files, no server, the
# database in the browser's own storage. This is what the phone app wraps.
## the isolated build (static, serverless)
isolated:
	@# A heap big enough for this build, and said out loud.
	@#
	@# It compiles every route twice — once into the app and once into the
	@# database worker — and died with "Ineffective mark-compacts near heap
	@# limit" at 490MB on a machine with plenty of RAM: node's default is a
	@# guess about the machine, not about the work. Appended to whatever
	@# NODE_OPTIONS already says rather than replacing it, and skipped only when
	@# a size is already named there, so a shell that exports a small one is not
	@# quietly obeyed.
	@opts="$(NODE_OPTIONS)"; \
	case "$$opts" in \
		*max-old-space-size*) echo "node heap: as NODE_OPTIONS says ($$opts)" ;; \
		*) opts="$$opts --max-old-space-size=$(ISOLATED_HEAP_MB)"; \
		   echo "node heap: $(ISOLATED_HEAP_MB)MB" ;; \
	esac; \
	start=$$(date +%s); \
	NODE_OPTIONS="$$opts" ONTOPLANO_ISOLATED_BUILD=1 PUBLIC_ONTOPLANO_ISOLATED=true yarn build; \
	printf '  \033[2m%s — %ss\033[0m\n' "the web build" "$$(( $$(date +%s) - start ))"

## serve the isolated build, the way its shell would
isolated-preview:
	node scripts/serve-isolated.mjs

## the tests for the build that ships to the stores
test-isolated: isolated
	yarn playwright test -c playwright.isolated.config.ts

# Onto the phone over adb.
#
# One app, which is the app: it carries the whole of ontoplano and its first
# screen asks where yours lives — the official instance, one you run yourself,
# or this phone and nothing else.
#
# Installs; it does not build. `make android` is the one that builds, and a
# target that quietly did both meant every install paid for a Gradle run
# whether or not anything had changed.
## install the built phone app over adb
android-install:
	@$(MAKE) --no-print-directory _apks-are-fresh FLAVOURS=official BUILT_BY="make android"
	@$(MAKE) --no-print-directory _adb-install FLAVOURS=official

# The same app three times, each with its own icon and its own answer already
# typed on that first screen: the real instance, a laptop on the LAN, and
# staging. Three application ids, so Android keeps them apart and a bug on
# staging can be read while your own week sits in the other one.
## build all three — Ontoplano, OntoplanoDev and OntoplanoStaging
#: ONTOPLANO_DEV_ORIGIN=http://192.168.1.10:1493  where the DEV app points
android-all: _a-real-workstation isolated
	@# Installed, and up to date with what the shell now asks for: adding a
	@# plugin changes package.json, and a node_modules that merely exists is how
	@# a build ships without the plugin it was supposed to gain.
	$(call timed,[ -d capacitor/node_modules ] && [ capacitor/node_modules -nt capacitor/package.json ] \
		|| (cd capacitor && npm install --no-audit --no-fund),the shell's dependencies)
	$(call timed,node scripts/brand-android.mjs,the icons)
	$(call timed,cd capacitor && npx cap sync android >/dev/null,capacitor sync)
	@# The DEV app's address comes from the environment or from defaults.env,
	@# which local.mk includes — a build in a container cannot work out which
	@# address on the wifi is this laptop's.
	$(call timed,ONTOPLANO_DEV_ORIGIN="$(ONTOPLANO_DEV_ORIGIN)" node scripts/android-flavours.mjs,the three flavours)
	@sdk=$$(node scripts/android-sdk.mjs) || { \
		echo "No Android SDK here. It is looked for in ANDROID_HOME, ANDROID_SDK_ROOT,"; \
		echo "~/.bubblewrap/config.json, ~/android-sdk, ~/Android/Sdk and beside adb."; \
		echo "  make $@ ANDROID_HOME=/path/to/sdk"; \
		exit 1; \
	}; \
	start=$$(date +%s); \
	cd capacitor/android && ANDROID_HOME="$$sdk" ./gradlew -q \
		assembleOfficialDebug assembleDevDebug assembleStagingDebug; \
	printf '  \033[2m%s — %ss\033[0m\n' "gradle, three APKs" "$$(( $$(date +%s) - start ))"
	@echo "Built all three. Put them on the phone with: make android-install-all"

## install all three over adb
android-install-all:
	@$(MAKE) --no-print-directory _apks-are-fresh FLAVOURS="official dev staging" BUILT_BY="make android-all"
	@$(MAKE) --no-print-directory _adb-install FLAVOURS="official dev staging"

# Is what is on disk actually this version of the app?
#
# `make android` builds one flavour, so `make android-install-all` after it
# installed yesterday's DEV and staging — which looks exactly like the app
# ignoring every change you just made, and cost an evening of confusion. An APK
# older than the web build inside it is refused by name, with the command that
# would fix it.
_apks-are-fresh:
	@built=capacitor/android/app/build/outputs/apk; \
	web=build-isolated/index.html; \
	[ -f "$$web" ] || { echo "No web build yet. Run: $(BUILT_BY)"; exit 1; }; \
	missing=""; stale=""; \
	for f in $(FLAVOURS); do \
		apk="$$built/$$f/debug/app-$$f-debug.apk"; \
		if [ ! -f "$$apk" ]; then missing="$$missing $$f"; \
		elif [ "$$web" -nt "$$apk" ]; then stale="$$stale $$f"; fi; \
	done; \
	if [ -n "$$missing" ] || [ -n "$$stale" ]; then \
		[ -z "$$missing" ] || echo "Never built:$$missing"; \
		[ -z "$$stale" ] || echo "Older than the app they carry:$$stale"; \
		echo; \
		echo "  $(BUILT_BY)"; \
		exit 1; \
	fi

# Whatever FLAVOURS names, onto whatever is plugged in.
#
# adb the way the rest of the android targets find their toolchain: the SDK's
# copy when it is not on PATH.
_adb-install:
	@sdk=$$(node scripts/android-sdk.mjs || echo ""); \
	adb="$$(command -v adb || echo "$$sdk/platform-tools/adb")"; \
	built=capacitor/android/app/build/outputs/apk; \
	if [ ! -x "$$adb" ]; then \
		echo "Built. No adb here to install with:"; \
		for f in $(FLAVOURS); do echo "  $$built/$$f/debug/app-$$f-debug.apk"; done; \
		exit 0; \
	fi; \
	if [ -z "$$("$$adb" devices | sed -n '2p')" ]; then \
		echo "Built. No phone over adb — plug in, enable USB debugging, then run this again."; \
		exit 0; \
	fi; \
	failed=0; \
	for flavour in $(FLAVOURS); do \
		echo "installing $$flavour…"; \
		"$$adb" install -r -d "$$built/$$flavour/debug/app-$$flavour-debug.apk" >/dev/null \
			|| { echo "  $$flavour did not install"; failed=1; }; \
	done; \
	[ "$$failed" = 0 ] \
		&& echo "On the phone." \
		|| { echo "Some did not install. An app signed by a different key has to go first:"; \
			 echo "  make android-uninstall"; exit 1; }

## run the built server
start: build
	node build/index.js

# ─── Database ─────────────────────────────────────────────────────────────────

# Local development only. `push` rebuilds tables to change them and has
# produced a wrong migration three times; production goes through
# generate → review → db-migrate. The guard refuses the production database.
### database

# What a database has actually run, and what this build cannot account for.
#
# `scripts/migrate.mjs` refuses a database holding a migration hash the repo
# cannot produce — which is right, and says how many rather than which. This
# names them, with the moment each was applied, which is usually enough to say
# which build a database belongs to. Read-only, so it is safe against a live
# server file.
#: DATABASE_URL=~/.local/share/ontoplano-staging/staging.db  which database to read
## list the migrations a database has applied, naming any strangers
db-strangers:
	@node scripts/migration-strangers.mjs "$(DATABASE_URL)"

# Would this deploy migrate cleanly? Answered without deploying.
#
# A copy of the database, taken with SQLite's own snapshot so a live server can
# be checked while it serves, migrated by the same migrator the deploy uses,
# foreign keys checked, thrown away. Finding out by doing it to production is
# not a plan.
#: DATABASE_URL=~/.local/share/ontoplano/ontoplano.db  which database to rehearse
## rehearse the migration against a throwaway copy
db-dry-run:
	@node scripts/migrate-dry-run.mjs "$(DATABASE_URL)"

## apply the schema straight to the dev database
db-push:
	yarn db:push

## synthetic data for the dev account
db-seed:
	npx tsx src/lib/server/db/seed.ts

# The mailing list hears about a release.
#
# Its own target and not a step of `publish`, deliberately: a publish that
# fails at step six is meant to be run again, and the one thing that must not
# happen twice is the one that reaches every inbox. The send refuses a version
# it has already sent, so a second run is safe — but a person deciding to send
# is better than a pipeline deciding for them.
#
# Run where the list is, which is the instance's own database.
## tell the mailing list what this release changed
#: DRY=1  print the message and the count, send nothing
announce:
	@npx tsx scripts/announce.ts $(if $(DRY),--dry,)

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
	@yarn -s messages:check
	@yarn -s copy:check
	@# Every icon the app ships is drawn from `src/lib/logo/mark.png`, and
	@# nothing checked that they had been redrawn since: the three launcher
	@# shortcuts wore the logo from before the puffin for a year.
	@yarn -s icons --check
	@node scripts/check-no-secrets.mjs
	@# Everything `migrate.mjs` imports is on the list the deploy copies beside
	@# it. It gained a neighbour once and production stopped on the box with
	@# ERR_MODULE_NOT_FOUND, after the snapshot and after the old version had
	@# been stopped.
	@node scripts/check-ship-list.mjs
	@node scripts/check-android-version.mjs
	@# The floor on a reminder and the phone's polling interval are one fact
	@# written in two languages, with nothing type-checking across the gap.
	@node scripts/check-reminder-window.mjs
	@node scripts/check-plugin.mjs
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
# How long a step took, printed after it.
#
# `make android-all` is five things in a coat — a web build, a dependency
# check, the icons, Capacitor's sync and three APKs — and `-q` everywhere means
# a slow one is a cursor sitting still. When somebody says the Android build
# takes a quarter of an hour, the only useful question is which part did, and
# this is what answers it without them having to instrument anything.
define timed
@start=$$(date +%s); $(1); \
	printf '  \033[2m%s — %ss\033[0m\n' "$(2)" "$$(( $$(date +%s) - start ))"
endef

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
# `android-install-all` above for the three that go on a developer's own phone.
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
	@# Installed, and up to date with what the shell now asks for: adding a
	@# plugin changes package.json, and a node_modules that merely exists is how
	@# a build ships without the plugin it was supposed to gain.
	@[ -d capacitor/node_modules ] && [ capacitor/node_modules -nt capacitor/package.json ] \
		|| (cd capacitor && npm install --no-audit --no-fund)
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
#   make fdroid                                a fresh recipe, first submission
#   make fdroid RECIPE=path/to/existing.yml    the same recipe plus this release
#
# RECIPE is the file as it stands in your fdroiddata fork; it is edited as
# text, so reviewers' comments and hand edits survive. It also writes the RFP
# issue and the merge request description, and fails loudly if the tag this
# version would build has not been pushed.
## F-Droid's recipe and listing for this version
#: RECIPE=metadata/app.ontoplano.yml  an existing recipe to add this release to
#: FDROID_STORE=path/to/store  where the listing's words and screenshots live
fdroid:
	@FDROID_STORE="$(FDROID_STORE)" node scripts/fdroid-metadata.mjs $(if $(RECIPE),--from $(RECIPE),)

# The app, built. One artifact, and it is the app: a build carries the whole
# of ontoplano and asks on first launch where your ontoplano lives, so there
# is nothing here to choose between.
# Not on a server.
#
# Compiling the app takes a gigabyte of heap and every core it can find. Done
# on the box that serves ontoplano it is an outage: memory pinned, the load
# past the core count, and the deploy's own build starved beside it. Refused by
# default on a machine that looks like a server, because nobody has ever meant
# to do this.
#: PHONE_BUILD_ANYWHERE=1  build the phone app on this machine whatever it looks like
_a-real-workstation:
	@[ -z "$(PHONE_BUILD_ANYWHERE)" ] || exit 0; \
	total=$$(free -m 2>/dev/null | awk '/^Mem:/ {print $$2}'); \
	cores=$$(nproc 2>/dev/null || echo 1); \
	[ -n "$$total" ] || exit 0; \
	if [ "$$total" -lt 3000 ] || [ "$$cores" -lt 2 ]; then \
		echo "This machine has $${total}MB of RAM and $$cores core(s)."; \
		echo; \
		echo "Building the phone app here would take most of both — on the box that"; \
		echo "serves ontoplano that is an outage, not a slow build. Build it on your"; \
		echo "own machine and put it on the phone from there:"; \
		echo; \
		echo "  make android-all && make android-install-all"; \
		echo; \
		echo "If you really mean it, add PHONE_BUILD_ANYWHERE=1 to the command."; \
		exit 1; \
	fi

## build the phone app
android: _a-real-workstation isolated android-project
	@sdk=$$(node scripts/android-sdk.mjs) || { \
		echo "No Android SDK here. It is looked for in ANDROID_HOME, ANDROID_SDK_ROOT,"; \
		echo "~/.bubblewrap/config.json, ~/android-sdk, ~/Android/Sdk and beside adb."; \
		echo "  make $@ ANDROID_HOME=/path/to/sdk"; \
		exit 1; \
	}; \
	cd capacitor/android && ANDROID_HOME="$$sdk" ./gradlew -q assembleOfficialDebug
	@echo "APK: capacitor/android/app/build/outputs/apk/official/debug/app-official-debug.apk"

# The store artifact: the official flavour, release, unsigned.
#
# Unsigned on purpose — F-Droid signs what it builds, and a key of ours in
# that path would only be a key to lose. For a phone in your hand, `make
# android-install`.
## the release APK for the stores
android-store: _a-real-workstation isolated android-project
	@sdk=$$(node scripts/android-sdk.mjs) || { \
		echo "No Android SDK here. It is looked for in ANDROID_HOME, ANDROID_SDK_ROOT,"; \
		echo "~/.bubblewrap/config.json, ~/android-sdk, ~/Android/Sdk and beside adb."; \
		echo "  make $@ ANDROID_HOME=/path/to/sdk"; \
		exit 1; \
	}; \
	cd capacitor/android && ANDROID_HOME="$$sdk" ./gradlew -q assembleOfficialRelease
	@echo "APK: capacitor/android/app/build/outputs/apk/official/release/app-official-release-unsigned.apk"

## remove the app from the phone over adb
# app.ontoplano.isolated is the retired fourth build, still listed so a phone
# that has one can be cleaned off. Nothing produces it any more.
android-uninstall:
	@sdk=$$(node scripts/android-sdk.mjs || echo ""); \
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
#: HTTPS_PORT=8443  serve https-local on a high port, which needs no root at all
HTTPS_PORT ?= 443

# The caddyfile, somewhere this user owns.
#
# It used to be one fixed name in /tmp, which is a path every user on the
# machine shares: a second person running this cannot write it, and `sudo make
# https-local` failed on exactly that. Per-user, in the runtime directory where
# there is one.
CADDY_CONF := $(if $(XDG_RUNTIME_DIR),$(XDG_RUNTIME_DIR),/tmp)/ontoplano-caddy-$(shell id -u).caddyfile

# Whether caddy may bind a port below 1024 without root.
#
# `caddy run` as yourself dies with "listen tcp :443: bind: permission denied"
# unless the binary carries CAP_NET_BIND_SERVICE — which some distributions set
# and some do not. Asked of the binary rather than guessed, so the answer names
# the fix instead of the symptom.
CADDY_BIN := $(shell command -v caddy 2>/dev/null)
CADDY_MAY_BIND_LOW := $(shell [ -n "$(CADDY_BIN)" ] && getcap "$(CADDY_BIN)" 2>/dev/null | grep -q cap_net_bind_service && echo yes)

# The two addresses the phone needs, written once.
HTTPS_URL := https://$(LAN_IP)$(if $(filter 443,$(HTTPS_PORT)),,:$(HTTPS_PORT))
CA_URL := http://$(LAN_IP):$(CA_PORT)/root.crt

# A QR code in the terminal, so an address gets onto a phone by pointing its
# camera at the screen rather than by typing an IP and a path without a typo.
# Quiet about it when qrencode is not installed: it is a convenience here, not
# a dependency, and the address is printed either way.
qr = $(if $(shell command -v qrencode 2>/dev/null),qrencode -t UTF8 -m 1 "$(1)",echo "    (install qrencode and this becomes a QR code)")

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
	@# A low port needs either the capability or root, and neither is something
	@# to discover from caddy's own error three screens down.
	@if [ "$(HTTPS_PORT)" -lt 1024 ] && [ "$$(id -u)" != 0 ] && [ -z "$(CADDY_MAY_BIND_LOW)" ]; then \
		echo "caddy cannot bind port $(HTTPS_PORT) as you — it has no CAP_NET_BIND_SERVICE."; \
		echo; \
		echo "  Either use a high port, which needs nothing:"; \
		echo "    make https-local HTTPS_PORT=8443"; \
		echo; \
		echo "  Or give caddy the capability once, and keep the tidy address:"; \
		echo "    sudo setcap cap_net_bind_service=+ep $(CADDY_BIN)"; \
		exit 1; \
	fi
	@printf '%s\n' \
		"{" \
		"$(if $(filter 0,$(TRUST_LOCAL)),	skip_install_trust,	# this machine trusts the CA: the one sudo prompt)" \
		"	admin off" \
		"}" \
		"" \
		"https://$(LAN_IP):$(HTTPS_PORT) {" \
		"	tls internal" \
		"	reverse_proxy 127.0.0.1:$(APP_PORT)" \
		"}" \
		"" \
		"# Plain HTTP on purpose: this is how the phone fetches the certificate" \
		"# it does not trust yet, and there is nothing secret in a public key." \
		"http://$(LAN_IP):$(CA_PORT) {" \
		"	root * $(dir $(CA_FILE))" \
		"	file_server" \
		"}" > $(CADDY_CONF)
	@caddy fmt --overwrite $(CADDY_CONF) >/dev/null 2>&1 || true
	@echo
	@echo "  ontoplano over HTTPS, on this network"
	@echo "  ────────────────────────────────────────────────────────────────"
	@echo "  The app:        $(HTTPS_URL)"
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
	@echo "    1. Point the camera at this, and let root.crt download:"
	@echo
	@$(call qr,$(CA_URL))
	@echo
	@echo "    2. Settings → Security → More security settings →"
	@echo "       Encryption & credentials → Install a certificate →"
	@echo "       CA certificate → Install anyway → pick root.crt."
	@echo "       (Some phones: Settings → Security → Install from storage.)"
	@echo "    3. Then point it at this, which is the app:"
	@echo
	@$(call qr,$(HTTPS_URL))
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
	@caddy run --config $(CADDY_CONF) --adapter caddyfile

# ─── Clean ────────────────────────────────────────────────────────────────────

## delete build output and node_modules
clean:
	rm -rf build dist .svelte-kit node_modules
