<!-- Written by hand in docs/prose/deleting-your-data.md — edit that file, then run `yarn docs`.
     The tables below marked "generated" come from the code itself. -->

# Deleting your data

Both live at the bottom of **Settings → Account**, in a red panel called
Danger zone. Each asks for your password and for a phrase typed out, because
neither can be undone by anybody, including whoever runs the instance.

## Delete everything in this account

A clean slate. Every task, note, habit, goal, person, recipe, ledger,
picture, reminder and record goes, and the account stays: same address, same
password, same plan, same preferences. You are still signed in, looking at the
app as it was the day you made it.

Use it when you want to start again rather than leave.

## Delete this account

The data and the account both. Your address stops existing here, your sessions
end, and you are signed out for good. There is no way back in afterwards and
no way to reclaim the address later — it is gone rather than reserved.

## Neither can be undone

There is no bin and no undo. The rows are deleted, not marked as deleted, and
the app cannot show you what is not there.

If you might want any of it, **export it first** — the same Account page, a few
rows above the danger zone. The export is a single JSON file holding everything
the account owns, and it imports into this instance or any other.

## Backups

An instance keeps backups so that a broken disk does not cost anybody their
notes. That means a copy of your rows can outlive the moment you delete them,
by however long the operator's backups go back. If you self-host, that answer
is yours to decide; if somebody else runs your instance, it is theirs.

On the instance I run at app.ontoplano.com, backups go back about two months:
every pull for a day, one a day for a fortnight, and one a week for two months.
They exist to survive a failure, and they are restored whole — the whole
database, at a moment in time — rather than row by row.

Deleting your data is your decision and it is final. I will not pull an account
or a row back out of a backup for somebody who deleted it and changed their
mind, and by deleting you give up any claim to what the backups happen to hold.
The export is there for exactly this, and it takes a second.
