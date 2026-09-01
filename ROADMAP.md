# Roadmap

What ontoplano does not do yet, and intends to. `CHANGELOG.md` is what it
already does; this is the other end of the same list.

Nothing here is scheduled. These are the pieces deliberately left out of the
first public release so that it could be a first public release, written down
so that somebody who wants to build one does not have to guess at the shape it
should take. Each heading is roughly one contribution.

If you want to take one on, open an issue saying so before you write much — the
constraints below are the parts that are decided, and the rest is genuinely
open.

---

## Images on notes

Today a note is text. It should be possible to drag an image into one and have
it appear where it was dropped, the way it works when you drag a picture into a
GitHub comment: the file uploads, and the editor is left holding a reference to
it.

- **Images first.** Audio comes later, and video probably never — a planner is
  not a media library. The upload path should not assume "image", but the first
  version only accepts them.
- **Where they can go.** Notebooks are the reason for this. Diary entries and
  ideas write to the same table, so they get it at the same time rather than
  being carved out.
- **Storage is the instance's problem, not the schema's.** Files on disk under
  the instance's data directory, with a row carrying the owner, the mime type
  and the size. Not blobs in SQLite.
- **Ownership is in the URL's answer, not in the URL.** Serving a file checks
  that the account asking owns it, exactly as every other row in this app is
  read. A guessable path that serves anybody's picture is the failure mode this
  bullet exists to prevent, and the ownership suite gets a case for it.
- **Ceilings belong to the plan, not to the upload form.** `src/lib/plans.ts`
  gains the keys and `assertWithinLimit` enforces them, so the API has the same
  ceiling the form does. Self-hosted is unlimited, like everything else. On the
  hosted instance: 1 MB per image, 100 MB per account.
- **Deleting the note deletes the file.** Including through account deletion and
  the export, which means `services/account.ts` learns about it.

## Audio on notes

The same path, once images have proved it: a recording attached to an entry, for
the note you would rather speak than type. Bigger files, so the ceilings are
different and probably paid-tier only on the hosted instance.

## A business section

For somebody running something small on their own — a shop, a practice, freelance
work — kept in the same place as the rest of their life rather than in a second
app. The units:

- **Products or services.** A name, a price, a cost, and whether it is still
  offered.
- **Revenue.** What was sold, when, how much of it, and to whom — a customer is
  a `people` row, which already exists.
- **Costs.** One-off and recurring, categorised, so a month can be totalled.
- **The month, answered.** Revenue minus costs, by month and by product, which is
  the only question this section exists to answer. Not accounting software: no
  ledgers, no tax, no invoicing.

Two things it must not do: become a second todo list, and become a second
categories system. It reuses `categories` and it links to `goals` like everything
else here.

## Trips

A trip is a date range with a place, and things hanging off it: what to pack,
what it cost, what happened. Most of that already exists as other units — todos,
costs, diary entries — so the work is mostly the linking and the one page that
shows a trip whole.

## Plugins, less experimental

The plugin platform (`docs/PLUGINS.md`) is real and used, but a token scoped to
an instance is still a lot of trust to hand a script somebody found. Three
pieces, roughly in this order:

- **Permissions per thing, not per instance.** A token says which entities it
  may read and which it may write — todos read-only, one data stream write-only
  — rather than carrying the whole account. The vocabulary is in
  `services/tokens.ts`; what is missing is the granularity and the UI that makes
  a narrow token as easy to make as a wide one.
- **A log of what a token did.** Every call, with the endpoint and the outcome,
  on the page that lists the tokens — so revoking one is a decision somebody can
  make from evidence rather than from a name they wrote six months ago.
- **The rest of the app, over the API.** `/api/v1` covers `me`, the schedule and
  the data streams, and nothing else. People, notebooks and diary entries,
  ideas, recipes and meals, habits, shopping, goals — each is a service already,
  so each is a thin adapter and an ownership test away. Do them as a set with
  one shape rather than one at a time, or the tenth will not look like the
  first.

## Another language

Every string in the app is written into its page in English. Making that
translatable is a large, mechanical, genuinely useful contribution, and it is
the one on this list most likely to be done by somebody who is not me.

- Strings come out of the markup into a catalogue, keyed and typed, and the
  build fails on a key that no longer exists.
- The locale is a per-account setting (`user_settings`), with the browser's as
  the first guess and the instance's as the fallback.
- Dates, times and numbers go through `Intl` with that locale — several places
  already hardcode `en-US`, and those are the first ones to find.
- Portuguese first, because I can check it.

Not in scope: right-to-left layout, and translating the documentation. Both are
worth doing and neither is the same job.
