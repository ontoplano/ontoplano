.PHONY: dev build preview start stop clean install-service uninstall-service db-push db-seed db-generate db-migrate db-studio db lint format test docker-build docker-up docker-down logs

# ─── Development ──────────────────────────────────────────────────────────────

dev:
	yarn dev

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
	sqlite3 ~/.local/share/semotina/semotina.db

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
	docker compose logs -f semotina

# ─── Systemd ─────────────────────────────────────────────────────────────────

install-service:
	@echo "Installing semotina systemd service..."
	@mkdir -p ~/.config/systemd/user
	@envsubst < semotina.service > ~/.config/systemd/user/semotina.service
	@systemctl --user daemon-reload
	@systemctl --user enable semotina
	@systemctl --user start semotina
	@echo "Service installed and started. Check: systemctl --user status semotina"

uninstall-service:
	@systemctl --user stop semotina || true
	@systemctl --user disable semotina || true
	@rm -f ~/.config/systemd/user/semotina.service
	@systemctl --user daemon-reload
	@echo "Service uninstalled."

# ─── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf build dist .svelte-kit node_modules
