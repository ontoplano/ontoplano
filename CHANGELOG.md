# Changelog

What changed for somebody using the app, newest first. One entry per
user-visible change, written when the change is made — the git log has the
rest.

Every entry sits under a version, and the newest heading is always the version
in `package.json`: adding a line means bumping. `scripts/check-changelog.mjs`
enforces that, from `make lint`, because the rule alone did not hold. There is
no "Unreleased" section, deliberately — it is where entries go to lose their
version.

## 0.10.0 — 2026-08-31

- The four tables a task can live in are named after what they are rather than
  how they are stored: `recurring_tasks`, `exceptional_tasks`, `todo_tasks` and
  `task_records`. Nothing changes for anybody using the app — the names are
  what the documentation and the API reference talk about, and "weekly_slots"
  had stopped being true the day monthly repeats arrived.

- The error page is readable on a phone: bigger type, centred in the space it
  has, and the offer to send the details is a button rather than a link inside
  a sentence.
- The planner's tabs are full size again and the row scrolls, with an arrow at
  the edge saying which way the rest of them are.
- The week header on a phone puts the date and the weekday on their own lines,
  so a week that crosses a month boundary does not sit at two heights.
- When a ban action fails, the page says what the helper actually said instead
  of "Command failed".
- The demo says which pages it will not let you change, rather than implying
  none of it can be.

- The wiki's page on the plan says what a recurring block actually is — every
  repeat, including every-other-week and monthly, not only weekly ones — and
  leads with the one question that decides which table a task lives in.

- **A tidier planner on a phone.** The weekday headers read M T W T F S S
  instead of "M…" and "W…"; the zoom control is in the same style as everything
  else; the tabs fit, and where they do not there is an arrow saying which way
  the rest of them are. Less air above the grid, so more of the day is on
  screen.
- The planner opens on the view it will settle on. It used to be served the
  week, paint it, and switch to the day as soon as the script ran.
- History's day strip is two tight lines on a phone rather than three crowded
  ones, and "done" is blue there. Green against grey is a distinction this app
  does not use.
- The demo strip on a phone says "Demo version" and stops, instead of being cut
  off mid-sentence by the menu button.

- A page that breaks before you have signed in can be reported now. Reporting
  needed an account, so the landing page — the one a stranger sees — was the
  one page whose failures reached nobody. Nothing is sent unless the button is
  pressed.

- The planner's tabs fit on a phone. Six of them overflowed by about thirty
  pixels, and the row snaps as it scrolls, so dragging it sideways moved a
  fraction and sprang back.
- The tab you are on is underlined in the same ink as its label. It was drawn in
  the Home section's slate grey, which beside a white label read as the tab
  being disabled.

- The documentation site's links work: pages are `/data-model` rather than
  `/data-model.html`, and a link to a table in the contents scrolls to it.
- The calendar feed appears in the API reference, so `calendar:read` is no
  longer a permission that nothing seems to use.

- A drag shows where it will land before you let go. A todo dragged over the
  grid is drawn as the block it is about to become, at that hour; a block
  dragged toward the todo strip appears there, greyed out. And dragging a
  weekly block no longer opens the strip, since a weekly block cannot go in it.

- Changing page no longer makes the layout jump. Every navigation used to
  rebuild the whole page and slide it up six pixels — including the tab row you
  had just clicked, which is the one part of the screen that did not change.

- "Block for good" works more than once. It failed on exactly the address you
  would use it on — one fail2ban had just banned — because that address was
  already in the firewall set, and the page stopped offering "unblock" as soon
  as two addresses were in there.
- Each blocked address says how many times it has been back. One ban is a
  scanner passing through; the ninth is somebody working at it.

- The demo shows the administration pages and refuses every change made from
  them, saying so. What describes the machine — the bind address, the database
  path, the addresses the firewall has turned away, mail that did not go out —
  is hidden there; it is somebody's server, not part of the tour.
- A tab left open on the demo across an hourly reset no longer lands on a login
  page the demo does not have.

