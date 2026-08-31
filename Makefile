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
	@echo "  dev / dev-stop / dev-logs   the dev server, as a user service (dev-fg holds the terminal)"
	@echo "  lint · format               prettier+eslint, prettier --write"
	@echo "  test                        the Playwright e2e suite (yarn test for units)"
	@echo "  icons                       redraw every icon from src/lib/logo/mark.svg"
	@echo "  docs                        rebuild docs/wiki from the code (lint checks it is current)"
	@echo "  docs-site                   …and render it to build-docs/ as a static site"
	@echo
	@printf '\033[1mdatabase\033[0m\n'
	@echo "  db-generate                 write a migration from the schema diff"
	@echo "  db-migrate                  apply migrations (snapshots first)"
	@echo "  db-snapshot                 a consistent copy, before something regrettable"
	@echo "  db-seed                     synthetic data for the dev account"
	@echo
	@printf '\033[1mrun it for real\033[0m\n'
	@echo "  build · preview             production build, and serve it locally"
	@echo "  install-service / update    the systemd user service: first install, then updates"
	@echo "  backup-install              Litestream replication (backup-status, backup-drill)"
	@echo
	@printf '\033[1mphone & bot\033[0m\n'
	@echo "  android                     build the APK (android-install / android-share to get it on)"
	@echo "  android-lan                 an APK pointed at this machine, over wifi"
	@echo "  telegram-install            the bot on a self-hosted box (telegram-dev to try it)"
	@if [ -f local.mk ]; then echo; \
		printf '\033[1mthis instance (local.mk)\033[0m\n'; \
		echo "  deploy · restart-server · up   see local.mk — these touch the real server"; \
	fi

.PHONY: help docs docs-site docs-check icons up-phone deploy-local android-lan android-check doctor dev dev-stop dev-logs dev-fg build preview start stop clean install-service uninstall-service update db-push db-seed db-generate db-migrate db-snapshot db-studio db bdb backup-install backup-status backup-drill lint format test docker-build docker-up docker-down logs telegram-install telegram-dev telegram-logs install-telegram-service uninstall-telegram-service https-tailscale https-tailscale-off android android-install android-uninstall android-share android-fingerprint android-keystore-reset android-clean

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
dev:
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

dev-stop:
	@systemctl --user stop ontoplano-dev
	@echo "stopped."

dev-logs:
	journalctl --user -u ontoplano-dev -f

# The dev server in this terminal, the old way. Snapshots first, like the unit.
dev-fg:
	@yarn -s db:snapshot dev
	yarn dev --port 1493

# Node sizes its heap from the machine's RAM, and on a 1GB VPS that lands at
# about 470MB — which is where the adapter-node step ran out. Raising the cap
# above physical memory is deliberate: swap carries the difference, slowly, and
# the build finishes instead of dying at 53 seconds with a core dump.
build:
	@heap=$$(free -m 2>/dev/null | awk '/^Mem:/ {print $$2}'); \
	if [ -n "$(NODE_OPTIONS)" ]; then \
		yarn build; \
	elif [ -n "$$heap" ] && [ "$$heap" -lt 2000 ]; then \
		echo "Small box ($${heap}MB of RAM): giving the build a 2GB heap and letting swap take it."; \
		NODE_OPTIONS=--max-old-space-size=2048 yarn build; \
	else \
		yarn build; \
	fi

# The logo lives in exactly one file, src/lib/logo/mark.svg. This is what turns
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

format:
	yarn format

# ─── Docs ─────────────────────────────────────────────────────────────────────

# The wiki is built from the schema snapshot, the route files, the scope table
# and the shortcut map. It is committed so it can be read on the forge without
# a checkout, which is exactly the arrangement that lets a generated file go
# stale — so `make lint` fails when it has.
docs:
	yarn docs

# The same wiki as a static site, for docs.ontoplano.com. Regenerates the
# markdown first, so what is published is never staler than the code.
docs-site: docs
	@yarn -s docs:site

docs-check:
	@yarn -s docs:check

test:
	yarn test:e2e

# ─── Docker ───────────────────────────────────────────────────────────────────

docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

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

# ─── Telegram Bot ────────────────────────────────────────────────────────────

telegram-install:
	cd telegram && yarn install

telegram-dev:
	cd telegram && yarn dev

telegram-logs:
	journalctl --user -u ontoplano-telegram -f

install-telegram-service: telegram-install
	@echo "Installing ontoplano-telegram systemd service..."
	@mkdir -p ~/.config/systemd/user
	@envsubst < systemd/ontoplano-telegram.service > ~/.config/systemd/user/ontoplano-telegram.service
	@systemctl --user daemon-reload
	@systemctl --user enable ontoplano-telegram
	@systemctl --user start ontoplano-telegram
	@echo "Telegram bot service installed. Check: systemctl --user status ontoplano-telegram"

uninstall-telegram-service:
	@systemctl --user stop ontoplano-telegram || true
	@systemctl --user disable ontoplano-telegram || true
	@rm -f ~/.config/systemd/user/ontoplano-telegram.service
	@systemctl --user daemon-reload
	@echo "Telegram bot service uninstalled."


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
