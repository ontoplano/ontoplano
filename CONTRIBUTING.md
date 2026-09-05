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

### Tests and lint

```sh
make lint           # prettier + eslint, and that the generated docs are current
yarn test:unit      # vitest
make test           # the Playwright e2e suite
```

## Submitting changes

1. Fork, branch, make the change.
2. A feature arrives whole: tests (a bug fix includes the test that would
   have caught it, failing on the old code), docs (`yarn docs` regenerates),
   seed data in `scripts/seed-dev.mjs`, and a look at the UI in a real
   browser at 390px and wide.
3. Run the lint and the tests.
4. Conventional commits: `feat: …`, `fix: …`, `docs: …` — short and literal.
5. Open the PR against `master`. Templates are in `.github/`.

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
