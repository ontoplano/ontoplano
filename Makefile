.PHONY: dev build preview start stop clean install-service uninstall-service update deploy db-push db-seed db-generate db-migrate db-snapshot db-studio db bdb lint format test docker-build docker-up docker-down logs telegram-install telegram-dev telegram-logs install-telegram-service uninstall-telegram-service android android-install android-share android-fingerprint android-clean

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

install-service: deploy
	@echo "Installing ontoplano systemd service..."
	@mkdir -p ~/.config/systemd/user
	@envsubst < ontoplano.service > ~/.config/systemd/user/ontoplano.service
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
LAN_IP := $(shell hostname -I 2>/dev/null | awk '{print $$1}')

android:
	@if [ -z "$$ONTOPLANO_DOMAIN" ]; then \
		echo "ONTOPLANO_DOMAIN is required — the domain the app opens."; \
		echo "  ONTOPLANO_DOMAIN=plan.example.com make android"; \
		exit 1; \
	fi
	node scripts/build-twa.mjs

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
	adb install -r -d $(APK)
	@echo "Installed. Look for Ontoplano in the launcher."

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
	if [ -n "$$pass" ]; then set -- -storepass "$$pass"; else set --; fi; \
	fp=$$(keytool -list -v -keystore "$$keystore" \
		-alias $${ANDROID_KEY_ALIAS:-ontoplano} "$$@" 2>/dev/null \
		| grep "SHA256:" | head -1 | sed 's/.*SHA256: *//'); \
	if [ -z "$$fp" ]; then \
		echo "Could not read the fingerprint from $$keystore."; \
		echo "Wrong alias, or no store password — set ANDROID_KEYSTORE_PASSWORD"; \
		echo "to skip the interactive prompt."; \
		exit 1; \
	fi; \
	echo "$$fp"; \
	echo; \
	echo "Set this on the server so the app can drop its URL bar:"; \
	echo "  ANDROID_CERT_FINGERPRINTS=$$fp"; \
	echo; \
	echo "Once published, add Play's app-signing fingerprint too — Play re-signs"; \
	echo "uploads, so trusting only this key shows a URL bar for store installs."

android-clean:
	rm -rf android-twa

$(APK):
	@echo "$(APK) does not exist yet. Build it with:"
	@echo "  ONTOPLANO_DOMAIN=plan.example.com make android"
	@exit 1

# ─── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf build dist .svelte-kit node_modules
