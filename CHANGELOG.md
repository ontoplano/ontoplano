# Changelog

What changed for somebody using the app, newest first. One entry per
user-visible change, written when the change is made — the git log has the
rest.

Every entry sits under a version, and the newest heading is always the version
in `package.json`: adding a line means bumping. `scripts/check-changelog.mjs`
enforces that, from `make lint`, because the rule alone did not hold. There is
no "Unreleased" section, deliberately — it is where entries go to lose their
version.

## 0.84.0 — 2026-09-06

- **The app sells through Google Play when it comes from Google Play.** The
  store requires it, so the copy installed from Play opens Play's own
  purchase sheet, and every other copy goes on using the payment provider as
  before — the buttons tell the two apart by themselves. A purchase is
  verified with Google before it counts, acknowledged so it cannot be
  refunded out from under the account, and kept in step afterwards, so a
  renewal or a cancellation reaches the app without anybody opening it. It is
  one subscription either way: what changes is only which company took the
  money.

## 0.83.0 — 2026-09-06

- **Finance, and its first tab: Bills.** What you expect to pay, on a rhythm
  — weekly, monthly, yearly or one-off — and what you actually paid, which
  can differ. That gap is the number the section keeps: the month shows
  expected, paid, and the difference in words. Add, edit, mark paid, undo a
  payment, archive; a bill you delete for good is confirmed in its own dialog
  and only reachable from the archived list, because its payment history is
  the point. There is a card for it on the dashboard, and an assistant can
  keep it over MCP.
- **A bill says when to pay it, and the week says so too.** The due day is
  the last day it can be paid; a bill can now say how many days before that
  it wants doing. The planner draws each one on that day, and ticking it
  there marks the bill paid — so the money is a consequence of the week's own
  gesture rather than a second chore.
- **An undone tick no longer blinks back.** Ticking a to-do off showed it
  done, then — the moment the undo window closed — showed it undone again for
  an instant before it finally went. The held action now keeps the row's new
  state until the write has actually landed.
- **The development server wears its own mark.** `make dev` saved to a phone
  was the same tile and the same name as the real app. It has its own icon,
  its own name (Ontoplano — Dev) and its own install identity now, the way
  staging does.
- **A database from a different history is refused, not half-migrated.** A
  database that ran a migration this build has never heard of used to die
  part-way through a `CREATE TABLE`; it now stops before anything runs and
  says what happened. `make reset-dev` is the way out on a dev machine.

## 0.82.0 — 2026-09-06

- **The "payment without a webhook" alert stops crying wolf.** It fired
  whenever the app confirmed a payment by polling — including when a working
  webhook simply lost the race to a customer landing back on the success
  page. It now counts only payments no webhook ever reached, after a grace
  period, and says in plainer words what to check.

## 0.81.0 — 2026-09-06

- **Nobody signs in as anybody.** The administration page's "Sign in as this
  account" is gone, banner and all, and the endpoints behind it are shut for
  every role — an account's inside is its owner's, full stop.
- **The account log tells a confirmed address from a hopeful one.** Clicking
  the confirmation link writes "email verified" into the account's history,
  where before everything began and ended with "registered".

## 0.80.4 — 2026-09-06

- **The roadmap grows a widget ambition and sheds the business section.**
  "The widget, ten times better" is in scope — direction decided, meaning
  open — and the business section is out.

## 0.80.3 — 2026-09-06

- **The demo's login page shows the form to a minted visitor.** It bounced
  every signed-in session to the dashboard, and on the demo everybody is
  signed in from the first page view — so the operator's only way in was
  unreachable. Signing in there now simply replaces the visitor session; an
  account with a password of its own still goes straight home.

## 0.80.2 — 2026-09-06

- **`make-operator.mjs` runs on a production install.** It imported
  better-auth for the password hash, and a deployed box does not have it —
  Vite bundles it into the build. The hash is node:crypto's own scrypt now,
  parameter-for-parameter the same, held equivalent by a test that verifies
  it with better-auth itself.

## 0.80.1 — 2026-09-06

- **`make-operator.mjs` creates the account it is asked for.** It used to
  only promote one that already existed and point you at the registration
  form — a bootstrap that depended on a second door. Now a missing account is
  made on the spot: the password asked for without echo (or piped in), hashed
  by the same better-auth the app runs, verified, admin, ready to sign in at
  /login.

## 0.80.0 — 2026-09-05

- **The demo box can have an operator.** The demo's rules — no sign-out, no
  identity changes, no tokens — bind the throwaway visitor copies now, not
  every session on the box, so an account made deliberately signs in and out
  and watches sign-ups on /admin like any admin. /login is reachable by URL
  on a demo (nothing links to it), and `scripts/make-operator.mjs` promotes
  a registered account from the box's own shell. The hourly sweep still only
  eats accounts carrying the demo expiry stamp, which the operator never has.

## 0.79.5 — 2026-09-05

- **HTML responses say charset=utf-8 in the header.** Link scrapers trust the
  header over the meta tag, so reddit's preview read the title's em dash as
  Latin-1 and showed "Ontoplano â".

## 0.79.4 — 2026-09-05

- **A phone can sign out.** Sign out lived only in the desktop header's menu,
  which the phone's bottom bar does not carry. It is a card on the account
  page now, above Delete your account.

## 0.79.3 — 2026-09-05

- **The confirm-your-address page opens with its resend button already
  counting down.** Registration sent the mail seconds ago; the button said
  "Send it again" anyway and the click it invited was refused.

## 0.79.2 — 2026-09-05

- **A wrong invitation code says so.** Invite-only instances answered "not
  accepting new accounts" to a mistyped code — the closed instance's sentence,
  on a form whose own copy says codes exist. Missing and invalid codes each
  get their own answer now; a closed instance still says only that it is
  closed.
- The registration banner on the instance page names `ONTOPLANO_REGISTRATION`
  as the environment override — `ONTOPLANO_STAGING` stopped forcing anything
  long ago.

## 0.79.1 — 2026-09-05

- **The day number stays in the month view** — it had leaked onto every week
  and day column, whose headers already say the date.
- **The planner grid is square inside.** Header cells, day cells and the hour
  sidebar all tiled with rounded corners, leaving triangles and holes at
  every seam; only the calendar's outer frame and the blocks themselves keep
  a radius.

## 0.79.0 — 2026-09-05

- **The month view works and looks like the app.** The forward arrow moves
  forward (it snapped back in months that start on a Monday), every cell
  carries its day number, past days dim instead of lighting up in dark mode,
  and the weekday header is one strip instead of seven pills.
- **An assistant can file shopping items into sections** — `add_to_shopping_list`
  takes a section by name, and `file_shopping_item` moves one later.
- **An assistant can make a notebook, and remove an empty one.** A notebook
  holding any writing is still refused: what is written is deleted by the
  person, in the app.
- **Asked for a diary entry, an assistant writes it.** The guidance read as a
  refusal; it now says the true half — keep their words, and never invent an
  entry nobody asked for.

## 0.78.2 — 2026-09-05

- **The family plan's copy says who pays, plainly** — the doc, the settings
  page, the offer band and both mails. The invoice was never shared; the
  payer pays it.

## 0.78.1 — 2026-09-05

- **Adding a task to a goal no longer drops the ones already done.** The
  choosing modal hid finished todos, and saving it replaces the whole set —
  so linking a new task silently unlinked every done one and the progress
  fell to zero. Done to-dos stay in the modal now, ticked and struck through,
  until you untick them yourself.
- **A goal can count a to-do that was finished before it was linked** — the
  choosing modal's Show completed to-dos button unfolds the finished list.

## 0.78.0 — 2026-09-05

- **Days moved before 0.77.0 come back to their block's hour.** The fix in
  0.77.0 moves generated days when the template moves, but rows moved before
  it kept the old hour forever. Generation now re-aligns any future unfinished
  day whose clock disagrees with its block, reminders included — no manual
  step, it heals on the next visit.
- **A goal's card unfolds what already counts towards it.** Tasks (n) opens a
  list on the card: linked todos with a checkbox that finishes and reopens
  them, linked blocks and activities as lines, and the choosing modal behind a
  button inside the fold.
- **`change_repeating_block` says plainly that `title` edits the block's text
  and keeps it the activity it is** — an assistant read the old wording as
  "renaming unmakes the activity" and gave up.

