<!-- title: The plan -->
<!-- blurb: the three tables a task can live in, and how one becomes another -->

# The plan

A task in ontoplano is stored in one of three tables, and which one depends on a
single question: **does it happen again?**

|                   | Repeats | Has a date  | Has a time |
| ----------------- | ------- | ----------- | ---------- |
| a recurring block | yes     | no — a rule | yes        |
| a one-off block   | no      | yes         | yes        |
| a todo            | no      | maybe       | no         |

Everything else on this page follows from that table. A fourth thing, the
**occurrence**, is not a task at all: it is the record of one day of one.

## A recurring block

`weekly_slots`, which is a bad name for it — it holds every repeat, not only
weekly ones. Its `recurrence` column says which:

- `weekly` — every week on that weekday
- `weeks:2` — every other week, counted from an anchor date
- `days:10` — every ten days
- `monthly:15` — the 15th of each month

**Tuesday at 09:00, for an hour, every week** is the common case, and it is a
shape of the week rather than an event: a weekday, a time, and no date at all.

Editing one changes every week — past weeks included, because there is no copy
of it in any of them. That is the point of it, and it is also the trap: "move
the gym to Thursday" is a different act from "I went on Thursday this week", and
the second must never be done by editing the block.

## A one-off block

`exceptional_slots`. **The 4th of September at 09:00, once.** The same fields as
a recurring block, with a date instead of a weekday and a rule. Nothing about
next week follows from it.

This is what a todo becomes when it is given a time, and what a weekly block
becomes for one day when you drag that day's occurrence somewhere else while
holding <kbd>Alt</kbd> — the occurrence detaches into a one-off and the weekly
block goes on repeating, untouched.

## An occurrence

`task_instances`. **What actually happened on one day.** It is the row that
carries a status (`todo`, `doing`, `done`, `skipped`), when it was done, notes,
and whether it was early or late.

An occurrence points at _either_ a weekly block or a one-off block, never both.
For weekly blocks they are generated ahead — one per week per block — which is
what makes it possible to tick off Tuesday's gym without saying anything about
next Tuesday's. Everything the tracker, the history page and the goals count is
occurrences; the blocks are only their reason for existing.

Skipping one day of a recurring block does not touch the block either: it writes a
suppression for that date, and the grid draws it as skipped.

## A todo

`planner_todos`. **A task with no time yet.** It has a title, notes, a
category, a notebook, three ratings — and a nullable `scheduled_date`.

That one nullable column is the whole distinction people trip over:

- `scheduled_date` is **null** — it is in the general list. The board's backlog,
  and the strip beside the planner grid.
- `scheduled_date` is **a date** — it has been pulled onto that day's board. It
  is on that day, but it still has no hour, so it is not on the grid.

Neither of those is a block, and neither has an occurrence. A todo left on
Monday and not finished follows you forward: the board and the planner strip
both keep showing it after its day has passed, because a task you did not do
has not stopped needing doing.

## Becoming one another

The moves that matter are the ones that change _which_ of the four things a row
is. All of them move the row rather than copying it, so the same task is never
on screen twice.

| From          | To                           | How                                                               |
| ------------- | ---------------------------- | ----------------------------------------------------------------- |
| todo          | one-off block                | drag it onto the grid at an hour, or tap it and tap a time        |
| one-off block | todo                         | drag it back onto the todo strip, or "Back to todo" in its editor |
| todo          | todo on a day                | drag it onto a day column on the board                            |
| weekly block  | one-off block, this day only | <kbd>Alt</kbd>-drag one occurrence off it                         |
| weekly block  | nothing, this day only       | skip that occurrence                                              |
| one-off block | weekly block                 | "Repeat weekly" in its editor                                     |

Scheduling a todo keeps what a block can hold — the name becomes the label, the
notes ride on the occurrence, the category, notebook and ratings come across —
and taking it back off returns the same things. What is lost going back is the
date and the hour, which is exactly what was being given up.
