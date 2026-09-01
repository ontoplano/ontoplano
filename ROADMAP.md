# Roadmap

What Ontoplano does not do yet. `CHANGELOG.md` is what it already does.

Three lists: things that are decided and not built, things that are small, and
things that may never happen. Nothing here is scheduled.

Want to take one on? Open an issue saying so first — the constraints under each
are the parts that are already decided, and the rest is open.

---

## In scope

### Images on notes

Drag an image into a note and have it appear there, the way it works in a
GitHub comment.

- Images only at first. Notebooks, diary entries and ideas together — they are
  one table.
- Files on disk under the instance's data directory, with a row carrying the
  owner, mime type and size. Not blobs in SQLite.
- Serving one checks ownership, like every other read. A case in
  `e2e/idor.e2e.ts`.
- Ceilings in `src/lib/plans.ts`, enforced with `assertWithinLimit`, so the API
  has them too. Self-hosted unlimited; hosted 1 MB an image, 100 MB an account.
- Deleting the note deletes the file, and `services/account.ts` learns about it.

### A business section

For someone running something small on their own, in the same place as the rest
of their life.

- Products or services: name, price, cost, still offered.
- Revenue: what sold, when, how much, to whom — a customer is a `people` row.
- Costs: one-off and recurring, categorised.
- One page answering "how was this month", by month and by product.

Not accounting software: no ledgers, no tax, no invoicing. Reuses `categories`
and links to `goals` like everything else.

### Trips

A date range with a place, and things hanging off it: what to pack, what it
cost, what happened. Most of those units exist; the work is the linking and the
one page that shows a trip whole.

### Plugin permissions

A token carries the whole account today. It should not.

- Scopes per entity and per direction — todos read-only, one stream
  write-only.
- A log of what each token actually did, on the page that lists them.
- `/api/v1` covers `me`, the schedule and streams. The rest — people,
  notebooks, diary, ideas, recipes, meals, habits, shopping, goals — is a thin
  adapter and an ownership test each. Do them as one set, or the tenth will not
  look like the first.

### Another language

Every string is written into its page in English.

- Strings into a keyed catalogue; the build fails on a key that is gone.
- Locale per account in `user_settings`, browser first, instance as fallback.
- Dates and numbers through `Intl` — several places hardcode `en-US`.
- Portuguese first.

Not in scope: right-to-left layout, translating the docs.

### Sharing, narrowly

A family plan shares a bill and nothing else. The first thing worth actually
sharing is a **shopping category** — one household, one list of what is out of
milk. Per category, opt-in, and never a default.

Everything else stays private. "Share your diary with your family" is not a
feature this is heading towards.

---

## Small improvements

- **Audio on notes.** The same upload path as images, once that exists.
- **Recipe import from a URL.** schema.org JSON-LD covers most food blogs.
- **An `.ics` importer**, to sit beside the Todoist and Google Tasks ones.
- **Reorder the capture wheel.** The rooms wheel is arrangeable; the four
  capture kinds are not.
- **Per-account week templates beyond schemes** — a scheme you can schedule
  rather than apply by hand.

---

## One day, maybe

- **An Obsidian plugin** for notebooks.
- **An interface for an AI** — say "put this in my week" and have it arranged.
  Nothing of the sort goes inside the app; this is an API question.
- **Video on notes.** Probably never: a planner is not a media library.

---

## Decided against

So they stop coming back: budget tracking (huge, crowded, barely touches the
week), reading lists (a different app), an in-process plugin system (data
streams already cover it), AI features inside the app.