## 0.77.0 — 2026-09-05

- **Moving a repeating block moves the days it already made.** The template
  changed and the generated days did not, so the calendar feed kept exporting
  the old hour and the reminder still went off at it. Days already past keep
  the time they happened at.
- **An assistant can edit an activity** — its name, its description, its
  category — and add one. It could rewrite every block that used an activity
  and not the sentence saying what it was.
- **A habit can be ticked by name**, so `habits:write` is a grant that works
  on its own instead of needing `habits:read` to find the id first. The token
  form now says when a write grant will not work without its read.
- **The assistant is told the right weekdays.** Both repeating-block tools
  documented 0 as Sunday; every weekday in the app counts from Monday, so
  "gym on Tuesdays" landed on Wednesday.
- **A refunds page** at /legal/refunds — the seven days Brazilian law gives
  to change your mind, what happens after them, and what a refund does to the
  account. Linked beside Privacy and Terms.

## 0.76.0 — 2026-09-05

- **The demo and dev data reads like somebody's actual life.** The kitchen
  notebook's quotes agree with the sentence above them, the picture in it is
  a reference rather than a photograph of a room it cannot be, and the people
  who recur in the diary recur more than once.
- **Nobody joins a family plan without being asked.** Typing the address of
  an account that already exists now offers it a seat: a band at the top of
  their app and an email, with Accept and No thanks. The seat is held while
  they decide, the payer can withdraw the offer, and an account that pays for
  its own subscription has to cancel that first. An address with no account
  behind it is unchanged — the account is made for them, as before.

## 0.75.2 — 2026-09-05

- **The family plan's year is $99.00** (it was $100.80 — a round number
  instead of exactly 30% off the month).

## 0.75.1 — 2026-09-05

- **The set-password screen an invited member lands on carries no nav bar.**
  It offered rooms to an account that was not set up yet.
- **Both password confirmations are labelled "Confirm password"** — on
  register and on that screen.
- **The billing page counts the API tokens you hold, not the ones you have
  revoked.** An account with two tokens read eleven, and twenty revocations
  would have refused a new one.
- **The habit log button is the target glyph alone**, right-aligned with the
  card's other actions — the word said what the colour and the icon already
  say.

## 0.75.0 — 2026-09-05

- **The weekly review mail is opt-in everywhere.** The packages and
  `make install-service` install the app and the reminders timer only; the
  mail timer — useless without SMTP — is its own deliberate step
  (`make install-mail-service`, or a manual unit on a packaged box). The
  instance page's row says "needs SMTP" instead of pretending a mail with
  no transport is running.
- **`make deploy-local` restarts the installed service** — a deploy that
  leaves the old build running was a copy — and `make update` is gone.
- **A selling instance holding a sandbox payment key says so**: a red banner
  on /admin, a `sandbox` flag on the health check, and the deploy's billing
  check refuses production over play money. Staging is the one place it is
  the point.
- The scope picker's caution appears only once its scope is ticked, named
  by the permission (`search:read — …`); the wizard's token step carries a
  quiet note that the key holds most permissions, with the docs to restrict
  a later one; the wizard's starter week defaults to Blank; a section
  shared into your shopping list aligns its "family" chip with the buttons.
- The README says less and means it, and CONTRIBUTING opens with thanks and
  the ways to contribute instead of a CLA disclaimer.

## 0.74.0 — 2026-09-05

- **Share with the family.** On a family plan, a shopping section and a
  notebook each carry their owner's share switch: a shared section appears on
  everybody's list — add milk on one phone, tick it bought in the aisle on
  another — and a shared notebook is read by the whole plan, everybody
  writing their own entries, each note wearing its writer's name. Sharing
  widens who can reach a thing, never who owns it: renaming, deleting and
  the switches stay the owner's, notes are edited only by whoever wrote
  them, and accounts outside the plan see nothing. The assistant can flip
  the same switches: `share_notebook`, and `shareWithFamily` on
  `change_shopping_category`.
- The demo's horse is Rosa Bonheur's _The Horse Fair_ — the Met's, CC0 like
  every other picture in the demo.
- **Org mode imports.** Paste or choose a `.org` file: `TODO`/`NEXT`/
  `WAITING` headings become open tasks and `DONE`/`CANCELLED` finished ones,
  `SCHEDULED:` and `DEADLINE:` dates come along, bodies land in the notes,
  a keyword-less heading with writing under it becomes a note with its
  `:tags:`, and `#+TITLE` names the notebook it all lands in.
- **Shopping sections are managed in place.** A tick in the categories
  window saves the moment it lands — no per-row save button, and Close only
  closes. Every section can be renamed and deleted from the same window;
  deleting one leaves its items on the list, unfiled. The assistant can do
  the same: new MCP tools `add_shopping_category`,
  `change_shopping_category` and `remove_shopping_category`.
- The first-visit nudge on Integrations sits beside the New token button as
  one small line instead of a box, and the "An AI assistant (MCP)" preset
  button wears the same blue.
- **The assistant can no longer delete what is rarely deleted.** The MCP
  tools `remove_person`, `remove_habit`, `remove_goal` and `remove_goal_area`
  are gone: people, habits with their history, goals and their areas are
  deleted by the person, in the app. Blocks, reminders, ideas, todos and
  shopping items keep their remove verbs.
- **MCP calls spend the API's own budget** — 60 writes and 240 reads a
  minute per token, with the account ceiling above it — so "create a
  thousand goals" is told to slow down, not obeyed at machine speed.
- `keep_habit` is `tick_habit`: for something being avoided, the tick means
  it happened, and "kept" read backwards.
- A family seat's Settings hides the Billing tab it could only 404 on, and
  its Family tab says whose plan it is on and stops.
- The billing page no longer announces the twice-a-day switch ceiling —
  only the third press in a day meets it, as a refusal that names tomorrow.

## 0.73.0 — 2026-09-05

- **The Notes room is Notebooks now, at `/notebooks`.** Notebooks is the
  general thing and names the room; the diary is its second tab, at
  `/notebooks/diary`. Every old `/diary…` address redirects, so bookmarks,
  installed apps and old links keep working.
- **`/planner/*` is `/tasks/*`** — the room has been called Tasks since the
  nav rename, and its addresses now agree. The old paths redirect, review
  mails included.
- **A Google Keep text note imports as a note.** It used to become a todo
  named by the title with the body buried in the todo's notes field; now
  checklists become todos and text notes become notebook notes — title as a
  heading, Keep's labels as tags — all in the one notebook that undoes the
  import. The toast and the message say what actually arrived: "Imported 2
  tasks and 3 notes into …", and every settings toast now carries the
  action's own sentence when it wrote one.

## 0.72.0 — 2026-09-05

- **Integrations, three small honesties**: the caution under `search:read`
  is bordered to its own row instead of reading like a warning about the
  whole form; the freshly-created token's card links "How Ontoplano's MCP
  server works, tool by tool" instead of re-explaining what the prompt above
  it already does; and an empty token list says, beside the button, that
  New token → "An AI assistant (MCP)" is how an assistant gets in.
- The welcome tour names the rooms as they are named — Tasks and Notes, not
  "the planner" and "the diary" — and the architecture page stops claiming
  there are no other running parts: the two job timers are named, with what
  breaks (late reminders, never wrong data) when one is down.
- **The docs grew two pages that cannot drift**: every MCP tool with the
  exact description a model is handed, generated from the array that serves
  them, on the AI-agents page — and a permissions page for the one scope
  system the API, the MCP server and the calendar link all share, each grant
  with the tools that sit behind it.
- **The MCP surface covers what the app can do.** A week of real assistant
  use found rooms with no door; they have doors now: the repeating week
  (`repeating_week`, `add/change/remove_repeating_block` — "move gym to
  Wednesdays", not just this Wednesday), reminders (`reminders`,
  `remind_before_block`, `dismiss_reminder`), people and their birthdays
  (`people`, `upcoming_birthdays`, `add/change/remove_person`, behind new
  `people:read`/`people:write` grants), goals that move (`add_goal` —
  transcribed, never invented — `log_goal_progress`, `goal_areas`,
  `remove_goal`), habits managed whole (`all_habits`, `add/change/remove_habit`),
  the day's three wins, the weekly review read and written, data streams
  (`data_streams`, `log_data_point`), the kitchen's missing verbs
  (`cooked_recipe`, `archive_recipe`, `record_price`, `shopping_categories`)
  and ideas' other halves (`apply_idea`, `favorite_idea`).
