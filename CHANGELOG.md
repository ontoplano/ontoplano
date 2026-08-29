# Changelog

What changed for somebody using the app, newest first. One entry per
user-visible change, written when the change is made — the git log has the
rest. Versions follow `package.json`.

## 0.8.2 — 2026-08-29

- The payment provider is Paddle now — Lemon Squeezy could not pay out to
  Brazil. "Go Pro" became a button instead of a link (the server mints a
  checkout with the account id attached and sends the browser there), a
  yearly price can sit beside the monthly one, and "Manage payment" opens a
  fresh Paddle portal session each time. Sandbox and live follow from the
  API key alone. Existing subscriptions and trials are untouched; the five
  `PADDLE_*` values in `docs/BILLING.md` replace the `LEMONSQUEEZY_*` ones.
- Mail that fails to send is no longer a silence: every failure is recorded,
  counted as a `/healthz` warning (which is what the off-box watchers alert
  on), and listed on the administration page with a retry for mail worth
  re-sending and a dismiss for expired links. The trial-ending notice is now
  marked sent only when it actually went — an undelivered one is retried by
  the next nightly reconcile instead of being stamped and forgotten.
- In the dark theme, red text no longer lands on a red background: the colored
  palettes now invert like the grays, so error tones, revoke buttons, and the
  token-created notice keep their contrast in both themes.
- The new-token form lists each permission by its name first, with the plain
  sentence after it.
- The self-host Telegram bot now reads `ONTOPLANO_TELEGRAM_BOT_TOKEN` and
  `ONTOPLANO_TELEGRAM_ALLOWED_USER` — names no operator can confuse with an
  ops bot's. The old names stop working; rename the two lines in
  `~/.config/ontoplano/env`.
- The Android build takes `ONTOPLANO_ORIGIN` only; `ONTOPLANO_DOMAIN` is
  retired. Tooling defaults (ports, keystore path, package name) moved into
  `defaults.env` at the repo root — one place to look, no `make` fallbacks.
- Every mail the app sends — address confirmation, password reset, address
  change, the trial notice — now shares one designed template: a quiet card,
  one button, and the raw link printed under it, because a button that hides
  its destination is what phishing looks like. The plain-text part (and the
  no-SMTP log path) carries the same words and the same link as before.

## 0.8.1 — 2026-08-29

- The integrations page now states the limits — reads and writes per minute,
  per token and per account — and its "writing a plugin" pointer is a real
  link to the docs on GitHub.
- An administrator can start a trial for an account that has no plan history —
  the accounts that predate billing on an instance that turns it on.
- The Android widget's connect screen is readable again (it had been drawing
  under the status bar, in a fifteen-year-old theme), and placing the widget
  from the launcher now completes instead of leaving nothing on the
  homescreen. Rebuild the app to get it.
- Running the test suite no longer rewrites the machine's real
  `~/.config/ontoplano/config.toml`.
- Bare `make` prints what exists instead of starting whatever the local
  deploy include defines first.
- The boot migration check no longer refuses a database that started on
  `db:push` and was adopted into migrations later.

## 0.8.0 — 2026-08-29

- The shopping list has an API: read it, add to it, tick things bought — with
  two new token scopes granted in plain sentences like the rest.
- `examples/onto-household.mjs`: the household plugin. Two people, two tokens,
  one shared shopping list — kept equal over webhooks, across two different
  instances if that is where the two people live.

## 0.7.0 — 2026-08-29

- A data stream can keep a retention window — "keep 90 days" — set by the app
  that owns it or on the integrations page. Older points are deleted nightly
  and as new ones arrive; an empty window keeps everything, which stays the
  default.
- Stored data points now count against the plan's storage ceiling, shown on the
  billing page like the others. A push that would cross it is refused whole,
  with the limit named.
- The API budget is now per account as well as per token: more tokens are no
  longer more budget.
- Two days before a trial ends, a mail says so — what happens next, and where
  to cancel — so the first charge is never a surprise.
- Granting an API token now reads as sentences — "Read everything on your
  calendar for the days ahead" — instead of scope codes, in the form and on
  every token's row.
- When a page breaks in your browser, it can offer to send the technical
  details to your server's log — only if the instance turns the feature on,
  only after you say yes, asked once. What is sent is what broke, never what
  you wrote.
- Webhooks: subscribe an address of yours to be told when things happen — a
  todo added or finished, an idea captured, something added to or bought off
  the shopping list. Signed deliveries, thin payloads (a diary entry announces
  only its id), managed on the integrations page or over the API.
- The `?` shortcut sheet now knows every page's keys — notebooks, people,
  recipes and the settings pages included — because pages and their hints read
  the same registry the sheet does, so they can no longer disagree.

## 0.6.2 — 2026-08-29

- The server writes one log line per request (method, path, status, duration,
  request id), and a 500's "Something went wrong (abc123)" now names the same
  id as that request's log line.
- The app refuses to start against a database that is missing migrations, and
  says which command to run — instead of failing one query in twenty for weeks.

## 0.6.1 — 2026-08-29

- Changing pages no longer flashes dark — the cross-fade is gone; the new page
  takes a small step up instead.
- The phone's bottom bar can no longer scroll away, be pushed off, or vanish
  after a refresh: it is glued to the viewport.

## 0.6.0 — 2026-08-29

- Moving between pages cross-fades instead of blinking; the bars hold still
  while the page changes under them.
- Row hover fades in instead of snapping, and every filter toggle responds to
  the pointer like the buttons beside it.
- Fixed: in the rounded style, the account menu opened invisibly under a
  clipped header.
- The header search backs off a step at laptop widths so the navigation fits.

## 0.5.0 — 2026-08-29

- Hover feedback everywhere: buttons lift, list rows tint under the pointer,
  chips and inputs respond, nav tabs underline.
- Rounded style: filled headers and rows no longer poke square corners past a
  card's curve.
- The header search box uses the space a wide screen gives it.
- Page introductions carry a rule in the section's colour instead of floating
  bare on the background.
- Autofill is now off by default on every field, so the browser stops offering
  passwords and cards over task titles; sign-in fields still opt in.

## 0.4.0 — 2026-08-29

- The Android widget connects through the browser: one tap, no more pasting a
  token.
- Errors, notices and the staging band share one banner format; the staging
  copy is soberer.
- The save button no longer hides behind the phone keyboard on bottom-sheet
  forms.
- Plain text inputs stop inviting password and credit-card autofill.
- The admin page dropped its roles explainer text.

## 0.3.0 and earlier

Untracked — see the git log.
