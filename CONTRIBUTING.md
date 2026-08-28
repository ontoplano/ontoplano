# Contributing

The rules that are not obvious from reading the code, and the reasons for them.
Everything else — naming, layout, comment density — is "match what is around
you".

## Run it

```sh
yarn install
yarn dev            # http://localhost:1493
yarn test           # vitest, then playwright
yarn lint
```

SQLite lives at `~/.local/share/ontoplano/ontoplano.db`, config at
`~/.config/ontoplano/config.toml`. Neither needs to exist first.

Never develop against real data. `scripts/seed-dev.mjs <db> <email>` fills an
account with a realistic week of synthetic everything, and every new feature is
expected to seed some, so a fresh database has a little of each thing in it.

## The four invariants

These are the ones a lint rule or a reviewer will stop you on.

**I1 — ownership lives in the `WHERE`.** Every query that touches user data
filters by the account inside the statement. Not "fetch, then check": that is
the shape that becomes an IDOR the day somebody forgets the second half.

**I2 — routes do not query the database.** `+page.server.ts` calls a service in
`src/lib/server/services/`. There is a lint rule; it exists so that I1 has
exactly one place to be true.

**I3 — "not yours" answers exactly like "does not exist".** A different status,
a different message, or a different timing is an oracle for what exists. The
e2e suite has one case per entity for this.

**I8 — strings are bounded at the service.** A field with no ceiling is a way to
fill the disk with one request.

## Migrations

`yarn db:generate` writes the SQL, and then **you edit it by hand**. Drizzle has
produced a wrong migration here three times — usually a table rebuild that drops
a foreign key. `yarn db:push` is for local iteration only and refuses to touch a
production database; `yarn db:migrate` snapshots first and is what ships.

## Testing

Three layers, and a change is not finished until all three are green.

**Unit and service** — vitest, in `tests/` and beside the code as `*.test.ts`.
Services get a real database: the schema is pushed into a throwaway SQLite file
and `DATABASE_URL` is set _before_ the service is imported, because the
connection is made at import time. Every service taking an account id gets an
ownership test.

**Routes and behaviour** — Playwright, in `e2e/`. `smoke.e2e.ts` walks every
route at desktop and at 390px and asserts the page returns, logs nothing, says
nothing alarming, and does not scroll sideways. It is the cheapest test here and
it has caught things people would otherwise report as bugs.

**Appearance** — `e2e/appearance.e2e.ts`. Four combinations ship (light and
dark, sober and playful) and a rule written for one can be invisible in another.
Read colours through `e2e/helpers/colour.ts`, **never by parsing a computed
style by hand**: Tailwind emits `oklch()`, `color(srgb …)` and `rgb()` for the
same palette, translucent tints have to be composited onto what is behind them,
and a parser that gets any of that wrong invents failures until somebody deletes
the test. The helper asks a canvas, which is the browser's own parser.

Two standing rules:

- **A test for a bug is not finished until you reintroduce the bug and watch it
  fail.** Two tests here passed against the broken code before they were
  rewritten.
- **Anything that changes how a page looks gets looked at**, in a real browser,
  at a phone width and a wide one. Assertions do not see a card whose text has
  been squeezed into a vertical ribbon.

## Two things that look like decoration and are not

The `resolutions` field in `package.json`: Yarn 1 refuses to install vitest
beside SvelteKit without it, so removing it breaks the production image and not
your machine.

`ORIGIN` in a deployment: it is the only CSRF defence here. If it does not match
the address bar exactly — scheme, host, no trailing slash — every form post is
rejected, and nothing in the log says why.

## Design

Colour belongs to the user's own categories and to the six sections; chrome
stays quiet. Colour is never the only carrier of meaning — anything coloured is
also labelled. Destructive actions do not put their confirmation under the
cursor, and no bare keystroke deletes anything.

Anything personal or opinionated ships **off by default** and switchable, and
nothing a person would reasonably want to change is hardcoded. This is meant to
be run by other people, on their own machines, with every feature.