- **No more blind category writes.** `add_block` used to file a mistyped
  category under the first one and report success; an unmatched name is now
  refused with the real names listed, `categories` and `activities` can be
  read, and `change_block` can refile a block. Urgency, interest and energy
  (1–5) can now be set through `add_todo`, `change_todo`, `add_block` and
  the repeating week.
- The MCP server's opening instructions map the new rooms and say plainly
  that a missing tool means a permission not held, not a feature that does
  not exist.

## 0.71.0 — 2026-09-05

- **Taking somebody off the family plan asks first.** The × was one click
  from locking a person out of writing; it now arms a second, deliberate
  button that is not under the cursor.
- **The welcome wizard starts with "Use it with an AI".** One press mints an
  assistant key and a short prompt to paste into Claude (or anything that
  speaks MCP): connect, then interview the new account's owner — routine,
  commitments, market staples, meals — with short, precise questions, and
  set the week up from the answers. Entirely skippable; Settings →
  Integrations has the same thing later.
- **Adding somebody to the family plan no longer signs you in as them.**
  Creating their account used to ride the sign-up endpoint, whose brand-new
  session landed on the payer's own browser — straight to the verify wall.
  Now the account is made quietly, the page says the mail went out, and
  nobody's session moves.
- **An invited account chooses its password first.** The mail's button opens
  a page with two fields — the password, and the password again — and the
  welcome wizard comes after. No more "use Forgot password later".
- **Ideas have their own token scopes.** `ideas:read` and `ideas:write` are
  separate grants from `notes:*`, so a capture tool can reach the idea inbox
  without being able to read the diary. A token minted earlier with `notes:*`
  needs the new scopes ticked to keep touching ideas.
- **`search:read` says what it really grants.** The scope picker carries a
  louder line under it: one tick reads across everything.
- **An assistant can edit what it can create.** New MCP tools `change_goal`,
  `change_todo`, `change_idea` and `change_recipe` — only the fields given
  change, and `kitchen:write` finally does what its sentence always said.

## 0.70.0 — 2026-09-05

- **A truth pass over the public docs.** The compose commands curl the
  branch that exists; the plugin guide points at the generated scope list
  instead of keeping a stale copy, stops describing the old timestamp
  storage, and says a self-hosted instance has no storage ceilings; the
  Android page admits push and the widget shipped; the backup page admits
  pictures are in the database and therefore replicated; CONTRIBUTING says
  `make lint` and `make dev`; the roadmap and issue templates stop offering
  shipped features as missing ones.
- **The legal pages stop inventing a contact address.** An instance that
  never set `ONTOPLANO_CONTACT_EMAIL` used to tell its users to write to a
  mailbox its operator does not own; now the pages say to ask whoever runs
  the instance.
- **The README is a front door.** The feature catalogue is gone — the docs
  are the tour — and what remains is what a newcomer needs: how to run it,
  how to develop it (`make dev`, and bare `make` for the rest), how to deploy
  it, and where the detail lives. It also stops claiming there is "no payment
  code at all" — what is absent is the payment provider, and `docs/PLANS.md`
  says exactly where that seam is.
- **Every install gets the companion timers.** The reminders and
  weekly-review timers now ship here instead of living in the maintainer's
  tooling: `make install-service` installs and starts them, generating the
  health token they ask with, and the `.deb`, `.rpm` and AUR packages carry
  them as system units with the token made on install. The instance page's
  fix commands now say `sudo systemctl` on a package install and
  `systemctl --user` elsewhere — whichever is true on this machine.
- **The Docker image runs the companion jobs itself.** Reminders every
  minute and the weekly review mail every hour, asked of the app by the
  container's own clock — no systemd, nothing to configure. A new
  `/api/jobs/weekly-reviews` endpoint (health-token gated, like reminders)
  makes the hourly job reachable, and Settings → Instance shows both jobs by
  when they last asked, whatever is doing the asking.
- **There is no "Pro".** The word is gone — from the buy buttons, the invite
  form and the docs. An account is subscribed, on trial, invited or not
  subscribed, and the admin list now says those words instead of a plan id.
- **A fresh install is self-hosted by default.** `make dev`, the from-source
  unit and the packages set `ONTOPLANO_SELF_HOST=true` themselves, so a new
  checkout or package install has no trials, no ceilings and no selling copy
  anywhere — a hosted deployment is the one that declares itself. The invite
  form's grant-date field now appears only on an instance that actually sells.
- **`make deploy-local` works on a fresh clone.** The build check that guards
  the payment provider ran its verdict even on trees that have no provider —
  which is every public clone — and failed the deploy with a complaint about
  a file that was never there.

## 0.69.0 — 2026-09-05

- **Inviting somebody to the family plan makes their account.** Type an email
  on Settings → Family: with an account it lands on the plan at once; without
  one, an account is made on the spot and the mail's link opens it — verified,
  signed in, at first-run setup. Only where registration is open.
