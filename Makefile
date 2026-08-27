-include instance.env
ONTOPLANO_HOST ?= ontoplano.com

.PHONY: up up-phone up-server android-lan android-check dev build preview start stop clean install-service uninstall-service update deploy db-push db-seed db-generate db-migrate db-snapshot db-studio db bdb backup-install backup-status backup-drill lint format test docker-build docker-up docker-down logs telegram-install telegram-dev telegram-logs install-telegram-service uninstall-telegram-service https-tailscale https-tailscale-off android android-install android-uninstall android-share android-fingerprint android-keystore-reset android-clean

# ─── Development ──────────────────────────────────────────────────────────────

dev:
	yarn dev --port 1493

build:
	yarn build

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
	@envsubst < ontoplano-litestream.service > ~/.config/systemd/user/ontoplano-litestream.service
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

format:
	yarn format

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

deploy: build db-migrate
	@echo "Deploying to $(PROD_DIR)..."
	@mkdir -p $(PROD_DIR)
	@rm -rf $(PROD_DIR)/build
	@cp -r build $(PROD_DIR)/build
	@cp package.json $(PROD_DIR)/package.json
	@rsync -a --delete node_modules $(PROD_DIR)/
	@echo "Deploy complete."

update: deploy
	@echo "Restarting ontoplano service..."
	@systemctl --user restart ontoplano
	@echo "Update complete. Check: systemctl --user status ontoplano"

# ─── The two things you actually run ─────────────────────────────────────────
#
# Both of these existed as pairs of commands typed in the right order, which is
# a thing to get wrong at the end of a long day. `up` is the one to reach for.

up-phone: android android-install
	@echo "Phone updated."

up-server: db-migrate
	@echo "Restarting ontoplano service…"
	@systemctl --user restart ontoplano
	@echo "Server updated. Check: systemctl --user status ontoplano"

# Server first on purpose: the phone is a shell around the server's pages, so a
# phone built against a server that has not migrated yet opens onto errors.
up: up-server up-phone
	@echo "Everything updated."

# The node the service will run, resolved at install time.
#
# Whatever built node_modules is the only node that can load them: better-sqlite3
# is a native module, and Node's ABI changes between majors. Hardcoding
# /usr/bin/node in the unit meant a box with nvm, or with NodeSource beside
# Ubuntu's nodejs, built against one and ran against the other.
NODE_BIN := $(shell command -v node)

install-service: deploy
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
	@NODE_BIN="$(NODE_BIN)" envsubst < ontoplano.service > ~/.config/systemd/user/ontoplano.service
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
	@envsubst < ontoplano-telegram.service > ~/.config/systemd/user/ontoplano-telegram.service
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
APK_PORT ?= 8088

# Where the phone downloads from. The first address on this machine, which is
# the one a phone on the same wifi can reach — not 127.0.0.1.
LAN_IP := $(shell ip -4 addr show eth0 | awk '$$1 == "inet" {sub(/\/.*/, "", $$2); print $$2; exit}')

# The address the app opens.
#
# The hosted instance, so `make up-phone` reinstalls the real app rather than
# one bound to whatever address this laptop had that day. A TWA is bound to one
# origin at build time — there is no switching it afterwards — so this is the
# decision the build makes, and it is the same name everything else in the repo
# uses. For a build against this machine over wifi, `make android-lan`.
APP_PORT ?= 1493
ONTOPLANO_ORIGIN ?= https://$(ONTOPLANO_HOST)

android:
	@# Catches an empty LAN_IP, which would otherwise build an app pointed at
	@# "http://:1493" and fail confusingly on the phone rather than here.
	@case "$(ONTOPLANO_ORIGIN)" in \
		*://:*|*://) \
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
	@keystore=$${ANDROID_KEYSTORE:-android-twa/android.keystore}; \
	if [ ! -f "$$keystore" ]; then \
		echo "No keystore at $$keystore. Build once with 'make android' first."; \
		exit 1; \
	fi; \
	pass=$${ANDROID_KEYSTORE_PASSWORD:-$$BUBBLEWRAP_KEYSTORE_PASSWORD}; \
	if [ -z "$$pass" ] && [ -f "$$keystore.pass" ]; then pass=$$(cat "$$keystore.pass"); fi; \
	if [ -n "$$pass" ]; then set -- -storepass "$$pass"; else set --; fi; \
	fp=$$(keytool -list -v -keystore "$$keystore" \
		-alias $${ANDROID_KEY_ALIAS:-ontoplano} "$$@" 2>/dev/null \
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
	adb uninstall $${ANDROID_PACKAGE_NAME:-app.ontoplano.twa}

# Start a new signing key, when the old one's password is lost.
#
# Only safe while the app is self-distributed: a published app is tied to its
# key forever, and a new key means a new Play listing that existing users will
# not receive updates from.
android-keystore-reset:
	@keystore=$${ANDROID_KEYSTORE:-android-twa/android.keystore}; \
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
	@echo "  ONTOPLANO_DOMAIN=plan.example.com make android"
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
