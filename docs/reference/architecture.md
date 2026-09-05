<!-- Written by hand in docs/prose/architecture.md — edit that file, then run `yarn docs`.
     The tables below marked "generated" come from the code itself. -->

# Architecture

One SvelteKit application, one SQLite file, and two small clocks beside it —
timers that ask the app to deliver due reminders every minute and to send the
weekly review mail every hour. The clocks own no logic and no data: each is a
POST to the app's own job endpoint, so the app is still the only thing that
thinks. Everything below follows from that shape: there is no queue, no cache
to invalidate and no second service to be out of step with — a companion that
dies means late reminders, never wrong data, and Settings → Instance shows
whether each is running.

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
| A picture                   | a column in the database    | one file you can copy, export and walk away with                        |

## Pictures live in the database

The bytes of an uploaded picture are a `blob` column in `media`, not a file in a
directory beside it. The trade is deliberate: what this app promises is that
your data is one SQLite file you can copy, export and walk away with, and a
media directory makes that two things that have to travel together — a backup
that took one of them and not the other looks exactly like a backup. Under a
megabyte a row SQLite reads a blob faster than the filesystem opens a file, and
the ceiling is the operator's (`[media] max_kilobytes`), so the file cannot
quietly become unmanageable.

Three rules guard what comes in, and all three are in `services/media.ts`:

- **The type is decided by the bytes**, never by the `Content-Type` the sender
  claimed or the extension on the name they chose.
- **SVG is not an image here.** It is a document that can carry script, and it
  would be served from this app's own origin. There is no setting for it.
- **The ceilings are the operator's** — per picture, per recipe, per entry and
  per account — and they are enforced in the service, so the API has them too.

Serving is `/media/<id>`, scoped by owner in the `WHERE`, with `nosniff` and an
immutable cache. Inside somebody's writing a picture is markdown pointing at
that address, and the renderer refuses any other address: an external one would
tell a third party who is reading, and when.

## What is deliberately absent

- **No ORM cleverness.** Drizzle is used as typed SQL. A query you cannot read
  is a query nobody will dare change.
- **No background workers.** Anything periodic is a systemd timer on the box
  calling an endpoint or a script — visible in `systemctl`, not hidden inside
  the process.
- **No client-side store.** The page's data comes from its `load`; a write
  invalidates and it comes again. There is no second copy of the truth in the
  browser to go stale.
