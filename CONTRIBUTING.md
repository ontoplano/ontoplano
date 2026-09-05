# Contributing

Match what is around you — naming, layout, comment density. What follows is
only what you cannot get from reading the code.

## No CLA

Nothing to sign. You keep the copyright in what you write and it goes in under
the AGPLv3. That also means nobody, me included, can relicense this later
without asking everyone who wrote a line of it.

## What a feature has to arrive with

All four, or it is not finished:

- **Tests.** A service test with a real database and an ownership case, and an
  e2e case for anything a person clicks. A test for a bug must fail against the
  old code — reintroduce the bug and watch it go red before you believe it.
- **Docs.** `yarn docs` regenerates them from the source; `make lint` fails when
  they are stale. Anything a person has to be told rather than shown gets a
  paragraph in the handwritten part.
- **A tutorial step,** if the thing is not obvious the first time somebody meets
  it. The in-app tours live in `src/lib/tutorials.ts`, one per room.
- **A view that works on a phone and on a desktop.** Look at both in a real
  browser, at 390px and wide. Most of what is wrong with a UI change is wrong at
  exactly one of the two.

And seed data: `scripts/seed-dev.mjs` fills an account with a realistic week of
synthetic everything, and every feature adds its own, so a fresh database has a
little of each thing in it. Never develop against real data.

## Run it

```sh
yarn install
make dev            # http://localhost:1493, as a systemd user service (yarn dev elsewhere)
make lint           # prettier + eslint, and that the generated docs are current
make test           # the Playwright e2e suite; yarn test:unit for the unit half
```

SQLite at `~/.local/share/ontoplano/ontoplano.db`, config at
`~/.config/ontoplano/config.toml`. Neither needs to exist first.

## The invariants

A reviewer or a lint rule will stop you on these.

- **Ownership lives in the `WHERE`.** Every query touching user data filters by
  the account inside the statement. Fetch-then-check is the shape that becomes
  an IDOR the day somebody forgets the second half.
- **Routes do not query the database.** `+page.server.ts` calls a service in
  `src/lib/server/services/`. There is a lint rule, so the rule above has one
  place to be true.
- **"Not yours" answers exactly like "does not exist"** — same status, same
  message, same timing. `e2e/idor.e2e.ts` has a case per entity.
- **Strings are bounded at the service.** A field with no ceiling is a way to
  fill the disk with one request.
- **A new table goes in `services/account.ts`,** or export and account deletion
  silently miss it.

## Migrations

`yarn db:generate` writes the SQL and **then you edit it by hand** — Drizzle has
produced a wrong migration here three times, usually a table rebuild that drops
a foreign key. `yarn db:push` is local only; `yarn db:migrate` snapshots first
and is what ships.

## Two things that look like decoration

`resolutions` in `package.json`: Yarn 1 will not install vitest beside SvelteKit
without it, and removing it breaks the production image rather than your
machine.

`ORIGIN` in a deployment: the only CSRF defence here. If it does not match the
address bar exactly — scheme, host, no trailing slash — every form post is
rejected and nothing in the log says why.

## Design

Colour belongs to the user's categories and to the sections; chrome stays quiet.
Colour is never the only carrier of meaning — anything coloured is also
labelled, and red/green is never the distinction. Destructive actions do not put
their confirmation under the cursor, and no bare keystroke deletes anything.

Anything opinionated ships **off by default** and switchable. This is meant to
be run by other people, on their own machines, with every feature.

## Opening something

Issues and pull requests have templates in `.github/`. A security problem is the
one thing that does not go in an issue: use a
[private advisory](https://github.com/ontoplano/ontoplano/security/advisories/new).

`ROADMAP.md` is what is intended and not built. Say which one you are taking in
an issue before you write much of it.