- The demo's seeded notes no longer use Markdown checklists. In an app that has
  a todo list, a checkbox inside a note reads as one and is not.

## 0.9.0 — 2026-08-31


- The wiki is a site: `docs.ontoplano.com`, built from the same markdown the
  repository carries and published by `make deploy-docs`. `make deploy` now
  carries the app, the demo and the documentation together; each also has its
  own target for when only one of them changed.

- The wiki has hand-written pages now, beside the generated ones: what a block,
  an occurrence and a todo each are; how a request travels; every way another
  program can reach an account. The tables inside them are still generated from
  the code, and the comment at the top of a route file now turns up as that
  page's description.

- **Calendar links are yours to look at again.** The address is now kept and
  shown back on Settings → Integrations, so setting it up on a second device a
  fortnight later no longer costs you the first. You can hold up to five —
  name them ("my phone") — and revoke any one on its own. They sit in the
  token list with everything else, because that is what they are.

- The demo's notes are written the way notes are actually written — headings,
  lists, quotes, the odd task list — so what the diary and notebooks do with
  Markdown is visible without typing any. The Republic notebook has more in it,
  which is the one that shows what a notebook is for.

- History no longer offers weeks that have not happened, and each day in the
  strip says its date: "Aug 24 — Mon (3)" rather than "Mon (3)", so you are not
  counting along from the week's range to find the Wednesday you meant.

- **The todo strip in the planner works both ways.** It now also holds the
  todos due today and the ones still owed from an earlier day — those were
  visible only on the board, though a todo due today is exactly what you open
  the planner to place. And a block can be dragged back onto the strip to take
  it off the day again, keeping the task. Scheduling used to be one-way: to
  change your mind you had to delete the block and type it in again.

- The planner grid stretches to hold whatever is on it. If a block starts
  before the first hour you asked to see — dragged up, typed in, or arriving in
  a subscribed calendar from another timezone — it used to be drawn nowhere at
  all, and the day looked free. The same now holds at the other end.

- The administration page no longer explains the operator's own server to
  them. Where an instance cannot act on a ban it says so in one line, and
  stops there.

- The Android build no longer stops with "Several environment variables and/or
  system properties contain different paths to the SDK". It uses `ANDROID_HOME`
  and drops the deprecated `ANDROID_SDK_ROOT` from its own environment, and
  says which SDK Bubblewrap has recorded when that is not the one you set.

- The error page stops making promises. It used to say "this is our fault
  rather than yours" and "nothing you had written is lost" — neither of which
  it can know. It now says what broke, and offers to send the technical
  details so it can be fixed.

- A leftover scaffolding page could create an account on an instance that was
  set to invite-only or closed. It called the auth library directly, so none of
  the rules the sign-up form applies — the registration mode, the invite code,
  the limit on how fast accounts can be made — were being asked. The pages are
  gone.

- **Your plan, in the calendar you already use.** Settings → Integrations now
  hands you a calendar address you can paste into Google Calendar, Apple
  Calendar, Thunderbird or a phone's built-in app. Your blocks turn up there
  and keep themselves up to date, read-only, with nothing to install. Anyone
  holding the address can read your plan, so it is treated like a password —
  and "Replace the link" stops every calendar using the old one at once.
- A subscribed calendar's event no longer shows a stray backslash when its name
  has a semicolon in it — "Standup\; then triage" was being read literally.

- Buttons have weights again. Every button used to be a white box with a
  border and a shadow, which is fine for one and a wall for ten — and ten in a
  row was the normal case. A secondary button is now a quiet tonal fill, so
  the one button that is the point of the screen is the one you see first.
- The things you do to a row — snooze, edit, delete — sit at the right edge,
  in the same order, in the same place on every row. They used to be appended
  after the item's name, so a long name moved them, and a very long one pushed
  them onto a second line. They rest quietly and come up when you point at the
  row.
