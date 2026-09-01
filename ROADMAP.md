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
an instance is still a lot of trust to hand a script somebody found. Narrower
scopes, a visible log of what a token actually did, and a way to revoke one from
the page that shows the log.
