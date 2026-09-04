## What this changes

<!-- One or two sentences. What somebody can do now that they could not. -->

Closes #

## Checks

- [ ] `yarn lint` and `yarn test` pass.
- [ ] `CHANGELOG.md` has a line, under a version that moves in this same PR.
- [ ] `yarn docs` was run if the schema, the API, the routes or the keyboard
      changed. (CI regenerates them and fails on any difference, so this is
      about saving yourself the round trip.)

## A feature should arrive with other things

Tick what applies; say why for anything you left out.

- [ ] **Tests** — a service test with an ownership case, an e2e case for
      anything clickable. A test for a bug fails against the old code.
- [ ] **Docs** — generated, plus a paragraph for anything that has to be told
      rather than shown.
- [ ] **A tutorial step** in `src/lib/tutorials.ts`, if it is not obvious on
      first meeting.
- [ ] **Both widths** — looked at in a real browser at 390px and wide.
- [ ] **Seed data** in `scripts/seed-dev.mjs`.
- [ ] **A new table** is in `services/account.ts` and has a case in
      `e2e/idor.e2e.ts`.

## Screenshots

<!-- Anything visible: before and after, phone width and desktop. -->