- Ticking something off the shopping list is a checkbox, where it always
  should have been. "Got it" and "Not now" were two bordered buttons on every
  row; the box is one control, in the same place, reachable with a thumb. Rows
  you still have to buy are no longer washed in red — the empty box says it.
- The planner's controls are one bar instead of three clusters and a date
  stranded on its own line. On a phone that is nearly an hour more of the day
  visible without scrolling.
- One "+ New" button in the planner instead of "+ One-off" and "+ Weekly". You
  no longer have to decide how often something repeats before you have said
  what it is — the form still asks, two lines below the name, where you can
  change your mind.
- Day / Week / Month, and the shopping list's All / Inventory / Wishlist, are
  single controls with positions rather than three separate buttons.
- The four quick-capture buttons carry the colour of the section they write
  into, on the phone and on a wide screen alike, so you can pick one without
  reading all four.

## 0.8.2 — 2026-08-29

- Your export now includes your recipes, your written weekly reviews, your
  reminders, your subscribed calendars and what you have paid for things.
  They were being left out, which made the promise that you can take your
  data with you not quite true. Deleting an account clears them too.
- A diary entry's number is never given to another entry, even after the
  newest one is deleted — so a `#12` written months ago still means what it
  meant.
- A block can no longer be saved at a time like `25:00`.
- Keyboard hints print `⌘` on an Apple keyboard again. Browsers that have
  stopped answering the question return an empty answer rather than none,
  which the check walked straight past — so a Mac was being told to press a
  key it does not have.

- Registration confirms your address before it asks for a card, not after.
- A password needs eight characters with a letter and either a number or a
  symbol — checked wherever a new one is set, and said in the form rather
  than only as a refusal.
- Notebooks and People are in the section wheel. The wheel and the bar kept
  separate lists, so those two were in one and not the other whatever the
  preferences said.
- Quick capture opens the section's own form with everything but the first
  field folded away, so writing something down is still one line and adding
  the rest no longer means saving it and opening it again.
- The shopping list shows what an item costs on its row, and no longer
  claims a price trend — it was measured against the first price ever
  recorded, which nothing could correct.
- `/admin` can let a blocked address back in, or block one for good, where
  the box has been set up for it.
- ontoplano is licensed AGPL-3.0.

- What just happened is said where you are looking. Confirmations and failures
  arrive in the corner of the screen instead of at the top of the page, so
  saving something from the bottom of a long settings page no longer answers
  four screens away. A confirmation leaves after five seconds; a failure waits
  to be dismissed.
- The keyboard no longer offers saved passwords, cards and addresses on
  ordinary fields. Chrome reads a field called "name" as a person's name
  whatever the page says, so none of them are called that any more.
- Picking a notebook fills the panel beside it. It used to leave for the
  notebook's own page, so that panel could be looked at and never changed.
- A dialog that fills a phone screen has square corners, instead of showing
  the page behind it at four points.
- `/admin` shows the errors people chose to report — with the page, the
  browser and the stack — instead of writing them only to a log nobody reads.
  Blocked addresses say how long they are blocked for, and the history is a
  contained list with older entries and a refresh.
- The demo says what it is, and says you can open it on your phone.

- Saving a settings form no longer empties it. Turning a section off cleared
  every other box until the page finished reloading — the setting was always
  saved, the screen just stopped showing it for a moment. The same was one
  submit away on the registration mode, the email-change and client-error
  switches, and the deployment fields.
- On a phone you can press and hold anywhere on the plan to add a block at
  that day and hour. The grid could only be drawn on with a mouse; on a touch
  screen a drag scrolls the page, so there was no way to make a block by
  touching the calendar at all.
- The demo says what it is in a bar at the top, and on a phone in a strip
  above the bottom bar. It also tells a desktop visitor they can open the same
  demo on their phone.
- The demo has two months of use in it — a plan that was mostly kept, habits
  with gaps, notes worth opening and a review written most weeks — instead of
  one of everything and no history.
- "You have already switched twice today. You can switch again tomorrow." —
  and the billing page says you can switch twice a day before you hit it.
