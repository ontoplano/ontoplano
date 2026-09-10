# Contributing

Thanks for contributing! As of now, Ontoplano is one person's project, so every issue,
fix and pull request genuinely moves it.

## Ways to contribute

- **Report a bug** — with the steps that reproduce it. Only report what you
  hit yourself.
- **Fix a bug** — link the issue it closes.
- **Build a feature** — open an issue first so we agree on the shape before
  you write much. `ROADMAP.md` lists what is already intended.
- **Improve the docs** — the handwritten half lives in `docs/prose/`; the
  rest is generated and edited through the code.
- **Package it** — there is no Windows installer yet.

No CLA. You keep the copyright to what you write; it goes in under AGPL-3.0.

## Development setup

Linux with systemd, Node 22 and yarn:

```sh
yarn install
make dev            # http://localhost:1493 (yarn dev elsewhere)
make db-seed        # synthetic data for the dev account
```

SQLite at `~/.local/share/ontoplano/ontoplano.db`, config at
`~/.config/ontoplano/config.toml` — both created on first run. Never develop
against real data.

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
3. Conventional commits: `feat: …`, `fix: …`, `docs: …` — short and literal.
4. Open the PR against `master`.

### A feature carries all of this

- **MCP tools** for it, in `src/lib/server/mcp/tools.ts`, with a scope in
  `services/tokens.ts` — whatever the app lets a person do, an assistant can
  do too, unless it is security or the deletion of something precious. Every
  verb ships with its way back (`archive` is its own inverse; `pay`/`unpay`).
  The assistant preset picks new scopes up on its own; it reads the tools.
- **Create, edit AND delete in the UI.** Not create alone. Delete is
  confirmed in its own dialog — don't allow accidental double clicks to
  go throught the confirmation. Anything carrying history archives instead,
  with the hard delete reachable only from the archived list.
- **A dashboard card**, off by default when the feature is an opinionated one.
- **Unit tests, and an e2e that drives the whole thing in a browser at phone
  width as well as desktop.** Look at it in the mobile and desktop. Text
  wrapping into six-character lines is not good for production.
- **Dev seed data**, so the dev account has a little of everything.
- **The data export**, if the feature owns an account-scoped table — there is
  a test that fails when a table is missing from it.

### Bug fixes

Try and also write **the test that would have caught it**, failing on the old
code.

A security problem is the one thing that does not go in an issue: use a
[private advisory](https://github.com/ontoplano/ontoplano/security/advisories/new).

## Code style

Match what is around you — naming, layout, comment density. The rules a
reviewer or a lint rule will stop you on:

- **Ownership lives in the `WHERE`.** Every query touching user data filters
  by the account inside the statement.
- **Routes do not query the database.** `+page.server.ts` calls a service in
  `src/lib/server/services/`; a lint rule enforces it.
- **"Not yours" answers exactly like "does not exist"** — same status, same
  message. `e2e/idor.e2e.ts` has a case per entity.
- **Strings are bounded at the service**, and a new table goes into
  `services/account.ts` or export and deletion silently miss it.
- **Migrations are read before they run**: `yarn db:generate`, then edit the
  SQL by hand — Drizzle has produced wrong migrations here before.
- **Use blue for 'yes' and red for 'no'**, I am red/green colorblind,
  so the convention here is to use blue, instead of green, to indicate success.
- **A feature works everywhere its thing lives.** If you add renaming to
  shopping sections, it belongs on the page, in the API and as an MCP tool —
  not on the page alone. Two exceptions: anything to do with security, and
  deleting personal data (people, habits, goals). Those stay in the app,
  where the person does them by hand.