- **The admin list says who pays for whom** — a family payer reads "pro
  (family payer, 3 of 5 seats)" and a member "pro (on Ana's plan)".
- The register page's family note says "Family plan." and stops.
- **Edit and delete are the same quiet icons everywhere** — habits, people,
  diary entries and notebook notes had kept the old bordered buttons.
- **Settings → Instance lists the services beside the app** — the reminders
  timer, the weekly review mail, reconciliation and backups — blue when
  running, red with the command that fixes it when not. Reminders are judged
  by when they last asked the app, which is true whatever does the asking.
- The docs call Tasks "Tasks" and to-dos "to-dos"; installing on a phone now
  says what the Android package actually adds (the widget, and notifications
  that arrive as Ontoplano), that Firefox's menu item is "Add to Home screen",
  and what a self-hoster without HTTPS can still do (build the APK). The
  family plan has a page of its own.
- **A fresh clone's `make` offers only what a fresh clone can run.** The
  maintainer's targets — publishing the image and the APK, mirroring to
  GitHub, cutting a release, the staging build, the site's screenshots —
  moved out of the public Makefile into the private tooling behind
  `local.mk`.
- **The self-host Telegram bot is retired** — it predates the app, and the
  app does its whole job now. Scripts that push your day to a Telegram chat
  through the API keep working; they are your crontab, not a bot.
- **`make dev` works on a fresh clone**: it installs the dependencies and
  creates the data directory itself, instead of crashing twice before the
  server ever starts.

## 0.68.0 — 2026-09-04

- **Planner is called Tasks**, everywhere it is read.
- **Diary is called Notes, and holds two tabs: Diary and Notebooks.** Notebooks
  leaves the navigation bar and the wheel; it is the second shelf of the same
  room. The preference that hid it hides the tab instead.
- **A note can be filed into a notebook as it is written** — from the diary's
  form and from the capture wheel. The quick to-do's fold now says the notebook
  picker is in it, which it always was.
- **The keyboard cursor sits outside the card** it is on, instead of redrawing
  the card's own border — and it does not appear on a phone, where the cursor
  is your finger.
- **On a to-do, the down arrow pulls it onto today and the calendar delegates
  it to a day.** The calendar used to mean "today" and a person meant the
  calendar, which read backwards.
- **The Review's arrows hug the week they move**, the same shape the plan has.
- **Creating an account asks for the password twice.** It is the one password
  field where a typo has no way of being found out.
- **The Android widget opens the board.** Tapping a row used to open the
  widget's own setup screen — for a widget that was already set up.
- **A reminder on Android arrives as Ontoplano**, not as Chrome, once the app
  is updated: notifications are delegated to the app itself.

## 0.67.0 — 2026-09-04

- **A block can be ticked off from the plan.** Click it, and "Mark as done"
  leads the form's footer, next to Skip; ticked, the same button undoes it and
  the grid shows the tick in the block's corner.
- **The History tab is gone.** It drew last week as a table, missed one-off
  blocks entirely, and the plan itself walks backwards now. Old links land on
  the plan, on the week they named.
- **Early, on time and late are gone too.** Ticking a day off at bedtime marked
  everything late, correcting it was a chore nobody did, and nothing ever read
  the answer back. Done is done.
- The planner's arrows hug the date they move, instead of the right one sitting
  at the far edge of a wide screen.

## 0.66.0 — 2026-09-04

- **The planner goes back.** The window walks a whole week — or day, or month —
  into the past instead of stopping at today. Days that have been are washed
  grey, and every block on one carries a tick or an empty box in its corner, so
  the plan is also the record of what happened to it.
- **The demo has a waiting room.** Making a copy of the app for a visitor writes
  an account and seeds a week, which used to be a blank page for however long
  that took. It now says what it is doing while it does it.
- **The tour stops ending by pointing at the button you pressed to open it.**
  The tour that runs unasked on a new account still says where to find it again.
- **ontoplano.com sends somebody who is already signed in to their week**, rather
  than showing them the pitch. A link from the app, a link to a section, and
  `?stay` all still reach the page itself.

## 0.65.0 — 2026-09-04

- **A family plan is quoted the family price.** The billing page read the list
  price whatever the account was on, so a household paying for five accounts was
  shown the solo rate and offered a yearly saving that was not theirs.
- **Family is its own tab**, for the payer and for anybody on somebody else's
  plan. Managing seats was a card at the bottom of Billing, which a member —
  who has no billing page — could not reach at all.
- **"Somebody else's plan should cover me"** on the billing page, with a picture
  of what to ask them for. The only route before was to buy a second
  subscription.
- **A card's buttons are blocked into its corner**, edit and its friends on the
  top line and delete on the bottom, the same way on ideas and on to-dos.
- **Marking an idea applied is no longer an edit of it** — it stamped the idea,
  which added "· edited" to the card and reflowed everything under it.
- **A block half scrolled out of the grid keeps its name above its time.** They
  were pinned separately, so as the block left the two met on one line.
- Adding a quote shows what one looks like, and the paste box no longer explains
  itself in terms of commas.

## 0.64.0 — 2026-09-04

- **The loading bar at the top is the only thing a slow page shows.** The
  page-shaped placeholder went with it: it could be left on screen by a
  navigation that never resolved, which is worse than a blank wait.
- **The quick capture fields stop the phone offering passwords and cards.**
  Android decides that from the element, not the attributes, so the first
  field of a quick todo or a quick buy is a one-line text area that still
  saves on Enter.
- **"Todo" is written "To-do"** everywhere it is read rather than typed.

## 0.63.0 — 2026-09-04

- **Forms stop blanking themselves on the way out** — the quick capture ones
  included, which had written the reset out in full and survived the last sweep.
  A test now refuses any form that resets and then closes, because this is the
  third time it has come back.
- **The phone keyboard stops offering addresses on a new todo.** Chrome reads a
  field called `title` as an honorific prefix — Mr, Mrs — so a task title was,
  to it, part of a saved address. Everything called `title` is `heading` now,
  and the rule that catches it knows the name.
- **The bar reads home, search, plus, account** — the one destination nobody
  visits twice a day was under the first thumb.
- The wheel's big label follows the bar rather than the pointer, so a narrowed
  desktop window gets it too.
- A slow navigation shows the shape of the page that is coming, instead of the
  whole page sliding in from the left on every navigation.
- **A notification that does not arrive says which device and why.** "Sent to 1
  of 2 devices" is true and useless; a subscription made against a key the
  instance no longer has is now named, explained and dropped rather than retried
  forever.

## 0.62.1 — 2026-09-04

- **Billing worked in the build and not in the running app.** The payment
  provider was compiled in and then discarded on every start by a guard that
  tested, at run time, something Vite resolves at build time — so an instance
  that sells could not, and nothing anywhere said so. It has been that way since
  the payment code moved to its own repository.

## 0.62.0 — 2026-09-04

- **The reminders timer costs a request, not a process.** It ran `npx tsx` every
  minute — a fresh Node, a fresh compile of every service it touches and a fresh
  database handle, three seconds of CPU and a hundred megabytes to usually send
  nothing. It asks the running app now: eighteen milliseconds.
- **A build that dropped the payment provider is refused before it ships.** The
  file can be sitting in the tree and absent from the build — Vite resolves
  `import.meta.glob` once and caches it — which produced an instance that could
  not sell and looked exactly like one that could.

## 0.61.0 — 2026-09-04

- **The wheel says what is under your thumb**, at the top of the screen, in the
  section's own colour — the finger covers the wedge it is on, which was the one
  thing the gesture depends on. The wedges keep their icons.
- **The dashboard has your latest todos and your latest ideas**, and the todos
  can be flipped oldest-first. The four capture tiles are gone from the phone:
  the + in the bottom bar is the same four, under your thumb, costing no room.
- Todos are newest first, with a button to reverse it.
- **An assistant can break a goal into tasks.** `add_todo` takes a goal, and
  `link_to_goal` attaches work that already exists — additively, so it cannot
  quietly unlink everything it did not know about. `unlink_from_goal` is the way
  back.
- **And it can correct a week that has already happened**: `past` lists the days
  behind with what each block was answered, which is what `finish_block` needs
  to change one.
- A page slides in when you go somewhere, and a bar across the top says a slow
  one is loading.
- The tag list on Ideas and the subscribed-calendars panel start folded.
- On a phone the docs open on the page you followed a link to, rather than
  under the whole index.

## 0.60.0 — 2026-09-04

- **An assistant can undo what it does.** Over MCP it could tick a shopping item
  bought and never untick it, finish a todo and never reopen it, close a goal,
  add an idea — all one-way. So tidying a list meant deleting a row and retyping
  it, losing its category, its notes and its price history. Six tools added —
  `untick_bought`, `snooze_item`, `unsnooze_item`, `reopen_todo`, `reopen_goal`,
  `remove_idea` — and a block's answer can be taken back.

## 0.59.0 — 2026-09-03

- **"Send a test" under Settings → Preferences.** Six things stand between
  pressing allow and a phone buzzing; this walks all of them for real and says
  which one broke, instead of leaving you to set a reminder and wait.
- The reminders job says what it did on every run — how many devices are signed
  up, whether the instance has keys at all — rather than being silent whether it
  works or not.
- `/healthz` reports whether the instance can take money, so a deploy can check
  it: a build made without the payment provider is invisible from the outside,
  and used to be found hours later on `/admin`.
- The health warnings include load per core, which is the number that moves
  first when people arrive.

## 0.58.3 — 2026-09-03

- **A form no longer blanks itself on the way out.** Saving an edit emptied
  every field for a frame before the dialog closed — most visible on a phone,
  where the round trip is longer. Thirty-two forms across the app did it.
- **The billing warning names what is missing.** "No working payment provider"
  is true and useless; it now says which settings are unset, or that the build
  has no provider in it at all.
- `make billing-setup` asks for the family prices, and its flip step sets
  `ONTOPLANO_SELLS` — removing the self-hosted line is not the same as saying
  this instance charges people.

## 0.58.2 — 2026-09-03

- **The scheduled jobs run on the server.** `$lib` is resolved through a
  tsconfig the build generates and the deploy never sent, so the reminders, the
  weekly mail and the nightly reconcile all died on it. The deployed directory
  gets a tsconfig of its own, and `tests/jobs-as-deployed.sh` runs every job
  from a copy of exactly what the deploy sends — which is the only check that
  could have caught any of the three ways this has now failed.

## 0.58.1 — 2026-09-03

- **The reminders job runs where it is deployed.** Turning a service's refusal
  into an HTTP answer needed SvelteKit, which is a development dependency, and
  every service imported it for its error classes — so the scheduled jobs died
  on a box that installs production dependencies only. Those two helpers live
  apart from the error classes now, which is also where the architecture always
  said they belonged.

## 0.58.0 — 2026-09-03

- **Charging for accounts is opt-in**, with `ONTOPLANO_SELLS=true`. Nothing else
  implies it, so a copy that never mentions money never asks for a card and
  never refuses anybody.
- **An instance that means to charge and cannot now refuses registrations**
  instead of handing out free trials. It used to be indistinguishable from a
  self-hosted copy, so a production instance with billing not working gave every
  new account fourteen free days, silently, for as long as nobody looked.
  `/admin` says so in one sentence at the top of the page; invitations still
  work, and existing accounts are untouched.
- **Timezones are a list from west to east** — GMT−11 down to GMT+14 — instead
  of continents in alphabetical order. What anybody knows about their own
  timezone is roughly what it is offset by.
- **Buttons look pressable again.** Tailwind v4's reset had left every button in
  the app with the plain arrow cursor while every link said otherwise.
- Resetting the demo account closes the menu and says it worked.
- **The scheduled jobs had never run.** The reminders, the weekly mail and the
  nightly billing reconcile were all pointed at the source checkout, which has
  no dependencies installed — each died on its first import, in silence.

## 0.57.3 — 2026-09-03

- **The Docker image would not build.** better-auth is constructed the moment
  its module is imported and refuses to exist without a secret — correctly for a
  server, wrongly for a build, which has no environment and needs none. A build
  with nothing configured now finishes, and CI does one on every push so it
  cannot break again unnoticed.
- **An administrator can delete an account**, from that account's page in
  `/admin`, by typing its address. Not a second click: this is the one action
  with nothing behind it to restore from, and typing the address is what catches
  having the wrong account open. Your own account and the instance owner's are
  refused outright.

## 0.57.2 — 2026-09-03

- **Every list an assistant reads over MCP works again.** The shopping list, the
  todos, the notebooks and the ideas answered with a bare list where the protocol
  requires an object, so a strict client refused all of them while writes went
  through — it looked like one broken tool and was every read. A list now arrives
  as `items` with a `count` beside it.

## 0.57.1 — 2026-09-03

- **The planner scrolls with a finger on a block.** Blocks are big targets and a
  full day has no gaps between them, so the afternoon could only be reached by
  finding empty space. Holding still on one still picks it up.
- Tapping a block no longer leaves a small card stuck over the grid.
- Schemes are readable on a phone: the name has its own line, and the warning
  before loading one is a sentence rather than a button the width of the screen.
- The address box for a calendar you subscribe to is no longer two characters
  wide on a phone.

## 0.57.0 — 2026-09-03

- **Reminders reach your phone with the app closed.** Until now one only
  appeared if you already had the app open in front of you — and on a phone it
  never appeared at all. Turn notifications on under Settings → Preferences, once
  per device.
- **Birthdays tell you.** A person with a birthday is announced on the morning of
  it, at the hour your own day starts, and the reminder leads to them. There is a
  box beside the date for the birthdays you keep and do not celebrate.
- **The service worker was never running.** It has been built and shipped on
  every release and registered by nothing — so the offline page, the shopping
  list without a signal, and every notification with them.
- A page in a background tab keeps checking for reminders, five minutes apart,
  instead of going silent until you look at it.
- **The family plan can be bought.** Pressing "for the family" on the front page
  reached a card page that only ever sold one seat. Both plans are offered there
  now, opening on whichever was chosen.
- The planner keeps the hour you were looking at when you zoom, instead of
  jumping back to the start of the day.
- A reminder card no longer lies across the middle of the menu you are using.
- A day with a start hour and no end hour drew the default hours instead of the
  ones set.

## 0.56.0 — 2026-09-03

- **Confirming your address no longer skips the card.** The link in the
  confirmation mail pointed straight into the app, going round the one page that
  decides what comes next — so on an instance that sells, registering and
  confirming let somebody in free. It goes back through that page now.
- **A moved block keeps its length.** A ninety-minute block came out of a move as
  sixty: the length was read from the one-day override, which is empty unless
  that day had been resized.
- **A one-off keeps its category.** A block that takes its category from its
  activity read as uncategorised everywhere the schedule API is used — which
  became visible the moment a moved block became a one-off.
- **The planner keeps its scroll** when something changes underneath it. An edit
  at eight in the evening used to throw the view back to six in the morning.
- Loading a scheme says what it replaces: the repeating week, leaving one-off
  blocks where they are.

## 0.55.0 — 2026-09-03

- **An assistant can move a block now, instead of improvising one.** Asked to
  push something to four o'clock it had only _add_ and _mark done or skipped_ —
  so it added a second copy at the new time and marked the original **skipped**
  to clear the first off the grid. The day then held a duplicate and a skip that
  never happened, and a skip is what the weekly review asks about. `change_block`
  moves, retimes, lengthens and renames; `cancel_block` takes something off a day
  because it is not happening, which is a different thing from failing to do it.
- **Six other ordinary things it could not say**: that a habit was kept, how a
  goal ended, that a todo is off its day or not wanted at all, and that something
  is off the shopping list.
- Renaming a block that was a named activity now shows the new name and keeps the
  part of life it belonged to.

## 0.54.0 — 2026-09-03

- **The planner grid scrolls again, and shows the whole day.** A day set to end
  at midnight drew as far as the late afternoon and stopped, with no scrollbar
  and nothing below it: the calendar's scroll container is a `<section>`, and
  the rule that rounds the corners of every card clips those. On a tall screen
  with the default hours it looked fine, which is why nothing caught it.

## 0.53.0 — 2026-09-03

- **The timezone is chosen, not typed.** It was a text box wanting
  `America/Sao_Paulo`; get a letter wrong and every date in the app is a day out
  with nothing on screen to say why. It is a list now, grouped by part of the
  world, each entry reading as a place and the offset in force today — on first
  run and in preferences both.
- **Any currency, not eight.** The shortlist stays for one click; beside it is a
  field for anything else, checked against the platform's own list and shown
  back as a price and the currency's name before it is saved. Prices in
  currencies with no minor unit — won, yen, króna — and with three of them —
  dinar — are no longer stored a hundred times wrong.
- **Ticking something off Today's tasks can be undone.** It was the one place
  left that wrote the moment it was pressed, and it is a column of checkboxes
  beside eight lines of small type.
- **People in a diary entry wear an `@`**, the way tags wear a `#`. Same chip,
  same row, two different kinds of thing, and nothing said which.

## 0.52.0 — 2026-09-03

- **The weekly review is off until you ask for it**, and it arrives at your own
  hour: the start of your planner's day plus an hour, in your timezone. Mail
  nobody asked for is spam however useful it is, and the app should not decide
  when your morning starts.
- **The mark in the middle of the phone bar no longer jumps sideways when you
  press it.** It moved forty-two pixels left for as long as a finger was on it,
  which is the whole of the gesture — so the wheel opened beside the mark
  instead of around it.
- **What the app can import is listed in one place**, and `/api/imports` is how
  anything outside reads it. The import page and ontoplano.com's FAQ are both
  written from it, so a new importer reaches them by being built.
- The family plan no longer needs a switch of its own. It briefly had one when
  the payment provider left the repository; the product offers a family plan,
  and a second variable saying so was a thing to remember to set.
- The two links on the signed-out front page follow the deployment they are on,
  so a staging instance no longer sends you to production to read its own hero.

## 0.51.0 — 2026-09-03

- **An Obsidian vault comes in.** Settings → Account → Bring things in: choose
  the vault's folder and every note becomes an entry in one notebook, keeping
  its text, its `#tags`, its frontmatter tags and the folder it was in. Nothing
  is uploaded — the notes are read in the browser — and deleting the notebook
  undoes the whole import. Attachments, canvases and plugin data stay in the
  vault, which is the honest boundary: those are Obsidian's, not markdown's.

## 0.50.0 — 2026-09-03

- **A third example plugin: a CSV of measurements becomes a data stream.**
  `examples/onto-readings.mjs` takes the export every bathroom scale, sleep
  tracker and blood-pressure cuff produces and turns each numeric column into a
  charted stream you own. Run it again on a longer export and nothing is added
  twice. It reads a file rather than talking to Withings or Garmin on purpose —
  a plugin holding somebody else's credentials changes the question from what it
  does to who else can read your weight.

## 0.49.0 — 2026-09-03

- **A week reads as a schedule again.** Every block used to be its category at
  full strength, so six hours of work on a Tuesday was three hundred pixels of
  solid blue and a full week was a colour chart — every block shouting equally,
  which meant none of them said anything. A block is now a tint of its category
  with the colour down its edge: you can see the shape of the week, the gaps,
  and the grid's own hour lines through it.
- **A block says when as well as what**, on a second line under its name,
  wherever there is room for one. Too short for that and the name survives
  alone; too short for a word and it is a solid mark in its colour rather than
  a pale smudge.
- Schemes moved into the toolbar. It had a line of its own above the grid
  reading "SCHEMES SHOW", which is not a control.

## 0.48.0 — 2026-09-03

- **A mailing list, for instances that want one.** One field in the footer of
  ontoplano.com: an address, a confirmation to follow, and one click in every
  message to stop. Nothing is ever sent to an address that did not answer the
  confirmation, and nothing at all is sent until there is something to say. Off
  unless `[newsletter] enabled` says otherwise, so a self-hosted install carries
  an empty table and no public endpoint.

## 0.47.0 — 2026-09-03

- **The weekly review arrives by mail.** On Monday morning, one message saying
  what last week was — how much of what you planned you did, where most of it
  went, and what is still sitting there — with a link to the page where you
  close it. Nothing is sent about a week you did not plan, nothing is sent
  twice, and every message carries a link that stops them in one click with
  nothing to sign in to. Turn it on or off under Settings → Account.

## 0.46.0 — 2026-09-02

- **This repository no longer contains any payment code.** Taking money is not a
  property of the software: what remains here is an interface, an implementation
  that answers "this instance takes no payments", and an empty slot a build that
  sells copies one module into. A self-hoster reading this repo no longer reads
  the plumbing of somebody else's business, and nothing about the app changed
  for anybody using it.
- Everything about **entitlement** — the plan, the trial, the seats, the
  ceilings — is unchanged and still here. `docs/PLANS.md` replaces
  `docs/BILLING.md` and says what a plan decides, plus what writing your own
  provider takes.
- **The configuration reference lists the pricing variables again.** It is
  generated by scanning the source for the variables it reads, and the scan only
  recognised them written out in full — so the seven `ONTOPLANO_PRICE_*` and
  family settings, which `settings.ts` reads through a helper, had never
  appeared in the table at all.

## 0.45.0 — 2026-09-02

- **Escape closes the quick-write forms again.** The dashboard's own Escape
  handler was cancelling the dialog's built-in close, so `i`, `t`, `n` and `b`
  opened something that only the × and the backdrop could shut. The same was
  true on the diary, the shopping list and the ideas page.
- **Undo covers more of the moves you make without looking**: skipping a block
  as well as finishing one, on the board and on the dashboard, and closing a
  goal as achieved or missed. Nothing is written until the window closes.
- **The demo tidies up after itself.** Expired accounts were only swept when a
  _new_ visitor arrived, so a demo nobody new came to never cleared — including
  your own session, which is why it never went away.
- **The demo can be reset**, from where Sign out would be: everything goes back
  to the fixtures a first visitor is given, without ending a session you cannot
  restart.
- Everybody on the demo's people page has a face, not just Ana.

## 0.44.0 — 2026-09-02

- **The page updates itself while something else is writing.** Ask an assistant
  to skip a block or add a todo and every tab you have open shows it, without a
  reload. It waits while you are typing and while the tab is in the background,
  and catches up the moment you come back.
- The mark in the middle of the phone's bottom bar is a third bigger than it
  was, rather than half again.

## 0.43.0 — 2026-09-02

- **An assistant can change your week, not only read it.** Two new tools behind
  a new permission, `schedule:write`: `add_block` puts a real block on a day —
  a title, a start time and a length — and `finish_block` answers for one that
  is already there, done or skipped. Asked to "skip the gym and put deep work on
  from 9 to 11", an assistant could previously do neither: it wrote a todo with
  the time inside its title and left the gym unanswered.
- Answering for a one-off block over the API no longer says "task not found"
  before that day has been opened in the app.

## 0.42.1 — 2026-09-02

- **The mark on the phone's bottom bar is half again as big**, which is the size
  it should have been for the one control there that opens a gesture rather than
  a page.

## 0.42.0 — 2026-09-02

- **The demo was losing most of its own contents.** The seed reads photographs
  off disk, the deploy did not carry them to the box, and the read threw — so
  the seeding stopped a third of the way down and everything after it, a
  notebook's worth of reading notes and nine weeks of history included, was
  never written. The pictures ship now, and a missing one is a warning that the
  seed carries on past rather than the end of it.
- **You cannot sign out of the demo any more**, because there was no way back
  in: the account has no password anybody knows, so leaving it ended the visit
  for good. The button is gone and the door refuses.
- **The demo's integrations page can be read and not used.** It was minting
  real API tokens and calendar links against the demo account; now every button
  on it answers "You're not allowed to do that in the demo."
- A picture in the trip notebook, beside the one in the kitchen notebook.

## 0.41.1 — 2026-09-02

- **A token you just made says how to use it with an AI assistant**, with a link
  to a page that carries a prompt you can paste — token included — instead of
  leaving you to work the connection out.
- Two permissions said too little about themselves: `webhooks:manage` now says
  it lets an app send itself a message when something changes here, and
  `today:read` has stopped insisting on what it does not do.

## 0.41.0 — 2026-09-02

- **Signing in is an address and a password.** "Continue with Google" and
  "Continue with GitHub" are gone, and there is no setting that brings them
  back: an account on your own instance should not depend on a company neither
  of us controls, and a self-hosted app whose front door is somebody else's
  service is not really self-hosted.
- **Habits are their own permission.** `today:read` — the scope the phone
  widget's token holds — used to hand over which habits you had kept as well as
  what was on your day. It does not any more; that is `habits:read`, granted
  separately or not at all, and the widget does not ask for it.
- **The bottom bar answers a touch**, instead of looking dead until the next
  page arrives.
- **The demo has real pictures**: a face on a person, a photograph in the
  kitchen notebook, food on a recipe card, in place of three coloured
  rectangles.
- The section wheel's longest name fits inside its slice again.
- The documentation page about assistants is **Using with AI agents**, and the
  app calls it an AI assistant everywhere it appears.

## 0.40.0 — 2026-09-02

- **Ontoplano installs from a package.** A `.deb` for Debian, Ubuntu, Mint and
  Pop!\_OS, an `.rpm` for Fedora, RHEL and openSUSE, and a PKGBUILD for Arch. One
  command, a service that starts on boot, and upgrades through the package
  manager you already use — `sudo ontoplano config`, then
  `sudo systemctl enable --now ontoplano`.
- It installs as a **system service** with an account of its own that can reach
  one directory and nothing else, keeps your database at
  `/var/lib/ontoplano/ontoplano.db` and your settings at `/etc/ontoplano/`, and
  generates the session secret once so an upgrade never signs anybody out.
- An `ontoplano` command comes with it: `status`, `logs`, `config`, `migrate`,
  `version`.
- Building a package no longer prunes the repository it is built from, which
  left a development tree that could not build and a yarn that would not fix it.
- **The documentation says where Windows stands** — there is no installer yet,
  WSL and Docker work today, and building one is a good first contribution.

## 0.39.2 — 2026-09-02

- **An import no longer takes your subscription with it.** Restoring an export
  replaced the whole account, including the rows this instance issues rather
  than exports — the plan, the payment, the API tokens, the calendar link — and
  left a paid account looking like a fresh trial. It now replaces only what the
  file actually carries, and writes a copy of everything it is about to destroy
  first, in case something goes wrong anyway.
- **Notes written in a notebook take pictures**, the same way notes written in
  the diary always could.
- **A person's face is the way to their picture** — the circle beside the name
  opens the form, rather than the picture control hiding inside Edit.
- **The demo forgets you sooner**: a demo account now expires 30 minutes after
  its last visit rather than three hours.
- The documentation's search carries the app's magnifier and its ⌘K hint, so
  the shortcut is visible in both places.
- The main menu button and the room wheel are bigger.

## 0.39.1 — 2026-09-02

- **Choosing a picture is the whole gesture** — there is no second button to
  press, in a note, on a recipe or on a person.
- **A picture that is too big says so before it is sent**, with both numbers,
  instead of a 500 page reading `JSON.parse: unexpected character`. A refusal
  the server explains now reaches you in its own words.
- **People have a face.** One picture each, shown beside the name, so a list of
  people is a list of people.
- **A recipe's picture is a square** on the cookbook cards rather than a
  letterbox strip across the top.
- **The documentation has search** — the same four-letter matching the app's
  command palette uses, over every heading on the site. `/` or ⌘K opens it. The
  assistant has a page of its own there now.
- The verification screen no longer offers to skip, because on an instance that
  requires a confirmed address the link came straight back.

## 0.39.0 — 2026-09-02

- **Setting up asks one thing at a time.** Where you are, when your week
  starts, which rooms you want, how it should look, and what to start from —
  five questions with Next between them, instead of one page of fields to fill
  in before you have seen anything.
- **You choose your rooms on the way in.** Everything is on to begin with; turn
  off what you will not use and the description beside the list says what each
  one actually is. Preferences has the same list whenever you change your mind.

## 0.38.0 — 2026-09-02

- **Pictures.** Paste a screenshot into an entry, drop one in, or press the
  button — it lands in your writing as something you can move and delete like
  any other line, and it is stored in the same file as everything else, so it
  travels with your export.
- **Recipes have a gallery.** Up to six pictures each, and the one you star is
  the one the cookbook shows — so a list of forty recipes is something you
  recognise rather than read.
- **The instance decides the ceilings** — how big a picture may be, how many a
  recipe or an entry may carry, and what your pictures may add up to — in
  `[media]` in `config.toml`.

## 0.37.0 — 2026-09-02

- **You can hand an assistant the keys.** `POST /api/mcp` is a Model Context
  Protocol server: point Claude or anything else that speaks MCP at it with an
  API token and it can read today, search everything you have written, add and
  finish todos, write a diary entry, catch an idea, work the shopping list and
  add a recipe. It is offered exactly the tools the token's scopes reach, and
  the scope is checked again on every call.
- **Seven new scopes to grant it**, and a button on the token form that ticks
  the set an assistant needs rather than making you find them among eighteen.

## 0.36.0 — 2026-09-02

- **A staging instance behaves like the real one.** It used to open
  registration by itself, run as self-hosted and skip the verification mail —
  three things the instance it stands in for never does, so the copy people
  tried was the copy nothing else ran. Now the only difference is the label.
- **And it says so on every page**, not just on the way in. Signed in, staging
  used to be indistinguishable from the instance you actually use.
- **Installed side by side.** A staging copy on your phone wears a marked icon
  and its own name, so two of them on one home screen cannot be confused — and
  `make android-staging` builds one that installs beside the real app instead
  of over it.

## 0.35.2 — 2026-09-02

- **The tour stops repeating itself at the end.** The dashboard's last card
  pointed at the help corner and the card after it pointed at the same corner
  again, saying the same thing.

## 0.35.1 — 2026-09-02

- **A dark button keeps its label under the pointer.** Hovering a primary
  button — "New goal", "Save", anything filled — repainted its label into the
  colour of the button itself, so the words vanished until you moved away.

## 0.35.0 — 2026-09-01

- **The app shows you around.** On a new account, and on every visit to the
  demo, the screen dims and the tour points at one thing at a time: the rooms,
  the wheel under your thumb, the way to write something down before you have
  decided where it goes. Dismissing takes two clicks — the first one shows you
  where the tour lives afterwards.
- **Every room has a tour of its own**, and the question mark in the corner
  opens the one for whatever you are looking at. Beside it: a keyboard, which is
  the list of keys that used to be behind that question mark, and a book, which
  opens the documentation. On a screen nobody has written a tour for yet, the
  question mark is red and says so.

## 0.34.2 — 2026-09-01

- **The default theme has the right colours in a dark room.** Anybody who never
  picked a theme was getting light-mode reds, blues and greens on a dark ground
  — an error message in crimson on near-black, and a row that barely changed
  under the pointer.

## 0.34.1 — 2026-09-01

- **No more Home tab.** The ontoplano wordmark in the corner has always been
  the way back, and the tab beside it was the same door drawn twice — one that
  a saved menu order had quietly pushed to the far end of the bar.

## 0.34.0 — 2026-09-01

- **Google Keep comes in too.** It is a different product from Google Tasks and
  Takeout writes it as one file per note, so choose all of them at once: a
  checklist arrives as one todo per line with its ticks, a written note as one
  todo with the text in its notes. The bin is left where it is.
- **The first recipe on a new account keeps its ingredients.** An ingredient
  has to land in a shopping category that holds food, and a fresh account has
  no categories at all — so pasting a list added nothing and said nothing. One
  called Food is made on the spot now, and if you have categories and none of
  them holds food, it says so instead of shrugging.
- **Clicking a number box selects what is in it.** Typing 2 into a field
  showing 0 gives 2, not 02 — everywhere in the app, not only where somebody
  remembered.
- **Bringing things in has a page of its own**, under Account → Bring things in.
  It was two long forms between the sessions list and the delete button.

- **A recipe now comes in as a paste rather than a link.** Select all on the
  recipe page, copy, paste: the title, ingredients, method, servings and time
  come with it, read from the structured data the site already publishes. The
  link box is gone — an instance fetching an address somebody typed can reach
  everything the machine it runs on can reach, and that is not a door worth
  having on somebody else's server for the sake of one step.

## 0.33.0 — 2026-09-01

- **A second example plugin**, and the one to read first: `onto-morning.mjs`
  sends today's blocks, the habits still due and anything carried over to ntfy
  or Telegram, from one crontab line. One token holding one scope, one GET, no
  dependencies and nothing running the other twenty-three hours.

## 0.32.1 — 2026-09-01

- The keyboard no longer hides the Save button. A form on a phone is a
  full-height sheet, and the keyboard covers that height rather than shrinking
  it — so confirming what you had just typed meant dismissing the keyboard
  first. The sheet now fits the part of the screen you can actually see.

## 0.32.0 — 2026-09-01

- **A recipe from a link.** Paste the address of a recipe page and its title,
  ingredients, method, servings and time come with it. It reads the structured
  data almost every food site already publishes for Google, so it does not
  break when a blog is redesigned — and it says so plainly when a page has none
  rather than making an empty recipe.
- The README no longer advertises a page that was removed, and now mentions
  recipes, reminders, the weekly review, the calendar feed and taking your data
  out. Docker is the first way offered to run it rather than the last.

## 0.31.0 — 2026-09-01

- **A reminder can be any number of minutes before a block**, typed, with the
  usual few as one-tap shortcuts that write into the same box. Six fixed
  choices were a guess about somebody else's life — 45 minutes for a commute,
  three hours for a flight.
- `make dev-docs` and `make dev-site` serve the wiki and the marketing site
  locally beside `make dev`, and `make dev-all` runs the three together. All of
  it needs nothing but this checkout.
- Restoring an account is checked against the whole seeded database now, so a
  table that stops travelling fails the build instead of being noticed a year
  later by somebody missing a year of habits.

## 0.30.1 — 2026-09-01

- Connecting the widget shows the key as well as sending it, and the widget's
  setup screen has a box to paste it into. The link back is at the mercy of
  which app Android decides should answer it; pasting a key is not. The page
  also stopped refusing to run inside the app — which is the one place the
  widget's own setup opens it from.

## 0.30.0 — 2026-09-01

- **Dragging a card can reach a column that is not on the screen.** On a phone
  the board shows one column, so the names above it are the target now: they
  light up while a card is being dragged, and dropping on one moves the card
  and follows it there.
- The raised button in the middle of the phone bar is the mark itself — the
  octagon, edge to edge — rather than the octagon inside a circle. Its outline
  is measured from the logo, so replacing the logo reshapes the button.

## 0.29.0 — 2026-09-01

- **A reminder belongs to a block now, and to nothing else.** Say it once when
  you make or edit the block — "thirty minutes before" — and every occurrence
  of it gets its own nudge. There is no separate reminders page and no reminder
  about nothing: those were the thing that could be created and then appeared
  in no list anywhere.
- Todos have no reminders, because they have no time. Wanting to be reminded of
  one is wanting it to happen at a time: give it a day and a time, and the block
  takes the reminder.
- Reminders made before this still arrive until they are dismissed.

## 0.28.0 — 2026-09-01

- **One list for the menu.** Preferences had three sections naming the same
  rooms and asking one question of each — order, shown, colour. It is one row
  per room now, holding all three, and a room you put away drops to the end
  greyed out with no number. Home is not listed: it is always on and is not on
  the wheel.

## 0.27.0 — 2026-09-01

- **The planner's header is one row and its arrows are at the edges.** Back and
  forward sit at the two ends of the screen at the size of a thumb, with the
  date between them. In day view it says one date rather than "Sep 1 — Sep 1",
  and the full-width Today button that moved nothing is gone.
- Clearing every block in the week at once is no longer a button. Schemes are
  deleted one at a time, which is the only pace at which that is a decision.
- One page in the documentation about the phone, opening with the two ways to
  install and what each costs you, and a button to the app on every docs page.

## 0.26.0 — 2026-09-01

- **An export can be put back.** Settings → Account → Restore an export takes a
  file from any ontoplano instance and rebuilds this account from it, which is
  what makes moving between instances — or off one — a thing you can actually
  do. It replaces rather than merges, asks for a typed word first, and either
  all of it lands or none of it does.
- Billing, API tokens, calendar feed addresses and the audit log deliberately
  do not travel: they belong to the instance that issued them. Everything you
  wrote does.

## 0.25.1 — 2026-09-01

- The page shown when the app is not answering is 9kB rather than 900kB. It
  carried the launcher-sized logo whole; it draws it at the size it shows it
  now, which matters on the one page that has to arrive when nothing else is.

## 0.25.0 — 2026-09-01

- **The menu is yours to arrange.** Settings → Preferences → The menu sets the
  order the rooms appear in, along the bar and round the wheel at once — they
  are two renderings of one list and always agree.
- **And to colour.** Each section's colour is a setting, with the ones the app
  ships as the defaults and one click back to them.
- The wheel starts at the bottom right and runs anti-clockwise, so the first
  room in your list is the one under your thumb. It used to start at twelve
  o'clock, which is how a clock works and not how a hand does. There is a
  picture of it in the docs, linked from Preferences.
- A page in the documentation that asks what phone and browser you have and
  then shows only those steps, including how to get the Android package —
  which is the only way to have the home-screen widget.

## 0.24.0 — 2026-09-01

- **Docker is the easy path now.** One `docker run`, one volume, no database
  server, and migrations that apply themselves when the container starts. It
  runs as a normal user rather than root, stops when it is asked to, and the
  compilers that build it are left behind in an earlier build stage.
  `docs/DOCKER.md` covers the reverse proxy, upgrading and backups.

## 0.23.1 — 2026-09-01

- Connecting the home-screen widget works again. Its setup opened the connect
  page inside the app rather than in a browser, so the last step — a link back
  to the widget — came round to the same page and asked "Continue?" forever.
  The page also says so now if you reach it from inside the app, rather than
  minting a key that cannot be delivered.

## 0.23.0 — 2026-09-01

- **A new logo.** The favicon, the app icons, the home-screen icon and the mark
  in the app are all the puffin now, drawn from one file as before.

## 0.22.0 — 2026-09-01

- **A page for when the app is not answering.** A deploy, a restart or a crash
  used to leave whoever was mid-sentence looking at the web server's own grey
  "502 Bad Gateway". They now get an ontoplano page saying it is not answering
  and retrying on its own. It is one flat file with nothing outside it, because
  everything else needs the thing that is down.

## 0.21.0 — 2026-09-01

- **An invitation now hands over a free month, and works on an open instance.**
  Settings → Instance mints a code with a "Pro until" date on it, a month ahead
  by default, and a link that opens the register form with the code already in
  it. Whoever uses it starts on Pro, having given no card and spent no free
  days, and their billing page says when it runs out and what to do about it.
- The register form takes an invitation code even where one is not required —
  behind a line of text, so nobody has to read past a box they have no use for.

## 0.20.0 — 2026-09-01

- **Reminders have a page.** Planner → Reminders lists everything you have asked
  to be told about, waiting and already read, and is where you set one that is
  not attached to anything. A reminder about nothing could be created before
  this and then appeared in no list at all.
- The reminder card in the corner leads somewhere now: to the day's board, to
  the todo list, or to the reminders page, depending on what it is about.

## 0.19.1 — 2026-09-01

- Rearranging the dashboard no longer draws a second, empty card above each one.
  The handle sits on the card it moves, and the card says its name once.
- Small capitals stopped losing the tops of their letters — T and W most
  visibly — wherever a label had to be shortened to fit.

## 0.19.0 — 2026-09-01

- **A todo ticked off can be taken back.** Ticking one — on the board or in the
  todo list — puts a line at the bottom of the screen with a few seconds of Undo
  on it. Nothing is written until the seconds run out, so Undo is not a repair:
  the change simply never happened.
- Board cards have a tick box. Dragging is a mouse gesture and does not exist on
  a touch screen, which left a phone with no way to move a card out of a column
  at all; the card editor also names the four statuses now, so every move is one
  tap.
- The board on a phone shows one column at a time, with its name above it.
  Getting from Pending to Done used to mean scrolling sideways past a
  full-height Doing.
- The todo list beside Today no longer keeps everything you have ever finished.

## 0.18.0 — 2026-09-01

- **A family plan: one invoice, up to five accounts.** The payer adds people by
  email from Settings → Billing, and everybody keeps their own week — the only
  thing shared is the bill. A seat grants access and never the ability to spend,
  and taking somebody off a plan leaves their data untouched.
- New prices: $5.00 a month, $12.00 a month for a family of five, and 30% off
  either if you pay for a year. The yearly figures are worked out from the
  monthly ones, so the discount cannot drift from the sentence describing it.
- The signed-out front page's line comes from `config.toml` now, so whoever
  runs an instance can say what theirs is without editing the app.
- Dragging a block on a phone no longer scrolls the page at the same time. Both
  gestures were running at once, so neither finished.

## 0.17.0 — 2026-09-01

- **The price in the terms is the price the card is charged.** It came from
  this instance's settings, which could quietly disagree with what the payment
  provider would actually take. The provider is now the one place a price is
  set: the app, the terms and ontoplano.com all read it from there.
- Changing the view on the planner no longer shows a second of the wrong week.
  The button answers immediately; the grid waits for the data that matches it.
- A page on installing ontoplano on your phone: it is a web app, so there is
  nothing to buy and no store to go through.
- The documentation site has a 404 page of its own, with the contents list on
  it, instead of the web server's blank one.
- The demo says plainly not to put real data in it, and that the account is
  wiped.

## 0.16.0 — 2026-09-01

- **The weekly review's three answers now all mean the same thing: done with
  it.** Skipping a block set it to what it already was and left it in the list,
  so the same blocks came back every week; carrying one into the todo list made
  the todo and left the block there too, so pressing the button twice made two
  todos out of one block. Each answer now takes the row out of the list for
  good.
- A person can carry a birthday, a phone number and an email address. The
  birthday takes `--03-14` when you do not know the year, which is most of
  them.
- The section bar's icons are bigger and easier to hit on a screen too narrow
  to show their words.

## 0.15.0 — 2026-09-01

- **Paying is no longer something the app can fail to notice.** It learnt about
  payments in exactly one way — a notification from the payment provider — and
  when those stopped arriving, somebody who had paid, and had the receipt in
  their inbox, was sent back to the page that asks for a card. The app now
  writes down every payment window it opens and asks the provider what became
  of it: on the way back, and again nightly for anybody who closed the tab.
  Nobody who has paid is shown the pay page again.
- If a payment ever does arrive without its notification, the instance says so
  on `/healthz` and to whoever watches it — rescuing one person quietly would
  leave the same thing broken for everybody else.

## 0.14.0 — 2026-08-31

- **The front page is a door.** Signed out, `/` used to be a pitch: a headline,
  a price, a video, an argument for self-hosting. That belongs to whoever is
  choosing the software, not to whoever is running it — on your own instance a
  price is a bill you are not being sent. It is now the name, one line about
  what this is, and a way in. The pitch lives at ontoplano.com, and the hosted
  app has moved to app.ontoplano.com; old links to it still arrive.

## 0.13.0 — 2026-08-31

- The documentation site has a page on running it yourself: what it needs, three
  ways to start it, and where your data lives.
- An import is all-or-nothing. A file that fails halfway used to leave whatever
  had already landed behind, which is the one outcome nobody can recover from
  without checking every row against the app they came from.

## 0.12.0 — 2026-08-31

- **Bring your tasks in from Todoist or Google Tasks.** Settings → Account takes
  a Todoist project exported as CSV, or Google Takeout's `Tasks.json`, and turns
  it into todos — it works out which kind of file it is by itself. Everything
  lands in one notebook, so deleting that notebook undoes the whole import.
  Finished tasks are left out unless you ask for them, and anything it could not
  read — a section heading, a repeat rule where a date should be — is named
  rather than silently dropped.

## 0.11.0 — 2026-08-31

- **The demo gives you a copy of your own.** It used to sign everybody into one
  account and wipe the database every hour, so two people looking at once
  watched each other type and anything either of them broke was fixed by
  destroying the other's afternoon. Now arriving makes an account, seeded with
  a full week, that nobody else can see — and it deletes itself a few hours
  after you stop using it.

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