- The planner's CSV import example is in English.
- There is a `robots.txt`, and the public demo asks not to be indexed at all.

- Signing up at the weekend no longer lands on an empty day. The starter
  weeks each left one weekend day blank — Student had no Saturday, Remote
  worker no Sunday — so the week onboarding promises to fill arrived empty
  for anybody who joined on the wrong day. Both are filled.
- `x` on the board asks about deleting a card again. It had stopped doing
  anything at all: the key armed a confirmation that nothing on screen drew
  any more, while the shortcut sheet went on offering it. The card now asks
  in place, and the key still never deletes on its own.
- The pie in the bar is the ontoplano mark rather than a chevron — on the
  phone's raised button and in the desktop header. The mark itself now lives
  in one file (`src/lib/logo/mark.svg`) which the app draws and which
  `make icons` turns into the favicon, the PWA icons and the one iOS reads,
  so changing the logo is changing a file.

- On a phone, forms are screens. Every dialog in the app now takes the whole
  screen below `sm`, titled, with a back arrow at the top left instead of an
  × in a corner — and the new-block form's hand-picked column widths became
  the shared grid, so nothing is squeezed three-across on a 390px screen.
- The phone lost its top bar: everything that was in it already lives in the
  bottom one, so it was spending a strip of a small screen on the app's own
  name.
- The search box no longer offers saved passwords, cards and addresses: the
  shell stamps the ignore flags every field needs, rather than each input
  having to remember, and the palette input is a real search field.
- There is a demo mode. With `ONTOPLANO_DEMO=true` and an account named,
  anybody who arrives is already signed in to it — no registering to look at
  a planner — and a band on every page says the data is wiped hourly.
  Changing the password or address, deleting the account and revoking
  sessions are refused, so one visitor cannot end the demo for everybody.
- The expired account's "Download your data" button works on the first tap.
  It was a link into an export endpoint, which the router tried to treat as
  a page — so the first tap raised an error instead of downloading and only
  the second appeared to work, spending two of the day's two exports on one
  double-tap. It is a form now, and it disarms for the gesture.
- First run asks how the app should look, alongside the timezone and the
  starting week, and repaints as you choose. The card page dropped its own
  theme links and its sign-out reads plainly.
- Tag fields say what they accept: commas or spaces, and a leading # is fine.
- The phone bar was redrawn: Home sits in it as its own button and the
  section pie rises out of the middle in a round, larger bump — and the pie
  (on desktop too) no longer spends a wedge on Home. On the phone it opens
  centred and above the hand, so no room hides behind a thumb.
- Installed as an app, dragging a list past its top no longer reloads the
  page: the browser's pull-to-refresh is off, while the native elastic
  stretch stays. Short pages also lost a little pointless scroll tail.
- Phone dialogs now behave like sheets: they slide up from the bottom,
  carry a drag handle, and a downward swipe dismisses them — with the
  spring back when the drag was not far enough.
- Sections can be put away. Preferences grew a Sections card: untick Goals,
  Diary, People, Notebooks, Ideas, Health, Shopping or Recipes and it leaves
  the navbar, the pies, the palette's places, the dashboard and the capture
  buttons — while its pages keep answering at their URLs and nothing is
  deleted, so turning it back on is the same tick. Home and the planner are
  always on.
