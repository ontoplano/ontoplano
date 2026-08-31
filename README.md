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
- **People** — mention someone in an entry and every mention collects on their
  page; a tag cannot do that, because a tag has no identity beyond its spelling.
- **Notebooks** — a subject you write against with no deadline: a book, a trip,
  a renovation. Entries, tasks and goals can belong to one, and deleting it
  leaves every one of them where it is.
- **Dashboard** — the cards you choose, in the order you choose.
- **Administration** — `/admin` for whoever runs the instance: find an account,
  see its plan and its history, resend a confirmation, hand out the admin role.
  Signing in as somebody to help them puts an amber banner over every page and a
  line in _their_ history.
- **Plans** — free and Pro, with ceilings on the things that pile up rather than
  on use. A self-hosted instance has no plans, no ceilings and no billing at
  all. See `docs/BILLING.md`.
- **Plugins** — scoped API tokens, data streams that external apps push into,
  webhooks they can subscribe, and schedule and shopping endpoints they can
  read and write. See `docs/PLUGINS.md`.
- **Share a list with your partner** — `examples/onto-household.mjs` keeps two
  accounts' shopping lists equal over webhooks: add milk on one phone, it is
  on both; tick it in the aisle, it is bought on both. Works across two
  separate instances.
- **Phone** — an installable PWA, and an Android app that wraps it
  (`docs/ANDROID.md`).
- **Telegram** — a bot for the plan, the list and quick capture, on a
  self-hosted box only (`docs/TELEGRAM.md`).

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

- `~/.config/ontoplano/config.toml` — bind address, port, database path, who may
  register, and whether an account may change its own address
- `~/.config/ontoplano/env` — `ORIGIN`, `BETTER_AUTH_SECRET`, SMTP, backups
- `~/.local/share/ontoplano/` — the database

Everything a person would want to change — week start, timezone, theme,
dashboard layout — is a per-account setting under `/settings`, not a config
file.

**Registration is closed by default.** The first account is always allowed —
it is the one that owns the instance — and after that, `/settings/instance`
decides whether anybody else can make one: closed, by invitation, or open. An
invitation is a code that works once, and the page makes and revokes them.

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
- `ONTOPLANO_SELF_HOST=true` — this is one person's instance. The owner may edit
  deployment settings from the UI, and the Telegram bot will run; both act for the
  whole instance, so both are off anywhere else.

Signing in with Google or GitHub is optional too, and off unless the
credentials are there:

```sh
GOOGLE_CLIENT_ID=… ; GOOGLE_CLIENT_SECRET=…
GITHUB_CLIENT_ID=… ; GITHUB_CLIENT_SECRET=…
```

Set the callback to `https://your-host/api/auth/callback/<provider>`. Only
providers with both halves configured appear on the sign-in page, because a
button that comes back with "invalid client" is worse than no button. Apple and
X are deliberately not here: Apple needs a paid developer account and a client
secret that must be re-signed twice a year, and X's OAuth sits behind their paid
API tiers.

Email is optional. With `SMTP_HOST` and `SMTP_FROM` set, password resets and
address confirmations are sent; without them the message — link included — is
written to the server log, so a single-user install is not forced to run a mail
server. What it never does is claim to have sent something it did not.

Putting it on a public box means four things and no more: run it as a service
that survives logout (`make install-service`), keep it on `127.0.0.1` behind a
reverse proxy that terminates TLS, set `ORIGIN` to exactly what the address bar
will say — it is the only CSRF defence here, and a wrong one rejects every form
post with nothing in the log to explain it — and point something off the box at
`/healthz`, which touches the database before answering.

`/healthz` will also report disk, memory, load and database size to a request
carrying `ONTOPLANO_HEALTH_TOKEN`, and nothing to anyone else. Storage is the
one that creeps up on a small machine: SQLite only grows, and a snapshot copies
the whole file beside itself.

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
yarn lint             # prettier + eslint, and checks the wiki is current
yarn test:e2e         # Playwright
yarn docs             # rebuild docs/wiki from the code
make db-snapshot      # a consistent copy, before you do something regrettable
```

Data access lives in `src/lib/server/services/`; routes are adapters that read a
form, call a service and map errors. A lint rule stops `$lib/server/db` being
imported under `src/routes/`. Colours live in `src/lib/colors.ts`, form controls
and buttons in `src/routes/layout.css`. `CONTRIBUTING.md` has the conventions
that are not obvious from the code, and the reasons for them.

**[`docs/wiki/`](docs/wiki/) is how the app works, generated from the app.**
Every table and column, every endpoint with the scope it demands, the service
layer module by module, and every keyboard shortcut — built by
`scripts/build-docs.mjs` from the migration snapshot, the route files, the
scope table and the shortcut map. `make lint` fails if what is committed is out
of date, so it cannot quietly stop being true. Do not edit those pages; change
the code and run `yarn docs`.

## Stack

SvelteKit · Svelte 5 (runes) · SQLite via Drizzle · better-auth · Tailwind CSS v4
· adapter-node

## Licence

[AGPL-3.0-or-later](LICENSE). Run it, change it, host it — if you host a
modified version for other people, they get the source too.

The licence covers the code. It does not hand over the project's name: call
your fork something of your own, and say plainly what it is built on.
