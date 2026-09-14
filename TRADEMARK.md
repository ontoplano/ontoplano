# Trademark

Ontoplano is free software and a name. The two are licensed differently, and
this file says how.

The **software** in this repository is under the [AGPL-3.0-or-later](LICENSE).
Run it, read it, change it, run a changed copy for other people, sell it — the
licence says what you may do and nothing here takes any of it back.

The **name** is not part of that. "Ontoplano", the wordmark, the mark (the
octagon and the colours inside it) and the icons drawn from it are trademarks
of Estevão Chedieck, used in commerce since 2026. They are not licensed under
the AGPL, and they are not yours to use as your own.

This is an ordinary arrangement rather than a trick: GPL-3.0 §7(e), which the
AGPL carries, allows exactly this — declining to grant rights under trademark
law while granting everything the copyright licence grants. Debian, Mozilla and
the Linux kernel all do the same thing.

## What you may do without asking

- Everything the AGPL grants, on the code.
- Redistribute the software **unmodified**, with its name and its artwork
  intact — a distribution package, an F-Droid build, a mirror, a Docker image
  of the released code. That is the software this project publishes, and it is
  meant to arrive looking like itself.
- Say true things about it: "works with Ontoplano", "an importer for
  Ontoplano", "a fork of Ontoplano", "hosting for Ontoplano instances". Use the
  word where the word is the accurate one.
- Run your own instance for yourself, your family, your company. Running it is
  not branding.
- Write about it, screenshot it, review it, teach it.

## What needs a different name

- A **fork you distribute with changes in it**. Change the name, the wordmark
  and the mark before you ship it. The code is yours to change; the badge on it
  is not.
- A **service sold under the name** — hosting, support, an app store listing,
  a paid instance — that is not mine or licensed by me.
- **Domains, handles and package names** that read as this project:
  `ontoplano.*`, `ontoplano-anything`, or a spelling close enough to be taken
  for it.
- **Merchandise**, or a logo of your own that borrows the mark's shape.

If you are not sure which side of the line you are on, the test is whether
somebody could reasonably think your thing is this project, or endorsed by it.

## The artwork

`src/lib/logo/mark.png` and everything generated from it — the favicon, the
PWA icons, the launcher icons, the wordmark — are trademarks, not code. They
are in the repository because the software needs them to look like itself when
it runs, and they are licensed for exactly that: shipping and running this
software, unmodified.

To distribute a modified build, replace them. Nothing in the app depends on the
particular drawing: replace `mark.png`, run `yarn icons`, and every icon is
redrawn from whatever you put there.

## Asking

Anything not covered above, ask: <estevao@chedieck.com>. Permission for a
specific use is usually a two-line answer, and I would rather give it than have
somebody guess.

---

_Unregistered marks, used in commerce. This file states a position; it is not
legal advice and it is not a licence to anything it does not name._
