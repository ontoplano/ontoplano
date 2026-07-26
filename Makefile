.PHONY: dev build preview start stop clean install-service uninstall-service update deploy db-push db-seed db-generate db-migrate db-studio db bdb lint format test docker-build docker-up docker-down logs telegram-install telegram-dev telegram-logs install-telegram-service uninstall-telegram-service

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

db-migrate:
	yarn db:migrate

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

deploy: build
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

# ─── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf build dist .svelte-kit node_modules