- The admin Blocked card now says what each banned address did ("guessed at
  SSH logins", "hammered the site with errors") instead of naming a jail,
  and counts addresses over the last 24 hours — it used to count since
  midnight, and could say "0 blocked today" right above a ban made minutes
  ago.
- Coming back after cancelling carries over whatever is left of the trial:
  resubscribe with four days left and the checkout says — and bills — four
  days, not a fresh fourteen; with nothing left, it says billed today. And
  the billing cycle can change at most twice a day, since every switch
  moves real billing and sends provider mail.
- An expired subscription now holds the whole account, the way an
  unconfirmed address does: every page leads to the wall that says the data
  is kept, offers renewal (yearly leading) and the JSON export (twice a day,
  the button disarming itself against double-clicks) — and API tokens stop
  with a 402, so plugins end when the subscription does. All three holds —
  verify, card, expiry — are decided in one service that the page gate and
  the API door both ask, so future code cannot forget one.
- The card page polls until the webhook lands, so coming back from a paid
  checkout never shows a stale offer. The admin end-plan control shows the current expiration date and its
  button stopped wrapping; the cycle-switch confirmations read plainly
  ("Switched to yearly billing."); the error-report prompt says the choice
  is changeable in Preferences, where a control for it now lives.
- Switching cycle works during the card-first trial — the $0 trial payment
  had marked the subscription active locally, so the switch sent the wrong
  proration mode and the provider refused it. Downgrading to monthly now
  asks once, with the price difference named; upgrading stays one click.
- A first, cold visit no longer flashes unstyled wreckage before the page:
  the CSS ships inline with the HTML.
- The signup funnel is one straight line: every landing CTA opens the
  register form directly (the hero also grew a plain Sign in button, and
  the price card is clickable), and a fresh account goes register → confirm
  the address → the card page → the app, with nothing to find by hand. The
  card page states the terms — nothing charged today, the first-charge date
  — before any payment window opens, with yearly leading.
- The billing page stopped selling to people who already bought: with a card
  on file the buy buttons are gone, replaced by a one-click switch between
  monthly and yearly on the same subscription (mid-trial it bills nothing;
  on a paid plan the difference is prorated). Coming back from checkout the
  page confirms the payment by itself instead of showing stale buy buttons,
  and the "run it yourself for nothing" pitch left the paid app.
- Hosted administrators have the Instance tab again — registration mode and
  the rest were only reachable on self-hosted installs.
- An administrator can end an account's plan on a chosen date — the
  operator's clock for previewing what a lapsed user sees.
- The price is $4.90 a month / $29.90 a year, and the app quotes it from the
  provider's own price entities (cached ten minutes) — the number on the
  landing and billing pages is the number that gets charged, from one place.
- The confirm-your-address page lost the navbar and most of its words, and
  an administrator inside an unverified account can press Stop again — the
  verified-address gate was swallowing the way out.
- The recipes and shopping notices ("no food category yet", "no connection")
  moved into the one banner format instead of their own amber boxes.
- Registration follows the instance's mode. Open, on an instance that sells:
  the card comes first — a fresh account lands on billing, the button says
  "Start your free 14 days", checkout keeps the card without charging it
  (the page, the checkout and the mail all say when the first charge is),
  and the trial lives at the provider. Invitation-only: the register page
  says it is a closed alpha, that accounts made now are real and their data
  is kept — and invited accounts get full access with no billing anywhere.
- Checkout is the app's own /buy page now (the one page allowed to load
  Paddle.js), so selling live does not depend on Paddle approving hosted
  checkouts. `PADDLE_CLIENT_TOKEN` replaces `PADDLE_CHECKOUT_URL`.
- An unverified account signs in instead of bouncing off an error: it lands
  on a page that says the address is unconfirmed and can resend the mail,
  once a minute, with the button counting the cooldown down. The gate is
  the deployment's choice (`ONTOPLANO_REQUIRE_VERIFIED_EMAIL=true`).
- Mail through the box's own postfix works again: opportunistic TLS on
  localhost was refusing the server's public-name certificate, which no
  loopback connection can ever match — every verification mail failed with
  a hostname mismatch.
- `make deploy` builds on a laptop whose dev database may be behind the
  migration being shipped — the boot-time migration check no longer runs
  during a build, only when a server actually starts. Deploy migrates the
  server itself, as it always did; nobody migrates by hand.
- The admin page's fail2ban hint now names the command that actually fixes
  it: after joining `adm`, the lingering systemd _user manager_ keeps its
  old groups forever, so `sudo systemctl restart user@$(id -u)` — restarting
  the app alone changes nothing.
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
