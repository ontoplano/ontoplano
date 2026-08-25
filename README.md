# ontoplano

A planner for a whole week, not just a work day.

You describe the week you intend to have — blocks of time, recurring or one-off,
each belonging to an area of your life. Ontoplano turns that into the days as
they arrive, and records what actually happened: what you did, when, how late,
how it felt. What comes out is the gap between the week you planned and the week
you had, which is the only thing a planner can honestly tell you.

Around that: goals with real progress, a journal, habits, ideas, a shopping
list, and an API that lets other apps push data in and read your schedule out.

Self-hosted, single SQLite file, no account anywhere but your own.

## What is in it

- **Plan** — a week grid. Drag to make a block; alt-drag one occurrence to move
  just that day. Blocks name a category or a specific activity, repeat weekly or
  on an interval, and can be saved as a scheme to put back later.
- **Track** — today, as occurrences of the plan. Mark them done, doing, skipped;
  timing (early, on time, late) is derived from when you finished, never chosen.
- **Board** — the same day as a kanban, plus everything with no date yet. Drag a
  card onto a day and it becomes a real block.
- **Goals** — by horizon, from a day to a year. Link a goal to the tasks that
  count towards it and the progress bar is your execution log, not a number you
  typed.
- **Diary, ideas, habits, shopping** — a journal with free-form tags, quick
  capture, habits logged per day with a heatmap, and inventory-vs-wishlist
  shopping.
- **Dashboard** — the cards you choose, in the order you choose.
- **Plugins** — scoped API tokens, data streams that external apps push into,
  and a schedule endpoint they can read. See `docs/PLUGINS.md`.
- **Phone** — an installable PWA, and an Android app that wraps it
  (`docs/ANDROID.md`).

## Running it

```sh
yarn
cp .env.example .env      # set ORIGIN and BETTER_AUTH_SECRET
yarn db:migrate           # create the database
yarn dev                  # http://localhost:1493
```

Register at `/login`; the first screen asks for your timezone and which day your
week starts, and offers a starter week you can then argue with.

Config and data live outside the repo and are created on first run:

- `~/.config/ontoplano/config.toml` — bind address, port, database path
- `~/.config/ontoplano/env` — `ORIGIN`, `BETTER_AUTH_SECRET`, SMTP, backups
- `~/.local/share/ontoplano/` — the database

Everything a person would want to change — week start, timezone, theme,
dashboard layout — is a per-account setting under `/settings`, not a config
file.

## Keyboard

Every list takes `j`/`k`, every form closes on `Escape`, `n` makes a new one of
whatever the page is about, and `J`/`K` move between pages. Press `?` on any
page for its own shortcuts — that list is generated from the code, so it does
not go stale the way a table in a README does.

The plan grid has a few of its own: `g` toggles grid and list, `[` and `]` move
a week, `Ctrl`+drag duplicates a block, `Ctrl`+scroll (or `+` / `-` / `0`) zooms.

## Deployment

A systemd user service, behind whatever proxy you already run:

```sh
# ~/.config/ontoplano/env
ORIGIN=https://ontoplano.example.com     # must be the public origin, or CSRF rejects forms
BETTER_AUTH_SECRET=…                     # openssl rand -hex 16
```

```sh
make install-service     # build, migrate, install and start the unit
make update              # deploy a new version and restart
```

Three switches worth knowing, all off by default:

- `ONTOPLANO_TRUST_PROXY=true` — rate limiting reads `X-Forwarded-For`. Only
  behind a proxy you control; trusting that header unconditionally lets anyone
  forge their address.
- `ONTOPLANO_HTTPS=true` — adds HSTS. Harmful over plain http, hence opt-in.
- `ONTOPLANO_SELF_HOST=true` — this is one person's instance: the owner may edit
  deployment settings from the UI.

Email is optional. With `SMTP_HOST` and `SMTP_FROM` set, password resets and
address confirmations are sent; without them the message — link included — is
written to the server log, so a single-user install is not forced to run a mail
server. What it never does is claim to have sent something it did not.

### Backups

`docs/BACKUP.md`. Snapshots cover a bad migration and are taken automatically
before every one; Litestream replication to an S3-compatible bucket covers a
dead disk. `scripts/restore-drill.sh` restores into a scratch directory and
checks the result — do that once before you need it.

### Migrations

`yarn db:generate` → read the SQL → `yarn db:migrate`, which snapshots first.
`db:push` refuses a real database on purpose: it rebuilds tables to change them
and has dropped data here before.

## Development

```sh
yarn dev              # dev server on 1493
yarn build            # production build
yarn check            # svelte-check
yarn lint             # prettier + eslint
yarn test:e2e         # Playwright
make db-snapshot      # a consistent copy, before you do something regrettable
```

Data access lives in `src/lib/server/services/`; routes are adapters that read a
form, call a service and map errors. A lint rule stops `$lib/server/db` being
imported under `src/routes/`. Colours live in `src/lib/colors.ts`, form controls
and buttons in `src/routes/layout.css`. `AGENTS.md` has the conventions in full,
and `TODO.md` is what is being built next.

## Stack

SvelteKit · Svelte 5 (runes) · SQLite via Drizzle · better-auth · Tailwind CSS v4
· adapter-node
