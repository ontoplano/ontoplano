<!--
  Thank you — genuinely. A few things below, and none of them are ceremony:
  each one is something that has gone wrong here before.

  There is no CLA. You keep the copyright in what you write; it goes in under
  the AGPLv3 and that is the whole agreement. See CONTRIBUTING.md.
-->

## What this changes

<!-- One or two sentences, for somebody reading the log in a year. -->

Closes #

## Why

<!--
  The situation it fixes, not the diff. If it is a bug, what somebody saw.
-->

## Checks

- [ ] `yarn lint` passes (prettier, eslint, and the changelog check).
- [ ] `yarn test:unit` passes.
- [ ] `yarn test:e2e` passes, or you have said which case does not and why.
- [ ] `CHANGELOG.md` has a line, under a version that moved in this same commit
      — there is no "Unreleased" section, deliberately.
- [ ] `yarn docs` was run if you touched the schema, the API, the routes or the
      keyboard; the wiki is generated and `yarn lint` fails when it is stale.

## The four invariants

`CONTRIBUTING.md` has these in full. Tick the ones your change touches:

- [ ] **Ownership is in the `WHERE`.** Every query that reads or writes user
      data filters by the account inside the statement — never fetch-then-check.
- [ ] **Routes do not query the database.** `+page.server.ts` calls a service;
      there is a lint rule.
- [ ] **A new table is in `services/account.ts`,** or export and deletion
      silently miss it.
- [ ] **A new entity has a case in `e2e/idor.e2e.ts`,** which is the suite that
      proves one account cannot reach another's rows.

## Screenshots

<!--
  For anything visible: before and after, at a phone width and a desktop one.
  Most of what is wrong with a UI change is only wrong at one of the two.
-->
