# Contributing

Thanks for contributing! As of now, Ontoplano is one person's project, so every issue,
fix and pull request genuinely helps it.

## Ways to contribute

- **Report a bug** — with the steps that reproduce it.
- **Fix a bug** — link the issue it closes.
- **Build a feature** — open an issue first so we agree on the shape before.
  you write much. `ROADMAP.md` lists what is already intended.
- **Improve the docs** — the handwritten half lives in `docs/prose/`; the
  rest is generated from the code.
- **Package it** — there is no Windows installer yet.

No CLA. You keep the copyright to what you write; it goes in under AGPL-3.0.

## Development setup

Linux with systemd, Node 22 and yarn:

```sh
yarn install
make dev            # http://localhost:1493 (yarn dev elsewhere)
make db-seed        # synthetic data for the dev account
```

SQLite DB is at `~/.local/share/ontoplano/ontoplano.db`, config at
`~/.config/ontoplano/config.toml` — both created on first run.

There are a lot of make targets. Bare `make` lists them; `make vars` says which
switches each one takes, `make vars ONLY=package` for one.

### Tests and lint

```sh
make lint           # prettier + eslint, and that the generated docs are current
yarn test:unit      # vitest
make test           # the Playwright e2e suite
```

## Submitting changes

1. Fork, branch, make the change.
2. Run the lint and the tests.
3. If the change is user-visible, bump the patch in `package.json` and add a
   line under that version in `CHANGELOG.md`, in the same commit — `make lint`
   checks both.
4. Conventional commits: `feat: …`, `fix: …`, `docs: …` — short and literal.
5. Open the PR against `master`.

### A feature carries all of this

- **The whole verb set, in the UI.** Create, edit — every field the create
  form offered — and delete, confirmed in its own dialog. The confirm button
  is armed (`use:armed`) so a reflex double-click cannot fall through it.
  Anything carrying history archives instead, with the hard delete reachable
  only from the archived list.
- **MCP tools**, in `src/lib/server/mcp/tools.ts`, with a scope in
  `src/lib/server/services/tokens.ts` — whatever the app lets a person do, an
  assistant can do too. Every verb ships with its way back (`archive` is its
  own inverse; `pay`/`unpay`); deletion has its own machinery, below.
- **A dashboard card**, basically showcasing it
- **Unit and e2e tests** considering the whole thing in a browser at phone
  width and at desktop.
- **Dev seed data**, so the dev account has a little of everything.
- **A line in `src/lib/server/services/account.ts`** for any new
  account-scoped table, or export and account deletion silently miss it — a
  test fails when one is absent.
- **Docs and tutorial.** Docs are generated from the code wherever possible,
  so a change propagates instead of dating them. A new route gets a short
  tour in `src/lib/tutorials.ts`; the build fails on a screen without one.

### How an assistant deletes things

Assistants can delete over MCP; the account owner can undo it. Three parts:

- A deleting tool declares `destroys: true`, and calling it takes the
  `destructive` grant on top of the room's write scope — so a client that
  warns before destructive calls warns about the right ones.
- Every write reads its row first (the tool's `subject`), so the answer
  carries `before` and `after` — on a delete, `before` is the whole row.
- That same `before` is written to the account's assistant log
  (`src/lib/server/services/assistant-log.ts`), shown under
  Settings → Integrations. A deleting call there carries **Put it back**,
  which recreates the row through the same service create the app uses —
  same validation, same ownership, same ceilings, new id.

So a new deleting tool sets `destroys`, returns the whole row from `subject`,
and adds its case to `recreate()` in `assistant-log.ts` — a deleting tool that
function does not know is a bug.

What never gets a deleting tool: security (tokens, sessions, credentials) and
a person's writing or history — a notebook with anything in it is refused,
workouts and bills archive instead. Those are deleted by the person, in the
app.

### Bug fixes

Also write **the test that would have caught it**, failing on the old code.

A security problem is the one thing that does not go in an issue: use a
[private advisory](https://github.com/ontoplano/ontoplano/security/advisories/new).

## Code style

Match what is around you — naming, layout, comment density. The rules a
reviewer or a lint rule will stop you on:

- **Ownership lives in the `WHERE`.** Every query touching user data filters
  by the account inside the statement.
- **Routes do not query the database.** `+page.server.ts` calls a service in
  `src/lib/services/` (`src/lib/server/services/` for the server-only
  modules); a lint rule enforces it.
- **"Not yours" answers exactly like "does not exist"** — same status, same
  message. `e2e/idor.e2e.ts` has a case per entity.
- **Services take `ctx`, never `new Date()`.** `ctx.now` keeps the logic
  testable. Instants are UTC ISO-8601 with a `Z`, written by `stamps(ctx)`
  from `services/time.ts`; wall-clock values ("gym at 18:00") stay naive.
- **Strings are bounded at the service.**
- **A migration is never edited after it is generated.** `yarn db:generate`,
  then read the SQL — Drizzle has produced wrong migrations here before —
  and whatever it missed goes in a migration of its own. An applied migration
  is identified by its file hash, so editing one strands every database that
  already ran it. A test fails on any edit.
- **A route runs on both instances.** The isolated build compiles
  `+page.server.ts` into a worker, so it may not import `$lib/server/*` or
  anything from Node — what only a served instance has goes through the host
  seam, `$lib/services/host.ts`.
- **Blue is yes, red is no.** I am red/green colorblind.
- **Propagate feature changes throughout all interfaces** E.g. a behavior change
  on a route should work well on mobile, desktop, API, MCP server, docs, tutorial...
- **No hardcoded strings or numbers.** Anything someone could want to change
  gets a named constant, at the narrowest scope that covers its readers.
