<!-- title: Architecture -->
<!-- blurb: how a request travels, and where each kind of rule is allowed to live -->

# Architecture

One SvelteKit application, one SQLite file, no other running parts. Everything
below follows from that: there is no queue, no cache to invalidate and no
second service to be out of step with.

## Where a request goes

```
browser ─▶ hooks.server.ts ─▶ route (+page.server.ts / +server.ts) ─▶ service ─▶ SQLite
```

**`hooks.server.ts`** holds the rules that must not be forgotten by a route
written next year: the registration mode, the rate limits, the session, the
account holds, and the guard that walks a signed-out write to the login page.
They are in one file for the reason they exist — a rule each route has to
remember is a rule that will be missed by one of them.

**Routes are adapters.** A `+page.server.ts` reads the form, calls one service
function and turns what it throws into a `fail()`; a `+server.ts` under
`/api` does the same and answers JSON. They hold no business rules and no SQL,
which is what lets the page and the API agree — they call the same function.

**Services own the database.** Everything under
`src/lib/server/services/` is where the rules live: what is valid, what a
category may be renamed to, what happens to occurrences when a block is
deleted. Nothing else runs a query.

Every service function takes a `Ctx` — the account, the current time and the
timezone — as its first argument. That is not ceremony. It is what makes
"which day is today" answerable for somebody in São Paulo while the server is
in Frankfurt, and it is what makes the whole layer testable without a browser.

## Two doors, one rule

The app has two write surfaces: form actions, and the HTTP API. They are
deliberately not two implementations. An action and an endpoint that do the
same thing call the same service function, so a rule cannot be enforced on one
and forgotten on the other — see [Pages and actions](pages.md) and
[the API](api.md), which are two views of the same layer underneath.

## Where each kind of truth lives

| Kind                        | Where                       | Why there                                                               |
| --------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| What is valid               | the service                 | both doors ask the same function                                        |
| What must never be skipped  | `hooks.server.ts`           | a rule to be remembered is a rule to be missed                          |
| The shape of the data       | `drizzle/` migrations       | the snapshot is what the [data model](data-model.md) page is built from |
| What an instance allows     | `config.toml`               | it is the operator's decision, not the code's                           |
| What an account prefers     | `user_settings`             | it is theirs, and it travels in the export                              |
| Why a line is the way it is | the comment above that line | it moves with the code, so it stays true                                |

## What is deliberately absent

- **No ORM cleverness.** Drizzle is used as typed SQL. A query you cannot read
  is a query nobody will dare change.
- **No background workers.** Anything periodic is a systemd timer on the box
  calling an endpoint or a script — visible in `systemctl`, not hidden inside
  the process.
- **No client-side store.** The page's data comes from its `load`; a write
  invalidates and it comes again. There is no second copy of the truth in the
  browser to go stale.
