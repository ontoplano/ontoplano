# Changelog

What changed for somebody using the app, newest first. One entry per
user-visible change, written when the change is made — the git log has the
rest.

Every entry sits under a version, and the newest heading is always the version
in `package.json`: adding a line means bumping. `scripts/check-changelog.mjs`
enforces that, from `make lint`, because the rule alone did not hold. There is
no "Unreleased" section, deliberately — it is where entries go to lose their
version.

Which number to bump: **the patch**, for the ordinary day's work, however much
of it there is. A batch of fixes and a handful of small features is a patch.
The **minor** is for a structural change somebody would notice as a different
app — the phone becoming one app instead of four, a room arriving or leaving,
the shape of the data changing. Bumping the minor per batch is what ran this
file to 0.161 in a few months, which tells a reader nothing about which
releases mattered.

## 0.183.3 — 2026-09-23

- **A recipe's page lines up.** Ingredients, method and pictures no longer
  overlap, their edges and headers match, and the buttons sit beside the
  recipe's name. The weekly review's two top cards and a notebook's header got
  the same fix.
- **The wheel names Inventory's tabs**, Stock and Wishlist, the way it names
  every other room's. The search box offers every tab of every room too —
  Workouts, Finance, Media and both Inventory lists were missing — and matches
  what you type against the words on your screen, in your language.
- **Stock is translated** into Portuguese, Spanish and German.
- **The goals toolbar is one row.** Area is a picker, Show closed is a toggle,
  and Areas sits quietly at the right.
- **A goal reads top to bottom.** Title, area and period first, then progress
  and measures; achieved, missed, edit and delete are icons on the right, and
  hovering lights the whole row to the card's edges.
- **Deleting a goal asks first, in its own dialog,** and says its linked tasks
  are kept.
- **j and k show which goal they are on,** and e edits it.
- **Rounded corners no longer leave slivers.** In the playful style, accent
  stripes, banners, the notebook list and its notes, and the dashboard's day
  columns meet their corners cleanly, and a short label no longer loses its
  first letter to a rounded edge.
- **A data stream's page stays inside Health.** Opening Sleep or Weight keeps
  Health's tabs on screen with that stream underlined, and Shift+H / Shift+L
  move between them as they do in the rest of the room.
- **The account menu takes you to Instance and Administration.** Whoever
  can open those pages finds them under AI & Integrations; nobody else sees
  them.
- **New, on a notebook's tab, opens the room's own form.** Pressing New item,
  New bill, New ledger, New habit, New workout or New recipe inside a notebook
  used to take you to that room and file whatever you wrote back under the
  subject afterwards. It opens the same dialog the room opens, in the notebook,
  with everything that form asks — a bill written against a subject can say
  when it falls due, and a workout can name what it measures.
- **Every one of those forms asks which notebook it belongs to.** In the room
  the field starts empty; inside a notebook it starts on that notebook, and
  editing something from the room never quietly takes it out of one.
- **The rating gauges stand on something you can see in the dark theme.** The
  box behind them is a ruler — it says how big a five would be — and it was the
  grey that sits one step above a card in the light theme, which in the dark
  one is within a hair of the card itself. It has an answer per theme now.
- **Inventory is two tabs: Stock and Wishlist.** They were one list with a
  segment over it — All, Restock, Wishlist, Short — which read as four equal
  readings of one thing. What you keep and how much of it is one question; what
  you might buy one day is another. Each is a tab with an address of its own,
  and "short" stays where it belongs, a filter beside the others on the
  cupboard. Every old link to /inventory still lands on the cupboard.
- **The shelf of notebooks squeezes down to one cover.** Dragging the list
  narrow stopped a long way short of that, leaving a single cover beside a band
  of space too narrow to hold a second and no way to take it in further. The
  panel has its own floor now — the width of one cover — rather than the one
  meant for a column of names.
- **The mailing-list form stops promising an email.** "Check your inbox — there
  is one link to follow" was the answer for a while after the confirming
  message stopped being sent. An address is on the list the moment it is typed,
  and the form says so: "You're on the list."
- **A task's labels are at full strength again.** They share a line with the
  row's buttons, and that whole line was faded until the pointer was on it — so
  a label's ink came out a grey nobody could read. The fade belongs to the
  buttons. The buttons, in turn, now come back when the row is under the
  pointer, which they had stopped doing.
- **The number in the task form says which row this is.** It counted against
  every open task in the notebook whatever the list was doing, so opening the
  top row of a list ordered by when things were added was told it was third.
  It is the list on screen now — same rows, same order, same filters — and
  ordered by priority it still moves as the sliders do, which is what it is
  for.
- **The diary's tags fold away, the way the Ideas room's already did.** Every
  tag anybody has ever used sat in a loose row above the entries, wider than
  the list under it and belonging to nothing. It is the same control in both
  rooms now, on the same surface as what it filters, starting folded and saying
  how many there are — with the one in force still visible while the rest are
  away.

## 0.183.2 — 2026-09-23

- **A notebook holds what its subject actually accumulates.** A renovation is
  not only notes and tasks: it is the tiles to buy, the account the payments
  leave from, the invoices, and the recipe for the kitchen it ends in. Every
  notebook can now be switched on to hold inventory, ledgers, bills, habits,
  workouts, recipes and ideas beside its notes, tasks and goals — each as a tab
  that does the room's own work, not a list of links. Adding a habit on a
  notebook's Habits tab makes the same habit the Health room shows.
- **Which of them a notebook has is its own answer.** In the notebook's Edit
  dialog, under _What it holds_. A new notebook starts with notes and tasks
  only, so a reading list is not born with nine tabs; everything that exists
  today keeps the three it had. Switching one off takes the tab and nothing
  else — the dialog says how much is filed under it, and those rows stay in
  their own rooms.
- **A room you have put away stays away.** Hide Finance in Preferences and no
  notebook offers Ledgers or Bills, which is what putting a room away was
  always supposed to mean.
- **Show/Hide became a tick.** The rooms and their tabs in Preferences are
  checkboxes now: ticked means it is there. The old button relabelled itself
  under the cursor and changed width doing it, so you could not press it twice
  without reading it again. It is the same control a notebook's _What it holds_
  list uses.
- **A key tied to one notebook reaches everything in it.** Not just its notes,
  tasks and goals — whatever that notebook has been switched on to hold. An
  assistant given the renovation can add its shopping and tick it off, and
  still see nothing else in the account.
- **For assistants:** `add_notebook` takes `modules`, `change_notebook` is new,
  and `add_idea`, `add_inventory_item`, `add_bill`, `add_ledger`, `add_habit`,
  `add_workout` and `add_recipe` each take a `notebookId`. `notebooks` answers
  with what each one holds.

## 0.183.1 — 2026-09-23

- **A room is one object now, not a handful of cards floating on the
  backdrop.** The tabs sit on a track that spans the line, with the room's one
  verb — New notebook, New task — at the end of it; the track is square along
  its bottom and the room begins immediately underneath, so the two read as one
  thing with a seam rather than a strip hovering over a card. Every room has
  that surface, so the controls that narrow a list are a block along its top
  instead of chrome adrift above it. Ideas and People were the two that showed
  it worst and are the two that changed most.

- **Settings → Integrations is one room with sections** rather than two rooms
  stacked: it used to draw a second bar, a second title and a second strip of
  tabs, each with a band of page between.

- **The corners stop showing the page through them.** The shell itself carried
  a radius and clipped at it, so every screen in the app lost a bite out of all
  four corners — which is why this kept reappearing somewhere new after each
  place it was chased out of. Anything that reaches a screen edge is square
  now, and there is a test that asks the question the only way that cannot be
  satisfied by fixing one component: whatever happens to be in the corner, at
  two widths, across five rooms.

- **The backdrop is a grain rather than a scattering of glyphs.** The room's own
  icon tiled behind the page was meant to read as texture and never did — it
  was a handful of recognisable objects floating behind the work. Same section
  colour, nothing in it to look at.

- **The three ratings on a task are nested bars.** Width says which rating —
  urgency widest and behind, then ease, then interest — and height says its
  value, on one baseline and one scale, so a tall card no longer draws a taller
  4 than a short one. Hovering them says the numbers, one per line. The sliders
  that set them are drawn the same way, run the full width of the form, and no
  longer snap back a step when dragged quickly.

- **A notebook is its cover.** The shelf is a shelf: the picture is what you
  look at and the name hangs under it. Closed notebooks go to the end, notes
  whose notebook was deleted are a bin in the corner rather than a book called
  "Notes without a notebook", and pressing a picture opens the notebook's
  editor. Both Edit notebook dialogues offer the same fields — including the
  picture, which neither did.

- **A notebook lends its labels to the notes written in it.** Set them once on
  the notebook; a new note there starts with them filled in, where they can be
  taken out again before saving.

- **The fold mark moved off a task's title onto the first line of its
  writing**, where the thing being folded actually is — and a task whose note
  fits on one line no longer carries a chevron that does nothing. Reading an
  open note no longer folds it away mid-sentence.

- **Filters are simply on the strip wherever there is room for them**, and a
  sheet on a phone where there is not. A toggle keeps its width when pressed —
  "Show completed (1)" becoming "Hide completed" moved every control to its
  right — and the scrollbar's room is kept whether or not there is one, so a
  list growing past the fold no longer shifts the page.

- **Writing opens side by side**, and every markdown box offers that choice
  rather than only the wide ones.

- **The quick note says where it goes.** It read "Diary note" and offered no
  choice; it is a note, with a picker under it that starts on the diary and
  offers the notebooks.

- **A task list can be ordered by when it was last labelled.**

- **An assistant's single write is announced by name** — "Claude labelled «bad
  filter button»" — rather than "labelled 1 todo", and a labelling says which
  labels went on and which came off.

- **Reset demo account is only offered where it can work.** Signed into your own
  account on the demo instance you were shown a button that could only fail.

## 0.183.0 — 2026-09-22

- **The diary can be put away on its own, and the writing room cannot.** The
  room and the diary tab shared one word, so hiding the diary meant hiding the
  room — and taking the notebooks, the ideas and the people with it. The room
  is always on now, like the planner, which frees that switch to mean the diary
  alone. The notebooks are not a switch either: a Notebooks room with its
  notebooks put away is a room with nothing in it. First run stops asking about
  it for the same reason.

  If you had previously put that room away, you will find it back — with the
  diary tab hidden instead, which is what the setting now means. Preferences
  turns it on again.

- **The segmented controls have a tile that moves.** Which half of the week,
  which board column, Write or Preview — the position you are on used to be
  drawn by filling that button, so nothing connected where it was to where it
  is and the eye had to find the filled one again after every press. One tile
  now, sliding between the positions, in all ten of them at once. It arrives
  without travelling for anybody who has asked for less movement.

- **Writing's Write and Preview are that control too**, rather than two loose
  buttons beside each other.

- **A report says which build it came from.** Version and commit, taken from the
  instance rather than asked of the person — the version alone names a dozen
  builds, because it is not bumped per commit. It shows on the report in the
  administration page and in the mail, and the sentence that says what is sent
  now says this too.

- **Writing and its preview, side by side.** A third choice beside Write and
  Preview, away to the right. The box used to split into two columns on its own
  once it got wide enough and no box in the app is ever that wide, so that
  layout had never once drawn — it is a choice now, at a width the ordinary
  boxes actually reach.

- **A notebook can have a picture.** On its own page, beside the title: press it
  to choose one, press again to replace it, and a line under it takes it off.
  The same arrangement a person's face has — one picture, because it is what the
  notebook is, and the one it replaces goes if nothing else refers to it.

- **The page says when it is actually hearing about changes.** `data-live` on
  the document once the update stream is open — which is a different moment from
  the request being answered, and the reason a note written by an assistant
  occasionally took a reload to appear in a tab that was already looking at it.

- **Pressing a block on a rating fills it up to there.** It used to land one
  short: a slider puts its thumb on the nearest step to where you pressed, which
  is right when the thumb is the thing you are placing and wrong for a bar,
  where what you mean is "up to here". Pressing the stub below the middle —
  past the second marking, short of the third — is how you say nobody has
  answered.

- **The gauges on a task open the form on the gauges.** They were the one thing
  on a row that showed a number without offering a way to change it. The three
  scales also start open now rather than folded away.

- **Setting a rating uses the same gauge that shows it.** The card drew a
  little thermometer and the form drew a slider, so the thing you read and the
  thing you dragged looked nothing like each other. One component now, with the
  control laid over it invisibly — the platform's own range still handles a
  finger, the arrow keys and a screen reader, and what you see is the gauge
  filling. An unanswered one is half full and grey, markings included.

- **While you are editing a task, the footer says where it would sit.** "3rd in
  line", among the open tasks in the notebook it is filed under, moving as you
  drag and following the notebook you pick. It replaces the score, which said
  what the answers were rather than what they do.

- **The slider reads as one object.** The line, the stops along it, the ring at
  no-answer and the thumb are one ink, the line meets the ring rather than
  running through it, and the colour of the rating now covers the number and
  the × beside it instead of stopping at the track. Urgency is red.

- **A rating you have not answered rests in the middle of its slider.** It used
  to sit on a dot off the left end, so "no answer" and "the lowest answer" were
  next door to each other and an unanswered question looked like a one. The
  thumb now waits at 2.5, between the second and third marks — where the card
  draws it and where the sort counts it — hollow rather than filled, and
  hovering it says the rating is not set. The × beside it is the way back to no
  answer.

- **The three ratings are in one order everywhere: urgency, ease, interest.**
  The sort read them in that order while every form and legend listed urgency,
  interest, ease, so the same three questions came one way round on a card and
  another on the screen that sets them. There is one list now rather than two.

- **A rating you have answered wears its own colour on the form**, the same
  colour it has on the card — so the yellow one on a task is the yellow one you
  set it with. Unanswered ones stay plain.

- **A built file that has gone missing no longer takes the instance down.** The
  static handler lists what it serves once, at boot, so a file removed
  afterwards — a deploy copying over the build, say — failed inside the stream
  and reached the process as an uncaught exception, which stopped it. One
  absent stylesheet is one failed request now. Everything else still stops the
  process, because the state after an unknown crash is unknown.

- **Energy is now ease, and it counts the other way round.** It asked how much
  a task would take out of you, so five was the worst answer and it was the one
  rating where a bigger number was worse — every list that ordered by ratings
  had to know that, and an unrated task landed on a different number depending
  on which question it was. Ease asks the opposite: five is easiest, like five
  is most urgent and most wanted. Everything you had rated was turned round
  with it, so a task you called draining is still the draining one.

- **A rating nobody set counts as 2.5, for all three alike.** It used to be 2.5
  or 3.5 depending on which way that rating ran. A task you deliberately marked
  3 still beats one nobody weighed, and 1 and 2 still mean "later" and "later
  still" — and the grey half-filled gauge now sits exactly where the sort puts
  it, between the second and third markings.

- **The markings inside a gauge stay black in the dark theme.** They took their
  colour from the text ink, which the dark theme turns near-white, so the scale
  came out as pale scratches across a bright pill.

- **An assistant still saying `energy` keeps working, and is told it is going
  away.** The value is translated — an energy of 5 is an ease of 1 — and the
  answer says so, naming 0.190 as the release that stops accepting it.

## 0.182.24 — 2026-09-22

- **Every task shows all three ratings, in the same place.** A task nobody had
  rated drew nothing, and one rated only for urgency drew a single bar, so the
  same question sat somewhere different on every row. All three are always
  there now; an unanswered one is half full and grey, which says "nobody said"
  rather than "the lowest there is" — and half is where an unset rating
  actually counts when the list is sorted by Priority.

- **The gauges are outlined in black, and the colour has some depth to it.**
  The fill also stops in a straight line at the level it reports: it was a
  rounded rectangle inside a rounded track, which left a notch at each corner
  of the closed end and domed the open one, so two-of-five looked like the bulb
  of a thermometer. The yellow and the green are brighter.

- **An assistant given one notebook can see the pictures in it.** The screen
  that ties a key to a notebook promises "its tasks, its goals, its notes, and
  the pictures and recordings in them" — and the tool that fetches a picture
  was the one thing such a key was never offered, so an assistant asked to look
  at a screenshot could only answer that it had no way to. The file rule itself
  was right all along: it is the notebook's own pictures, and no others.

- **Four cross-site-scripting fixes and a denial of service, from upstream.**
  Svelte, nodemailer and devalue move to the versions that carry them; two of
  the five were in server-side rendering, which is how every page here is
  drawn. Nothing about the app changes. Every commit is now read for anything
  shaped like a credential, and the dependencies are checked against what is
  publicly known about them, on every push — so the next one is caught here
  rather than by somebody else.

- **Writing is drawn as writing on the last screens that were still printing
  it raw.** The diary card on the dashboard showed `## A month of doing this
properly` with the hashes in it, because it cut the entry at 300 characters
  rather than rendering it; it now shows four lines of the real thing. A goal's
  notes, a training session's notes and the ideas on the dashboard render too,
  so a backtick means code wherever you type one.

- **The first-run tile marked Notebooks says what that room is.** It took its
  name from the navigation and its sentence from the preference underneath,
  which is still called `diary`, so the room that holds your notebooks, ideas
  and people was described as the diary alone. It also offers six rooms rather
  than nine: People and Ideas are tabs of Notebooks, and a tab is put away in
  Preferences rather than before you have opened the app.

- **The diary counts the diary.** An entry was numbered among everything the
  account had written, notebook notes included, so the thirtieth diary entry
  was headed `#127` — a number you could not arrive at by counting. The diary
  has its own number now, and the `#12`s already written in it were rewritten
  to the entries they meant.

## 0.182.23 — 2026-09-22

- **The three ratings are little thermometers under the tick box.** Urgency,
  energy, interest — that order everywhere now, the order the Priority sort
  reads them in — stacked in the column the tick box stands in, so they line up
  across every row. Black markings for the five steps and the colour rising
  through them: yellow, blue, and green for interest, which was red.

- **A picture under folded writing unfolds it first.** Pressing a thumbnail on
  a one-line row opened the picture in a new tab before you had read the line
  it belonged to. The first press opens the row; the second opens the picture.

- **A diary entry's number sits at the bottom right**, with the rest of its
  controls.

## 0.182.22 — 2026-09-22

- **Writing is rendered the same way everywhere it is shown.** A task's notes,
  an idea and a note about somebody were drawn as plain text, so a fenced code
  block came out as three backticks and `TASK:#4` stayed four characters —
  while the same writing in a notebook rendered properly. One renderer now, and
  inside a notebook a task's notes link the tasks they name, with their titles.

- **The docs no longer say deleting is missing from the key form.** It is on
  that form, in a box of its own that starts unticked — which is what the page
  now says, along with what the wider form on Integrations actually adds.

## 0.182.21 — 2026-09-22

- **A notebook's tabs have the same strip.** Notes had a hand-rolled row of
  buttons and no way to search; Tasks beside it had a search box, a fold for
  the filters, a count and the order. One notebook answered "find the one about
  the boiler" on one tab and not on the other. Notes now uses the same
  arrangement, in the same order, and searches titles and writing.

## 0.182.20 — 2026-09-22

- **A task's buttons sit under its words, not beside them.** They were a block
  three wide pinned to the right of the row, which on a phone took a third of
  the width and left the title breaking mid-word. They are one line under the
  text now, pushed right, the way a note card has always done it — at every
  width, because it reads better on a laptop too. The task's number keeps the
  left end of that line.

## 0.182.19 — 2026-09-22

- **"How long until this" is counted where you are.** The dashboard's Now/Next
  card read the clock off the server, which runs in UTC — so a block at 11:45
  told an account in São Paulo it had seven hours when it had ten, and the
  card had rolled into tomorrow while it was still Sunday evening. The same
  applies to the time a promoted todo lands on, and to which month the bills
  card is counting.

- **And it says it in your language.** "Now", "Next", "minute" and "hours" were
  written into that card in English, so the line stayed English whatever the
  app was set to — with the plural chosen by an `=== 1` rather than by the
  language.

## 0.182.18 — 2026-09-22

- **Every shelf in the Notebooks room can be put away.** The room draws six
  tabs and honoured the preference for two of them: hiding the diary left a
  Diary tab standing, and Weekly notes and Tags had no preference at all.
  Preferences now lists all of them under the room, and the room draws what is
  left — one list, read by both, so a tab added later arrives with a way to
  turn it off.

- **First run calls a room what the bar calls it.** The tile for the writing
  room said "Diary" while the app has called it Notebooks for a while.

## 0.182.17 — 2026-09-22

- **The number under a task, and ten other small labels, can be read.** They
  were drawn in a grey the stylesheet itself says is not a text colour — about
  2.5:1 on this app's surfaces. A bill's amount, a folder's count, "no price
  yet" and the rest move to the grey that clears 4.5:1, and a test now stops a
  new one appearing without somebody deciding it is an icon or a deliberate
  dimming.

- **The notes box opens at the size the dialog gives it.** The task dialog had
  been making room for notes and then drawing three lines in the middle of it.

- **Pressing a label on a note narrows the notes to it**, the way it has always
  worked on a task. Press it again to let the rest back; the strip above says
  which labels are holding, so a filter can't hide rows silently.

## 0.182.16 — 2026-09-22

- **The words on a coloured label are readable on every colour.** The ink was
  picked from the colour's lightness, which is not the same as how bright it
  actually is — so a vivid cyan got white text on a bright field. Measured over
  the colour space, that rule bottomed out at 2.4:1 and left an eighth of all
  colours under what small text needs. The app now picks black or white by
  which one actually contrasts more, keeping the softer near-black wherever it
  is still readable; the floor is 4.5:1 and a test holds it there.

## 0.182.15 — 2026-09-22

- **Parking the chat properly.** Its endpoint answers 404 rather than staying
  open to anybody who had saved a key, its documentation no longer ships — a
  commented-out section in the prose is now dropped when the reference is
  generated, so the docs search stops offering a page about a feature nobody
  can reach — and the two generated pages that still name its code say it is
  switched off.

- **An Ollama address is judged before it is dialled, blank or not.** Its
  default is `127.0.0.1`, so leaving the field empty asked for the same
  unreachable thing as typing it; both now give the same sentence.

## 0.182.14 — 2026-09-22

- **The chat inside the app is switched off.** It was built the way most apps
  build one — you bring a provider key and this instance calls the provider on
  your behalf — and that is the opposite direction from the one that matters
  here: the assistant you already use reaching _in_ over MCP, with your own
  account and your own model. Nothing is deleted; the room, the settings card
  and the model catalogue are all still there behind one flag, and connecting
  an assistant is unaffected.

## 0.182.13 — 2026-09-22

- **The chat's model picker says why an address could not be reached.** Asking
  a provider for its models answered "Unexpected error" when the address was
  one this instance refuses — which is every address on your own machine, since
  the call is made by the instance and not by your browser. It now says that,
  and the base-URL field says it before you try: on the hosted instance,
  `127.0.0.1` is the server's own loopback rather than your laptop.

## 0.182.12 — 2026-09-22

- **A long notebook description folds away.** Written properly — what the
  renovation covers, which flat, the measurements — it pushed the notes off a
  phone screen. It shows two lines with **Show more** under it now, and a
  description that already fits is drawn with nothing to press.

## 0.182.11 — 2026-09-22

- **An assistant tied to one notebook can ask which one.** The `notebooks`
  tool took no arguments, so it named no notebook — and a key confined to a
  single notebook is only offered the tools that name one. The assistant that
  can work on exactly one subject was the only assistant that could not find
  out which subject, or the id every other tool asks it for. It now takes an
  optional id, and a confined key is answered with its own notebook.

## 0.182.10 — 2026-09-22

- **Backticks keep what is inside them.** `` `a * b * c` `` came out with an
  italic in the middle, `` `**bold**` `` came out bold, and `` `[x](/y)` ``
  came out as a link — every rule in the renderer ran over the text after it
  had been wrapped in code. Now a span of code is lifted out before anything
  else is read and put back at the end, so what is in it is what you typed.

- **``` on one line is a code span, not an empty block.** Typing a fence that
  opens and closes on the same line opened a block, found no closing fence
  below, and drew an empty box with the sentence thrown away.

## 0.182.9 — 2026-09-22

- **The to-do list can be ordered by priority.** Beside Added and Done there is
  now Priority: the three ratings read together — most urgent first, then the
  task that takes least out of you, then the one you most want to do. It is the
  same arithmetic `up_next` answers an assistant with, so the list and the
  assistant cannot disagree about what comes next. The notebook's Tasks tab has
  it too, being the same list.

- **An unrated card no longer sinks to the bottom of the board.** Sorting a
  board column by one rating put everything unrated last, which said "nobody
  weighed this" and meant "this matters least". It now counts as the middle of
  the scale nudged half a step to the losing side, exactly as everywhere else.

## 0.182.8 — 2026-09-22

- **Two tabs under AI & Integrations, not three.** The chat had a tab of its
  own beside the AI one, which read as three rooms where there are two: what
  the chat runs on is a setting of the AI tab, and it is now the first thing on
  it. `/settings/integrations/chat` still lands where it used to.

## 0.182.7 — 2026-09-22

- **`/favicon.ico` is an icon again.** Nothing links to that address and
  everything asks for it — a browser before it has read the page, a chat
  unfurling a link, the card an assistant draws for a connector. This app had
  no such file, so the request fell through to the page fallback and those
  callers drew whatever they had cached, in one case the logo from before the
  puffin. It is now three sizes in one file, drawn from the same artwork as
  every other icon.

- **The launcher shortcuts wear the current mark.** Long-press the installed
  app and the three shortcuts — the board, the diary, the goals — were still
  the logo this app stopped using a year ago: they were hand-made PNGs that no
  generator touched. They are drawn now from the app's own room glyphs, and
  `make lint` checks that every icon is current, which is what nothing did.

## 0.182.6 — 2026-09-22

- **The connect-an-assistant screen is a question, not a receipt.** What an
  assistant asked for is now a list of tick boxes, gathered by what they are
  about — your week, money, the diary, the house — and everything is ticked to
  begin with, so saying yes to all of it is still one press. Untick a line, or
  a whole heading, and the key it walks away with cannot reach that at all: a
  tool whose permission was not granted is never offered to the assistant.
  Before this the only decision on the page was the deleting box, so an
  assistant that asked for everything got everything or nothing.

- **`up_next` reads the ratings the way the app means them.** Most urgent
  first, then the task that takes _least_ energy — it used to break ties
  towards the heavier one — then the one you most want to do. And a rating
  nobody set is no longer treated as a zero: it counts half a step to the
  losing side of the middle of the scale, so a task deliberately marked 3
  beats an unrated one, while urgency 1–2 and energy 4–5 are the tiers that
  mean "later".

## 0.182.5 — 2026-09-22

- **The connect-an-assistant address is on the Integrations page.** The
  no-key flow starts on the assistant's side, which is exactly where nobody
  thinks to look first — so Settings → AI & Integrations → Integrations now
  shows your instance's own address with the one sentence that explains it,
  above the tokens.

- **The daily digest says who the demo turned away, and why.** A count reads
  the same whether the rate limiter did its job or every copy was in use;
  each refusal now names the rule it tripped, the address, and how many
  copies were out at that moment.

## 0.182.4 — 2026-09-22

- **An assistant can connect itself.** Paste your instance's address into
  Claude, ChatGPT or anything else that speaks MCP, and instead of asking you
  for a key it sends you to a screen on your own instance: this is what is
  asking, this is what it could do, connect it or don't. No key is typed or
  pasted anywhere. What it gets is an ordinary key, named after it, revocable
  in the same list as the rest — and deleting is a box on that screen which
  starts unticked.

## 0.182.3 — 2026-09-22

- **The bans left the administration page.** ontoplano no longer interfaces
  with the machine it runs on: /admin shows what the app itself knows —
  accounts, events, mail, client errors — and the firewall's record lives on
  the box's own page instead, which `ontoplano-server`'s `ops-web-setup.sh`
  serves on a subdomain of its own behind basic auth, with the same unban
  and block-for-good buttons.

## 0.182.2 — 2026-09-22

- **The chat can be allowed to delete things.** It could always read and write;
  deleting was refused outright, which quietly overrode the permission the app
  already has for exactly this. It is a box on Settings → AI & Integrations →
  Chat now — off until you tick it, and the caution says why.

- **The model field stops repeating its own placeholder.** "Empty means
  claude-sonnet-5" sat under a box that already said so.

## 0.182.1 — 2026-09-21

- **The banning layer is reaction.** On a self-hosted server
  [reaction](https://reaction.ppom.me) replaces fail2ban, and every ban lands
  in `/var/log/ontoplano-bans.log` — one record, whatever wrote it.
  `ontoplano-server`'s setup wizard arranges all of it.

- **The chat's model is a list, not a text box.** Paste the key, press "Ask the
  provider what it offers", and the box becomes what that key can actually
  reach — which is also the quickest way to find out whether the key works
  before you save it. Typing a name by hand is still there for a model newer
  than the provider's own list.

- **The docs say how to get a key**, per provider, including the step that
  catches most people: a Claude or ChatGPT subscription is not API credit, and
  the two are billed separately.

- **The README says how to run it on Windows** — WSL from PowerShell, then
  `yarn dev` — and says plainly that there is no systemd on that path, so
  nothing starts on boot and the terminal holds the app.

## 0.182.0 — 2026-09-21

- **A chat, with a key of your own.** Settings → AI & Integrations → Chat
  takes a provider — Anthropic, OpenAI, OpenRouter or Ollama — and an API key
  of yours, and the app gains a chat that can read your plan and act on it. It
  speaks through the same tools and permissions an external assistant gets:
  reading and writing, never deleting, every write in the write log. Remove
  the key and the chat is gone; without one, nothing in the app ever calls a
  model.

## 0.181.5 — 2026-09-21

- **The task filters fold away on a phone.** Seven controls needed three rows
  at phone width — a third of the screen spent before a single task. The
  filters now sit behind one button that says what is narrowing the list while
  they are folded, with a single press back to everything. The search box
  stays out in the open: it is typed into, not pressed.

## 0.181.4 — 2026-09-20

- **A label filter holds more than one label.** "The urgent ones" is a
  question one label answers; "the urgent ones and the ones about the house" is
  the one anybody with a long list is actually asking. Pressing a label on a
  task adds it to the filter too, so two presses is two labels. Any of them
  rather than all — a task carries two or three, and asking for the ones
  carrying every label you picked usually asks for nothing.

- **A dropdown in a form is the app's own, not the platform's.** Only the
  closed control could be styled, so on a dark screen opening one produced a
  white panel with the operating system's blue bar across it. The goal form,
  the block form and the notebook field draw their own list now, with the keys
  a dropdown answers to. Dates stay the browser's: a calendar is a real control
  and a hand-built one is worse.

- **A label filter's menu is no longer cut off by the card it is in.**

- **The task card reads at a glance.** The tick stands level with the title
  rather than floating halfway down the row, and urgency, interest and energy
  are three little gauges in the room it gave back — five frets each, one
  colour each, the words under the pointer. A finished task says when it was
  finished.

- **A ticked task is seen to be ticked before it goes.** It stays half a
  second, drawn as a finished one, instead of vanishing the instant you press
  it.

- **Pressing Escape no longer costs you the task you were writing.** What was
  typed comes back when the form does. Cancel and a save that worked still
  throw the draft away, because both are somebody saying they are finished.

- **Stepping the week keeps the page where it is.** Reading the afternoon and
  pressing forward used to put you back at seven in the morning. The grid dims
  while the next week arrives, and a press landing during it still lands.

- **An account is in dollars until it says otherwise.** Preferences still takes
  any currency.

- **A note points at a task as `TASK:#4`.** The room is called Tasks, so the
  reference is too — and the live preview resolves it now instead of showing
  the reference itself. Notes written before this keep working.

- **Folding a place in Inventory holds the page still.**

- **The Day / Week / Month control says which one you are on.** The difference
  between the chosen position and the others was carried by a raised tile the
  dark theme does not have.

- **The planner's header is two rows on a phone, not four**, with the date
  centred between the arrows; and on a desktop the arrow that steps the week
  sits beside the date it steps rather than adrift of it.

- **The permissions table names every family of data.** One row printed its
  internal key — "statements" — in the middle of a page that was otherwise in
  your language.

- **A reminder is listed at the time it was set for.** Where the box's clock
  differed from the account's timezone it was shown hours out.

- **A data stream's page is part of Integrations**, with the room's tabs on it,
  rather than a page belonging to nothing.

- **A task's notes and an idea are written in the box with the preview**, so a
  pasted screenshot is a screenshot rather than an address in the middle of a
  sentence.

- **Tags can be managed.** A Tags tab in Notebooks lists every label the
  account uses with how many things carry it, and renames, colours or removes
  one — across tasks, notes, ideas, blocks and pictures at once, because the
  vocabulary is the account's rather than a room's. Renaming onto a label you
  already use merges the two rather than refusing. A label with a colour is
  drawn in it wherever it appears; one without stays as it was.

- **Two causes of text flickering while it is typed.** The markdown box kept
  what was typed in its caller's prop, so any reload of the page put the
  stored text back until the next keystroke; and a full box re-measured itself
  on every keystroke, which costs a scrolled box its place for a frame.
- **Deleting a block from the board actually removes it from the day.** It
  deleted the generated occurrence, which the next page load generated straight
  back — so the press closed the dialog and the card was still there. A
  repeating block is suppressed for that day; a one-off is deleted.
- **The task list can be searched.** The filters beside it answer "which kind";
  this answers "the one about the plumber" — across titles, notes and labels,
  with the count beside it saying what is left.
- **The browser tab says where you are** — "To-do · Tasks · Ontoplano" rather
  than "Ontoplano" on every page, which is useless the moment two of them are
  open. Staging, the demo and a dev build keep their own name on the end.
- **A task's description opens it too.** The title was the only thing that
  unfolded one, and the line you are reading when you want the rest did
  nothing. A picture or a recording inside it stays its own control.
- **Pressing Create twice makes one task — on every form in the app.** A form
  in flight disables its buttons and drops a submission identical to the one
  already going. Identical rather than merely second: the notebook's divider
  posts a new width as it is dragged, and that is something new to say each
  time.
- **The AI agents page says what to pass each tool.** Every tool now carries a
  table of its parameters — type, whether it is required, the values an enum
  allows, the default — generated from the same array that serves them.
- **A board card is a button with a name of its own.** Its accessible name was
  everything written inside it, the labels of the buttons it contains included.
- **Pressing one tag chip's × takes one label off.** Removing the pressed
  element while the press was still being delivered made the browser finish it
  against whatever moved into that spot.
- **An assistant can ask for part of a list instead of all of it.** The task
  list takes `status`, `withoutTag` and `taggedSince` beside `tag`; notes take
  `tag` and `taggedSince`. A listing answers with a line per row — `verbose`
  for the whole thing, `fields` for exactly the parts wanted — and `tag_todo`
  answers with the labels rather than two copies of the task. `up_next` answers
  what to do next, by the ratings on the tasks themselves.
- **A label on a note carries the day it went on**, the way a label on a task
  already did, so a note put into review can be found by when it was put there.
- **The demo band on a phone carries the mark** instead of "yours, and
  temporary".
- **A task shows its number inside its notebook**, small, at the end of the row
  — the number a note points at and the one to say out loud when you mean a
  particular task.
- **A note can point at a task in the same notebook.** `TODO:#4` — the task's
  number inside that notebook — renders as the task itself, ticked when it is
  done, and opens its editor. Turning a note's checkboxes into tasks writes
  these in place of the boxes, so the offer stops standing over a list that has
  already been made and the note and the list stop being two records of one
  thing.
- **The demo band says what it is, points at the source, and can be read in
  both themes.** Its ink was a palette colour, which the dark theme inverts —
  white on orange.
- **The planner fetches the windows either side before you step into them.** An
  arrow was a round trip, so the grid sat empty for the length of one each time.
- **An assistant can see the pictures it is entitled to.** The new `media` tool
  takes the link as the writing writes it — `/media/31`, `/media/audio/44` —
  and answers with the file. Reaching one used to mean an HTTP request with a
  raw key, which an MCP client never hands out, so the capability worked for a
  script and not for the client it was built for. Same permission rule, same
  function answering it, no new grant.
- **The reminder form writes the day-start hour in the reader's own clock.** It
  promised "Empty means 06:00" while the row underneath said "6:00 AM", and the
  sentence was hard-coded English besides.
- **The app shows what arrived while it was away.** It opened on a badge saying
  three notifications and a bell holding none: a frozen web view takes the live
  stream down with it, so nothing was pending when it came back and nothing
  reconnected. Returning to the front reloads once and reopens the stream.
- **A link that names a part of a page lands on that part.** "OD changed 6
  things" opened the integrations page at the top: below `lg` the window does
  not scroll — the page body does — so the browser's own fragment handling
  moved nothing.
- **The filters in a toolbar are the app's own control, not a `<select>`.** The
  tag and notebook filters on the task list, and the ledger, window, tag and
  month filters in Finance, are the same button-and-menu the sort control uses.
- **The new filter control keeps the corners every button beside it has.** A
  full-width button inside a card is drawn as a row, and rows are square.
- **A menu's chosen row can be read again.** It was marked with a near-white
  wash under the white ink of the dark overlay face.
- **A board card puts its time under its title.** The time sat in front of the
  title and cost it five characters on every card that had one, and the badge
  line only existed when there was a badge — so a card wearing one label stood
  taller than its neighbours. Both lines are always there now.
- **A notebook's filters sit under its tabs, the way the Tasks tab already
  did.** On a phone they took the row and left one letter of "Notes" showing.
- **The task filters say how many tasks are showing**, not only how many are
  hidden.
- **Each setting in Location and time is fenced with the button that saves
  it.** Several Save buttons down one panel said nothing about which fields
  each one covered.
- **A goal filed under a notebook can be worked on there.** The Goals tab was a
  list of titles: no edit, no delete, no way to say a goal was achieved or
  missed, and nothing about what counts towards it. It draws the goals room's
  own card now, and the goals room groups a notebook's goals under its name,
  below the ones that are not about a subject.
- **The measure box's example follows the kind of number.** Choosing ℚ left the
  placeholder saying 3.
- **The to-do toolbar stops taking three rows on a phone.** The sort control
  was pushed to the right at every width, so it wrapped onto a line of its
  own with an empty half beside it.
- **A task can be given a day as it is written.** The form could not say when,
  so "ring the plumber tomorrow" became a task with the word tomorrow in its
  title and a day that still looked empty.
- **Removing one tag chip removes one tag.** A single press was reaching the
  next chip's handler as well, so two came off.
- **An opened card says the same thing wherever it is.** The to-do rail left
  out the goals a card belongs to, because it was a second copy of the same
  markup.
- **A permission says that the pictures come with it.** "Read your notebooks"
  always reached the pictures inside them — a file answers to whatever refers
  to it — and the sentence on the key form never said so. It does now, on
  every read grant and on the notebook a key can be tied to, and the docs say
  how an assistant actually fetches one.
- **A note written in the notebook previews its markdown too.** It shipped in
  the dialog only, which is not where most notes are written. The box also
  starts at twice the height, and Tags and People are the same size instead
  of one full-width box above a half-width one.
- **The yearly and monthly tiles are smaller than the plan tiles.** They were
  the same width and merely shorter, which is what made the two choices read
  as equally important.
- **Shift+H and Shift+L walk the room's own tabs, everywhere.** They read the
  strip the room is drawing rather than the menu's list, so they go in the
  order you can see, reach places the menu does not list, and work in Media
  and Finance — which answered to nothing before. The board no longer takes
  them for itself: it carries a card with `<` and `>`.
- **One sorting control, in the notes and in the tasks.** A notebook's notes
  used a dropdown beside an arrow; its tasks used a button that cycled through
  the orders, which shows you nothing and cannot go back. Both now say what
  the order is, open the list when pressed, and flip direction with the arrow
  beside them — and the task list finally has a direction at all.
- **An answered slider looks answered.** A one is the thumb a fifth of the way
  along a thin track, which at a glance is the same picture as not having
  answered at all — and the two mean opposite things. An answered one sits on
  a shade of its own now.
- **"Location and time" is one section at the top of Preferences.** The
  language, the clock, the timezone, the first day of the week, the planner's
  hours and which day tasks are generated on were six settings scattered down
  the page, and they are one subject — everything else reads differently once
  they are right.
- **A task can be deleted from the form that edits it.** Away from Save, at
  the far left, armed like every other delete.
- **A label remembers when it went on.** The chip says how long ago under the
  pointer, and an assistant can ask what has been marked since this morning —
  neither was answerable before, because a task's own timestamp moves for
  every edit. Labels also reach a recurring block and a one-off block now, not
  only a task with no day.
- **The tag box empties as you type, and suggests as you go.** The chips and
  the box were two views of one string, so the box could never clear — and
  nothing was suggested, because the word being typed was whatever trailed the
  last separator, which right after a space is nothing. They are two things
  now. Backspace on an empty box takes the last chip off, and a word still
  being typed when you press Save counts anyway.
- **An opened card is shaded, not underlined.** A rule across the top of a
  rounded card stopped short of both edges and read as a mistake; the notes
  sit on a shade of their own now, and "nothing written on this one" is
  legible instead of nearly invisible.
- **A picture opens over the page instead of in a new tab.** Pressing one is
  the app being asked to show it, not a link being followed — so it fills the
  screen on a dark ground and the ground closes it. Every rendered picture in
  the app, wherever it is.
- **A checklist becomes tasks from the composer, as you type it.** The offer
  was an icon on the finished note's row, found afterwards by somebody who
  went looking. It appears beside Add the instant a `- [ ]` does, says how
  many it will make, and makes them with the note in one press. The row holds
  its height so nothing shifts under the hand about to press Add.
- **A reminder is in the bell list whether or not the app was open.** One that
  came due while you were looking at a page was raised by the page itself and
  written down nowhere, so the same reminder was in the list or not depending
  on which device happened to be awake. It goes in either way now — already
  read when you watched it appear, since a badge for that means nothing.
- **A goal is written where you are.** "New goal" on a notebook used to throw
  you out to the Goals room, while "New task" beside it stayed put — the same
  press behaving two different ways depending on which tab was showing. It
  opens the goals room's own form, in the notebook, filed under it.
- **Write and Preview are the same height, so nothing below them moves.**
  Choosing Preview on a short note used to pull the picture row, the tags and
  the footer up the screen, and choosing Write pushed them back down.
- **j and k walk a notebook's tasks and goals, not only its notes.** h and l
  switched between the three tabs and the other two answered to nothing.
- **The planner's day names follow the app's language.** "Sun 20 / Mon 21" sat
  under a Portuguese screen in every view. The calendar formats its own
  headers and was never told which language to do it in.
- **A year is written as a year.** "Week of Aug 24 2,026" — a year handed to a
  sentence as a number was grouped like a quantity.
- **A note's stamp says the time as well as the day.** Two notes written the
  same afternoon read as the same note otherwise.
- **A plan's limit is written the way you write numbers.** It was pinned to
  American formatting, so a Portuguese account was told its plan allows
  "5,000 notes" — which in pt-BR reads as five.
- **Typing a tag suggests the ones you already use.** The box splits on spaces
  and commas as you type — which is what the server has always done with what
  it holds, so "work urgent" was two tags and the box was the only thing that
  did not say so. Settled words are chips, the one being typed offers what it
  could be, and arrows and Enter pick one. Every place that takes tags.
- **The app says so when you make, change or delete a task.** Making one
  offers a way straight into it rather than an undo — you asked for it and it
  is there, so the useful next move is saying more about it. Changing one says
  "Saved" and offers nothing, because the change is on the screen behind it.
  Deleting one now waits a few seconds with the way back on the toast, the way
  Inventory already did, instead of asking "are you sure" before the fact.
- **A picture in a task or an idea can be seen by an assistant that may read
  it.** It was reachable by nobody at all: a file answers to whatever refers
  to it, and tasks and ideas were not counted as referring to a picture — only
  to a recording. Pasting a screenshot onto a task and then asking an
  assistant about it got nothing.
- **Times are written the way you read them.** A setting under Preferences —
  12-hour, 24-hour, or whatever your language does, which is the default and
  shows you what each one looks like before you choose. Every screen asks the
  same question of the same answer now, instead of thirty-seven places each
  deciding for themselves; the planner, the notification panel and the
  reminder list had disagreed for a while.
- **The row the keyboard is on is shaded, not boxed.** A two-pixel rule above
  and below it, on rows that sit flush, drew a heavy line between them — and
  the top one was clipped on the first row, so the first selection never
  looked like the others. It is a wash and a small lift now.
- **Shift+H and Shift+L walk the places inside the room you are in.** `h` and
  `l` move between a screen's own tabs and `J`/`K` between the rooms; this is
  the level in between — Board to To-do, the diary to People. Worked out from
  the addresses, so somewhere added later answers to them with nobody wiring
  it up, and a screen that already uses those keys keeps them.
- **What an assistant did is said in your own language.** The notification
  panel's title was translated and every line under it was English, because
  the sentence was assembled from tool names rather than from the catalogue.
  Verbs, nouns and their plurals are written in all four languages now, and
  the order of the words is a translator's to change — German puts the
  participle last, which no amount of translating the words alone would fix.
- **A notification about a burst of changes lands on the list of them.** It
  took you to the integrations page and left you to find the section. Links
  carrying a `#section` work generally now; the app scrolls its own panel, so
  the browser's anchor handling had never applied.
- **The help dock stays out of the way until it is wanted.** Four icons sat in
  the corner of every desktop screen. It is one question mark now, on a phone
  and a desktop alike, and pressing it opens the row — and closes it again.
- **A note shows what its markdown will look like, as you type it.** Beside the
  box where there is room for two columns, behind a Write/Preview pair where
  there is not. It has nothing to do with saving.
- **Changing the language says it is working.** Every word on every screen is
  reloaded, which takes a moment, and for that moment the app said nothing at
  all — the bar across the top and the turning mark only ever answered a
  navigation. They answer any wait now.

## 0.181.3 — 2026-09-20

- **A card can be moved on a phone.** Dragging is a mouse gesture and does not
  exist under a finger, so the one thing a board is for could not be done on a
  phone at all. Pressing a card's grip picks it up — the board says what is in
  your hand and every column says it will take it — and the next press puts it
  down. It works with a mouse too.
- **Pressing a card reads it.** Its notes, the pictures and recordings in
  them, and the goals it belongs to by name. Reading a card no longer means
  opening the form that edits it and pressing Cancel.

## 0.181.2 — 2026-09-20

- **Notebooks has a handle between its two columns.** The list of notebooks
  and the panel beside it can be widened and narrowed by dragging the divider,
  and where you leave it is where it stays. It is Inventory's handle, now one
  component rather than two copies — and it takes the keyboard, which the
  original never did.
- **A view says what its keys are instead of writing them.** `h` and `l` walk
  the tabs, `j` and `k` walk what is listed, `Enter` reads the one under the
  cursor and `e` edits it. Notebooks is the first screen on it; the next one
  gets the same keys by declaring itself rather than by somebody remembering.
- **Tables render.** A pipe table in a note came out as a wall of pipes with a
  horizontal rule through the middle of it. It is a table now, with its own
  sideways scroll so a wide one does not take the page with it.
- **What a notebook is, said only while you have none.** Once there are
  notebooks on screen they explain themselves better than the paragraph above
  them did.
- **The theme row fits, and says its words in your language.** "Dark" was cut
  in half by the edge of the menu, and all three read in English whatever the
  app was set to.
- **The danger zone in Account starts closed.** Two Delete buttons should not
  be on screen every time somebody comes to change a password.
- **Pressing a task reads it.** Its notes, its pictures and its recordings
  unfold on the row — reading what you wrote no longer means opening the form
  that edits it and pressing Cancel.
- **The widget picker takes all or none.** Thirteen tiles was thirteen presses
  to start from nothing and add back the four you wanted.
- **The keyboard page in the docs reads in words.** It was printing the
  internal name of each description — "shortcut.moveBetweenTabs" — to anybody
  who opened it.

## 0.181.1 — 2026-09-19

- **A note that is a checklist can become the tasks it describes.** Writing a
  list in a note is the fastest way to get one out of your head, and then it
  sits in a notebook where nothing can remind you of it. A note with a
  `- [ ]` in it now offers to make tasks of its checkboxes — each line a
  title, whatever is written under it that task's notes, a ticked box arriving
  already done — with a dialog to leave a few behind. The note itself is left
  alone. `note_to_todos` does the same over MCP.
- **A task's notes take a picture.** The same attachment a note and an idea
  have, because a task is as often a screenshot as a sentence, and the row
  draws the picture rather than printing its address across itself. Ideas
  gained the button too.
- **Notes can be rewritten by an assistant.** `edit_entry` changes a note's
  words, its title or its tags; leaving a field out leaves it untouched. The
  tools could make a note and put one away and nothing in between.
- **A finished task is grey, not struck through.** The tick and the colour say
  it already. Swept across every screen a completed task appears on.
- **The notebook's New button says what its tab is about.** It read "New note"
  while the Tasks tab was showing. It is New task there and New goal on Goals,
  and New goal opens the goal form with the notebook already chosen. The
  notebook also keeps its own New notebook button while Tasks is showing,
  which the task list used to take over.
- **The note order control moved up beside the full-screen button.** One row
  under the tabs instead of two, and the tab you are on is scrolled back into
  view when the strip is too narrow to hold all three.

## 0.181.0 — 2026-09-19

- **An assistant can see the pictures and recordings in what it may read.**
  A key granted "read your notebooks" used to fetch the words of a note and
  get nothing for every picture in it, which made briefing one with
  screenshots impossible. A file now answers to whatever refers to it — a
  picture in a note wants the notes grant, a face wants the people one, a
  recording on a task wants the tasks one — so nothing new was granted and a
  file nothing refers to is still reachable by nobody. A key confined to one
  notebook sees that notebook's files and no others.
- **The weekly review has three answers, not two.** Untold, Done and Skipped —
  and the skipped ones are readable at last: they leave the open questions the
  moment you skip them and were in neither list, so a week of "no, not that
  one" went in and could never be looked at again. Ask about one again to put
  it back among the open questions.
- **The planner's arrows stop moving under your finger.** "next 7 days" is
  wider than "today", so the date label changed width as you stepped and took
  the arrow with it; the label and the way-back-to-today button both hold
  their space now. The day-shift arrows sit centred rather than crowding them.
- **The habits heatmap spans the card**, and its weekday labels line up with
  the rows instead of drifting off them.
- **Saving a note keeps it open**, says so, and the button becomes Close until
  you type again — so saving and closing is two presses and nothing changes
  size between them.
- **A picture pasted into a note no longer steals the cursor.** The upload
  finishes seconds later, and it used to jump the caret to the end of the link
  it had just written — cutting whatever was being typed in half.
- **Typing in a long note stops walking the page down.** The box measured
  itself by collapsing first, which moved the scroll on every keystroke until
  the line being written sat on the bottom edge of the screen.
- **How often you pay is a smaller tile than which plan you are on**, which is
  the question actually being asked.
- **Undo is readable in the dark.** The button on the toast carried a palette
  white, which the dark theme inverts — so it drew as near-black on the dark
  card the toast deliberately is. Anything on that card takes its ink from the
  card now, and the same mistake is gone from the error prompt beside it.
- **A to-do's labels can be changed one at a time.** Marking a task no longer
  means sending back every label it already had and hoping none were missed.

## 0.180.1 — 2026-09-19

- **A goal can count a workout measure instead of asking you to type it.**
  Pick one of the words your sessions use — "ran", "deadlifted" — and the
  goal's number is the sum of what the register holds for it inside the goal's
  period. It moves as you log, the card says which word it counts, and there
  is no box to write a total your own sessions contradict.
- **A reminder opens the thing it is about.** Only a birthday did: the weekly
  review's nag, a bill and a to-do all landed on the day's board instead. The
  review's now opens the week it is nagging about, a bill's opens the bills,
  and a to-do's opens the to-do list. The browser and the delivery job read
  one answer now rather than a copy each.
- **The activity picker is typed at rather than scrolled through.** It still
  shows every activity the moment it opens — no typing required to see
  anything — and now narrows loosely as you type, so "lr" finds "learn
  russian" and the letters it matched are marked. Arrows and Enter work, and
  the block board's picker got the same treatment.
- **The weekly review's week starts where your week starts.** It was keyed on
  Monday whatever the planner had been told, so if your week begins on a
  Saturday, a Saturday led one week on the plan and closed the week before it
  in the review. The reviews you have already written were moved to match, and
  the weekly mail now arrives on the morning your week begins rather than on a
  Monday two days into it.
- **Two buttons on the week grid slide the first day, one at a time.** The
  arrows beside the date step a whole week and always land on the same
  weekday, so they could never answer "where does my week begin".
- **A deleted block no longer leaves its hover card behind.** Opening a block
  covers the grid, so the card it raised never heard the pointer leave: delete
  it and the card stayed in the column at the hour the block used to be.
- **To-dos take tags.** The same words a diary entry or an idea is labelled
  with, not a second set: put them on when you write the task or afterwards,
  press one on a row to see only that one, and pick from the list of the ones
  actually in use. An assistant can read and write them too, and filter by
  one — which is the point, if more than one of them is working your list.
- **A to-do takes a recording.** "Ring the plumber about the thing behind the
  boiler" is quicker said than typed, so the notes box on a task offers the
  same recorder a note and an idea already had, and the task's row plays it
  back rather than showing the address of a file.
- **A recording can become an idea the moment it is made.** Finishing one on
  the recordings page offers to write an idea around it, in a strip above the
  list that blocks nothing and can be waved away — press it and the composer
  opens with the recording already in the box. The same button is on every
  row, so one made last month is no harder to use than one made just now.
- **A notebook's notes can be put in the order you want them.** They are still
  read in the order they were written, which is what a notebook is for, but
  there is now a picker above the list for title or last edited, and an arrow
  that turns any of them round. A pinned note still leads whatever you choose,
  and the choice is remembered on the device you made it on.
- **New note sits where Delete used to, on the notebooks page.** Destroying a
  notebook was one press away from a list you were only browsing; it now lives
  on the notebook's own page, and the button beside Open writes a note instead.
- **A notebook's task list stops looking out of date.** It said "Nothing
  waiting" while the tab above it said "Tasks 1/1", because the finished task
  was hidden and nothing said so. It now says how many the buttons above are
  holding back, and Show completed carries the number.
- **An assistant reading a long list is told what the list left out.** Asking
  for your todos handed back fifty of them and called that the count, so the
  newest were invisible and the tool looked out of date rather than cut short.
  Every capped list — todos, the diary, ideas, workout sessions — now says how
  many there are altogether, how many are left, and where to carry on from.

## 0.180.0 — 2026-09-18

- **An item's own fields are called attributes, and one of them can be just a
  word.** "cable" says as much as "kind: cable", so a name with no value is a
  whole attribute and the chip reads as the bare word rather than "cable:".
  The value box says it is optional, and a value typed with no name — which
  used to be quietly thrown away — is refused with a message while you can
  still see what you wrote. Attributes can be filled in while a thing is being
  written down, not only afterwards.
- **One section in Account for which ontoplano you are looking at**, rather
  than two saying nearly the same thing. In the app it hands you back to the
  chooser on the phone; in a browser it opens the chooser here.
- **The white slab is gone from the last places it was hiding.** Theme and
  error-report pickers, the plan's repeat choices, the board and goal filters,
  the habit day picker: all of them wore a fill that inverted with the theme,
  which in the dark theme was a white block — and on a toast, white text on a
  white block. The buttons that take a payment now have a shape of their own
  instead of borrowing it.
- **Fixed: a drag label and two toasts were unreadable in the dark theme** —
  white text on what had become a near-white slab.
- **Fixed: on a phone, choosing how far ahead the reminders list looks did
  nothing.** The dialog closed and the window never changed.
- **A notification about what an assistant did opens the thing it did it to.**
  Four writes into one notebook open that notebook, and a burst of todos opens
  the todo list; only a burst that went everywhere still opens the log.
- **Setting a reminder closes the form**, rather than leaving it open over the
  list the new one just joined.
- **The attribute boxes say what goes in them** — "my attribute" and "my value
  (optional)".
- **Fixed: a reminder set on a block you already had never arrived.** The lead
  was stored and read when a day is generated, so it reached the days made
  after it and none of the ones already on your week — which are the ones you
  set it for. The days that exist are armed as soon as you save, a changed
  lead moves them, and taking it off takes them away.
- **The block form says which block.** Its header carries the thing's name and
  the category it is in, as a pill in that category's own colour; a category
  block has no name of its own, so that line is a dash.
- **Inventory has an Attributes screen.** Everything your things say about
  themselves, with how often each is said and what values it takes — and the
  three things a list of names cannot do on its own: rename one everywhere
  (renaming onto a name that exists merges them, which is how "Colour" and
  "colour" stop being two things), rename one of its values, and take one off
  everything. A colour can sit on an attribute or on one of its values, and
  the chips on the rows wear it.
- **And a Filters screen**: how many there are, at least and at most, and the
  same tree of attributes — press the attribute itself for everything that has
  one, whatever it says, or one of its values. The button says when something
  is being held back.
- **A workout asks how much you did, where you say you did it.** The measures
  a workout declares — pull ups, rows — are now listed by name with a box for
  the amount: on the block you are ticking off, and in the session editor,
  which used to offer one empty line and expect the names to be typed again
  from memory. Blank is still fine; a session with nothing measured is still a
  session.
- **The tab icon is the sharp one again.** The app offered browsers an SVG
  favicon, which is not a vector — the mark is a drawing, so that file is a
  256-pixel image in a wrapper — and a browser given a scalable icon prefers
  it over every sized one. So every tab shrank that image with its own fast
  filter, turning the ring into a smear and the puffin's eye into a grey
  smudge, while the 16 and 32 drawn carefully at build time went unused. They
  are what a browser gets now, with a 48 beside them for bookmark bars and
  pinned shortcuts.
- **The review is one panel with a toggle**: what you did, and what you did
  not. Both read the same way — under the day they happened on — and a block
  you did can be sent back with "it did not actually happen", which returns it
  to the open questions where the ordinary answers are. Where the week went is
  a ring with the hours in the middle rather than a column of numbers to
  divide in your head.
- **One block can happen on several weekdays.** Monday, Tuesday and Wednesday
  used to be three blocks — three to edit, three to move, three to delete, and
  nothing saying they were the same thing. "Some days" under How often takes
  as many as you like.
- **Fixed: making a block once-only, or recurrent, left the wrong fields on the
  form** — the rhythm panel on a one-off, a date asked of something repeating.
- **A recording in an idea or a note about somebody is a player.** It was the
  markdown link that stores it — a file name sitting in the middle of your own
  writing — and it is a playhead under the words now.
- **The board's filters fold away on a wide screen too**, and where the day
  went reads under the columns rather than above them.
- **Signing in and registering wear the mark**, not the word on its own.
- **Notes in a notebook can be kept at the top.** As many as you like: the
  measurements, the account number, the thing the notebook is actually for.
  Pinned ones sit above the rest — most recently pinned first — and are marked
  rather than merely moved. An assistant can pin one too.
- **A note on a block is optional in every mode**, and the field no longer
  changes shape when you change the mode. A category block with nothing
  written on it draws as its category, which is what it is.

- **The shopping list is a reading of the inventory, and the data says so
  now.** The two tables behind the room were still called after the list;
  they are the inventory's, and what you keep and where it lives is what they
  hold. Nothing on the screen moved, and nothing in a list was lost.
- **For anything you have pointed at the API:** the endpoints are
  `/api/v1/inventory/...` rather than `/api/v1/shopping/...`, the permission
  to reach them is `inventory:read` / `inventory:write`, and the one for
  rooms and drawers is `locations:read` / `locations:write`. Keys already
  made were moved across, so nothing you handed out has to be made again.
- **For an AI assistant:** `add_to_shopping_list`, `remove_from_shopping_list`
  and `file_shopping_item` are `add_inventory_item`, `remove_inventory_item`
  and `file_inventory_item`; the sections are `inventory_categories`,
  `add_inventory_category`, `change_inventory_category` and
  `remove_inventory_category`, and `set_item_fields` is
  `set_item_attributes` with its argument renamed to match. `shopping_list`
  keeps its name, because the shopping list is what it answers with.
- **For a webhook:** `shopping.added` and `shopping.bought` are
  `inventory.added` and `inventory.bought`. Subscriptions were moved across.

## 0.179.1 — 2026-09-17

- **The tab shows the mark, not a browser's guess at it.** The icon offered to
  a browser was the full-size drawing, and shrinking it seventy-to-one turned
  the ring into blocks of colour and the puffin into a smear. It is drawn at
  the size a tab actually shows now.
- **Setting up an AI assistant reads in your own language.** The text to hand
  it was English wherever the rest of the app was not; the commands in it stay
  as they are, because those are typed rather than read.
- **Fixed: a new instance's config file was missing a setting** it was
  supposed to be given, so the file it wrote did not match the file it
  documented.

## 0.179.0 — 2026-09-17

- **A Media room, and you can record in it.** The Gallery is a tab inside it
  now; the other tab is Recordings. Press the recording wedge on the `+` wheel
  and it starts recording — hear it back, scrub through it, name it or leave
  the name alone and it is filed under the moment you made it. Recordings can
  go into a note or an idea, where they play inline.
- **The app remembers what it has told you.** Every notification is kept, so
  "what did it say while I was out" has an answer rather than depending on
  which device happened to be awake.
- **Fixed: reminders reached no phone pointed at a server.** The list of
  alarms gave a wall clock where the shell wanted a moment, so every one of
  them was read as the epoch and skipped — silently, every time.
- **Fixed: setting a phone up to ring worked once per account.** The key it
  makes is named, and the name stayed taken by the key it had just revoked.
- **Fixed: a second calendar link was refused**, for the same reason.
- **Fixed: the `+` wheel sat half behind the bar it comes out of**, which made
  the wedge nearest your thumb the hardest one on the screen to hit.
- **Notifications each have one switch** instead of a pair of On and Off
  buttons, and setting the hour no longer turns the notification off.
- **The status bar shows the bird** rather than an octagon with a dot in it.

## 0.178.25 — 2026-09-17

- **The AI tab's first step reads like what it is.** "Create a key" is a
  disclosure with a chevron rather than a filled button that looked like it
  would do something on its own; the warning about not sharing a key appears
  when you are about to make one rather than before you have; the count is the
  link — "See your keys here (4)" instead of a sentence and a link beside it;
  and what a key may work on is asked after what it may do, since most keys
  reach everything and that case should not scroll past a choice it will not
  make.

## 0.178.24 — 2026-09-17

- **First run asks which language before it asks anything else.** It starts on
  whatever your browser said it wanted, so for most people it is a confirmation
  rather than a question — and choosing applies it to the rest of the wizard
  immediately, rather than at the end.
- **On a dev or staging build, anything still in English reads red.** Nothing
  changes in the real app: the marks and the code that looks for them are only
  in those builds.

## 0.178.23 — 2026-09-16

- **The whole app can be read in Portuguese.** Every word on every screen, and
  every email the app sends, now comes from a catalogue rather than being
  written into the code — 2,365 messages. Choosing a language in
  Settings → Preferences changes the app, the language your mail arrives in,
  the way dates are written, and the notification channels Android shows in its
  own settings. Roughly a third of it is written in Portuguese so far; the rest
  shows in English and the settings page says how many.

## 0.178.22 — 2026-09-16

- **The app's icon sits on its own dark again, not on white.** The tile behind
  the mark was a cream of its own, so on a home screen the ring's colours
  floated on nothing and ontoplano was the one white square in the row. Every
  masked icon — the Android launcher on all three flavours, the PWA's maskable
  one, the icon iOS reads — now uses the dark measured out of the mark itself.
  On Android the foreground layer is the mark alone, which is what an adaptive
  icon is supposed to be; it was being handed the web icon, ground and all,
  which painted over the background colour entirely.

## 0.178.21 — 2026-09-16

- **The app can be read in another language.** Settings → Preferences has a
  language, and choosing it changes the app, what the document declares itself
  to be for a screen reader, and the language mail is sent to you in. Brazilian
  Portuguese is the second language; English is the one the app is written in.
  The screens themselves are still being moved over, and the settings page says
  how many messages a language is still showing in English.

## 0.178.20 — 2026-09-16

- **Fixed: while the app waited, the middle of the mark turned a circular hole
  in itself.** The layer that spins was cut to the medallion the logo used to
  have in its middle, plus a margin — a disc that lands inside the artwork of
  a mark that carries a drawing there instead. It is cut to the ring's inner
  edge now, measured off the picture like everything else about it, so
  whatever the mark holds turns whole.
- **The mark reads as a drawing wherever it says "not the ordinary copy".**
  The dev and staging icons, the wheel in an instance that runs on the device,
  and the phone bar under it all drained the mark's colour and left its own
  dark exactly as dark — which at the size a launcher draws is a black disc
  with a grey edge. Those now wear the mark with its dark lifted a little.

## 0.178.19 — 2026-09-16

- **Fixed: on a phone that is its own instance, no reminder was ever booked
  with Android.** It asked for an exact alarm, which needs a permission this
  app deliberately does not request, and the refusal was swallowed — so
  nothing was scheduled and nothing said why. It books an inexact one instead
  now, the way the app's other half always has: late rather than silent.
- **A reminder makes its sound when it arrives, not when you open the app.**
  Android takes the sound from a notification's channel, and the alarms the
  phone books for itself were landing on a default one that posts silently.
- **The notifications screen no longer offers what this instance cannot do.**
  An instance that lives on the phone cannot send Monday's review mail, and
  the row said so instead of showing a switch that was a promise.
- **"Notifications on this device" says one thing instead of three.** It had a
  headline, a paragraph restating it, and a third about how often the phone
  asks.
- **Setting this phone up to ring says whether it worked.** It goes out to the
  copy on the device and straight back, which looked exactly like a button
  that did nothing.
- **On a phone, what the app tells you appears above the tab bar** rather than
  over the header of the screen you are on.
- **New accounts start with work, study and personal** rather than work,
  health and personal.
- **Fixed: the demo said it was full when it was you it was throttling.** Five
  copies an hour from one address is what stops a script taking them all; it
  says that, and when the next one is free, instead of blaming the server.

## 0.178.18 — 2026-09-16

- **Writing something down says where it went.** The quick adds — Idea, To-do,
  Note and Buy — close their dialogue and that was all: on the screen you are
  looking at nothing changed, which reads as nothing having happened. They say
  which room took it and quote what you wrote, on the phone and on a desktop.
- **A quick add that fails says so.** From the capture wheel it said nothing at
  all: the dialogue simply appeared to ignore the button.

## 0.178.17 — 2026-09-16

- **The Android build targets API 36**, which is what Google Play will accept.
  A bundle behind that is refused on upload — after the build, the signing and
  the wait — so the level is now held by a test rather than discovered by a
  rejection.
- **The mark goes round at least once on every route change.** It used to sit
  still for a fraction of the room slide before moving, so that a navigation
  finishing inside the movement left no trace — which on a desktop is most of
  them. The one thing on screen saying the app heard you was missing exactly
  when the app was quickest.

## 0.178.16 — 2026-09-16

- **One screen for everything the app tells you about.** Under Settings →
  Preferences: the blocks on your plan, the end of the day, the weekly review,
  the weekly review by email, bills and birthdays, each with a switch. Until
  now every one of them decided for itself — the review nag always happened,
  bills always happened, the Monday mail was a checkbox on another page, and a
  block could only say anything if you had given that block a lead time by
  hand. Nothing changes by the screen appearing: what always happened still
  does, what never did still does not.
- **Every block on the plan can say so as it starts**, without setting a lead
  time on each one. Off by default; on, it nudges for whatever is still ahead
  today, with the block's own name.
- **The end of the day**, at an hour you choose — "that was today, four of six
  done, two still to say". It opens on the hour your planner closes, because
  that is where you have already said your day ends.
- **Fixed: an instance running on the device wrote almost none of these.**
  Bills, a week left open and today's birthdays were written by the delivery
  job, which needs a server — so on a phone that is the instance only the
  birthdays existed, and a reminder that is never written looks exactly like a
  day with nothing on it.

## 0.178.15 — 2026-09-16

- **"Running it yourself" says what is true.** It claimed nothing ever leaves
  the machine — it does: SMTP, the browser's push service, and whatever
  calendar feed or webhook address you type in — and that systemd is needed
  whatever route you take, which Docker does not. What each of the four routes
  needs is a table now, `ontoplano start|stop|restart` is in the command list
  where it was missing, and the background jobs are one section instead of an
  essay.
- **The Arch instructions were for a package that does not exist.** The docs
  said `yay -S ontoplano`; ontoplano is not on the AUR, which has suspended new
  accounts, and the README has said so since the release. Every page now walks
  through the `PKGBUILD` and `ontoplano.install` the release attaches, and
  `makepkg -si`. The `.deb` and `.rpm` upgrade lines named files with no
  version in them, which is a 404.
- **What is actually running is described honestly.** "One Node process and one
  SQLite file, no queue and no cache" was not true of any install: two timers
  are installed beside the app, and the Docker image runs them inside the
  container. The README also offered two ways to run it when there are three —
  the Android app can be its own instance.
- **The AI agents page asks which assistant you use.** The four setups were
  printed one after another, so most of the page was somebody else's client.
  They are a row of answers now, the same shape as Settings → AI &
  Integrations, and a link to one of them opens the one it names. With
  JavaScript off every setup is still on the page under its own heading.

## 0.178.14 — 2026-09-16

- **Fixed: on a phone that is the instance, the reminders about to go off were
  never booked.** The list handed to Android compared each reminder's
  wall-clock time against an instant in UTC, which happens to line up in UTC
  and does not anywhere else — three hours west, everything due in the next
  three hours sorted as though it had already been. The alarms that mattered
  most were exactly the ones missing, and only for people who do not live in
  UTC.
- **A notification says which ontoplano it came from.** Both instances can be
  open on one phone. Android keeps only the outline of a notification's icon
  and throws its colours away, so the two cannot differ there — they differ in
  the accent beside it, wearing what they already wear on the home screen: the
  ordinary blue, or the same blue with the lights off.

## 0.178.13 — 2026-09-16

- **A reminder cannot be set for a time that has already been.** One made in
  the past is due the instant it exists — it fires immediately, or it lands in
  "already been" as something you were never told. The form said so and the
  server did not, so anything that was not the form could still write one. The
  day field stops at today, the button says why it is dead, and an assistant
  that reads the wrong year is told.
- **Arranging the dashboard: two controls, on the title's line.** The handle
  sits at the outside edge where a thumb reaches for it, hide is beside it, and
  the arrows are gone — dragging works with a finger now, which is what they
  were standing in for. Both line up with the button they replace rather than
  hanging below the title.

## 0.178.12 — 2026-09-16

- **A reminder that is already set can be changed.** Moving one half an hour,
  rewording it, or giving a silent one a sound meant deleting it and typing it
  out again — it could be made and unmade and nothing in between. The pencil on
  its row opens the same four questions the form asks, and an assistant has
  `change_reminder` for the same job.
- **A reminder can be silent, loud, or neither.** "Neither" is what a nudge
  before a block says when it has no opinion and follows whatever that kind of
  reminder is set to, and the editor can put it back to that.
- **Fixed: Preferences told you reminders only arrive while ontoplano is
  open** — directly above the paragraph explaining that this phone books
  Android's own alarms for them, which is what actually happens. It says which
  of the two is true for the phone you are holding, and a phone that is not set
  up yet gets the one press that does it instead of a promise.
- **The mark keeps turning while the instance loads, and lands when it is
  ready.** It used to finish its turn on the screen you pressed and then go
  still for the whole of the wait, which is exactly backwards: the page you are
  waiting for loads after that screen is gone. The turn is handed to the
  instance now and comes to rest when the app is actually there.
- **Import a folder of markdown from inside New notebook**, rather than from a
  card of its own further down the page.
- **Notes in a notebook read oldest first**, the order they were written in.
- **The notebook's tabs fit a phone**, instead of running off the side of it.
- **Arranging the dashboard is quieter.** The handle sits where each card's
  Open button was, the buttons that do nothing while you are dragging are out
  of the way, and Done is where Arrange was rather than in a bar of its own.

## 0.178.11 — 2026-09-16

- **Choosing an instance turns the mark once, properly.** It twitched on the
  copy this phone carries and cut itself off halfway on a server, because the
  page that starts the turn is replaced by the instance before it can finish
  one. It goes round and lands upright first, the way every other wait in the
  app ends, and then the instance opens.
- **The menu that fans out of the account button opens higher and further
  left**, out from under the thumb that opened it.

## 0.178.10 — 2026-09-16

- **Fixed: the dashboard's Diary card showed notes from your notebooks.** Both
  kinds of writing live in one place, and the card asked for the most recent of
  anything — so a line from a project notebook turned up under the diary's
  heading, with the diary's own last entry nowhere. It asks for the diary now.
- **The mark keeps turning until the instance opens**, rather than turning once
  and going quiet while the wait carries on.

## 0.178.9 — 2026-09-16

- **Fixed: the reminders page said your reminders only arrive while the app is
  open.** They ring with it closed, and have since the phone learned to set
  Android's alarms for an instance — Preferences said so on the same phone, at
  the same moment. The page could not ask the phone anything, so it assumed the
  worst; it asks the instance instead, which is what handed the phone its key,
  and says what is actually true. A phone that has not been set up is offered
  the one press that does it rather than a warning.

## 0.178.8 — 2026-09-15

- **The instance says "One life, one app."** — the same sentence the site opens
  with, rather than a different one about weeks.

## 0.178.7 — 2026-09-15

- **Fixed: moving quickly between pages could log a network error.** The part
  of the app that serves files while offline answered a request that had
  already been abandoned by failing outright, rather than by saying the file
  did not arrive. Nothing was broken on screen, but it was a real error in the
  browser's log, and on a device it could do the same to a picture.

## 0.178.6 — 2026-09-15

- **The mark turns when you choose an instance**, in the place the app's own
  bar will draw it — so the logo is what carries you across rather than
  something one screen has and the next replaces. It is the same turn the app
  makes while a room loads: it winds up, goes round once, and lands upright
  before the instance opens, rather than being cut off mid-turn.

## 0.178.5 — 2026-09-15

- **The mark does not move when you choose an instance.** It is drawn on the
  chooser in exactly the place the app's own bar will draw it, from the same
  measurements — so the app arrives around a logo that has not shifted rather
  than replacing one screen's with another's.

## 0.178.4 — 2026-09-15

- **Claude is one choice again when you hand the app to an assistant.** It was
  three of the six — the plugin, the command line, the desktop app — which made
  a row of choices out of what is one answer to "which assistant?", and put
  Codex and Cursor at the end of it. The three ways in are labelled blocks under
  one tab now.
- **The instance chooser keeps perfectly still.** Both answers are laid out in
  the same place and the taller decides the height, so choosing between them
  moves nothing — and it stays true the next time either one gains a line,
  which a fixed height would not have.
- **And the mark on that screen is a window.** The dark field between the ring
  and the middle is knocked out, so the ring is a ring of colour with the page
  showing through it. It is derived from the logo itself, so replacing the logo
  cannot leave a stale second one behind.

## 0.178.3 — 2026-09-15

- **Reaching for a tab that is off the screen no longer changes tab.** Dragging
  the strip along until the last one appears ends with it against its end,
  which the swipe read as "this is finished, the gesture is mine" — so one drag
  did two things and the second was not asked for. A strip the finger moved
  keeps the whole gesture now; swiping across one that was already at its end
  still goes to the next section.
- **Making somebody an administrator takes a deliberate second press.** It was
  one ordinary button in a row of small ones, and what it grants is every power
  that page has, including deleting every other account. It says whose account
  and what they will be able to do, the confirm ignores a reflex double-click,
  and Cancel sits where the button was.
- **The instance chooser shows the mark of the instance you are choosing** — in
  full colour for one behind a server, drained of it for the copy this phone
  would carry, which is what that copy's own menu and launcher icon already
  say. Choosing between them moves nothing on the screen any more either.
- **The bar at the top of a phone screen has square corners again.** It reaches
  both edges, so its rounded ones had nothing to sit against and left slivers
  of the page showing through at all four.

## 0.178.2 — 2026-09-15

- **Handing the app to an assistant now sticks.** Each snippet on
  AI & Integrations is the version that lasts: Claude Code's command keeps the
  server for every project rather than the directory it was typed in, and
  Codex's key goes in the shell profile instead of one shell. The page links
  the docs page that shows the whole of it, assistant by assistant.

## 0.178.1 — 2026-09-15

- **The to-do list can be ordered by what you just finished.** The order button
  has a third setting: finished work first, newest at the top, with everything
  unfinished keeping the order you put it in. It is a real record of when
  something was done rather than when it was last touched — renaming a task no
  longer counts as doing it.

## 0.178.0 — 2026-09-15

- **The phone is set up to ring by opening it**, rather than by pressing
  anything. The first time the app opens an instance it has no key for, it asks
  for one and keeps it. What is left on the screen is the two things somebody
  might actually want: to stop, and to try again when it has not worked.

- **Reminders arrive with the app closed, whichever ontoplano you use.** Until
  now that was true only of the instance the app carries on the device: a
  server cannot wake the app — Android's web view has no push — and a page
  served by that server cannot reach the phone's alarm clock. So the phone asks
  instead. One press on Preferences hands it a key that reads the alarms about
  to go off and nothing else; from then on it books Android's own alarms, asks
  again every few hours, and does it again after a restart. No Google services
  anywhere in it, and it works the same for an instance you host yourself.
- **The key is the narrowest one the app issues.** `reminders:read` sees what
  you asked to be reminded of — not the calendar it hangs from — and it is
  revocable like any other under AI & Integrations. Setting it up again
  replaces it, so a phone you no longer have stops working rather than keeping
  a key.

## 0.177.10 — 2026-09-15

- **Fixed: the app blamed Android for something Android had allowed.** An
  instance shown inside the app is served by that instance, and the app's
  plugins reach only the copy it carries — so the notification setting could
  not ask the phone anything, and read that silence as "Android said no, and
  will not ask again". It says what is actually true now: the alarms belong to
  the copy of ontoplano on the phone, and reminders from a server instance
  arrive while the app is open. The buttons that could not work are gone from
  that screen and from the reminders page.

## 0.177.9 — 2026-09-15

- **Fixed: "Switch instance" in the phone app opened nothing.** It pointed at
  `ontoplano://instance`, a native screen from before the chooser was a page,
  and the web view answered "unknown url scheme". It goes to the chooser on the
  copy of the app the phone carries — and it is one link now, not two saying
  the same thing in two places on the same screen.
- **It is offered on the device's own instance too**, where switching means
  going to a server rather than coming back from one.

## 0.177.8 — 2026-09-15

- **Two people building the same commit now write the same launcher icons.**
  They were resized by whatever ImageMagick was installed, so every build
  rewrote forty-five files with one machine's bytes and the next build put the
  other machine's back. They are drawn by the rasteriser this project pins now,
  which is also what makes them checkable by anybody reproducing an F-Droid
  build.
- **The two builds stopped tripping over each other.** The app and the copy
  that runs on a device compiled through the same working directory, so running
  them at once — which the test suite does, every run — could leave one build's
  files in the other's output. A directory each.

## 0.177.7 — 2026-09-15

- **The device's main menu is drained of colour when it is shut, too.** Only
  the open wheel had lost its colours, so the bar looked like the ordinary app
  until you pressed and held it — and the mark changed colour on its way up,
  which makes one object look like two.
- **Settings → Instance says which one this is.** "Isolated — this device, on
  its own. No server, and nothing leaves it," above the version. The mark is
  the glance; this is the sentence behind it.

## 0.177.6 — 2026-09-15

- **The instance on your device says so in its main menu.** Somebody can be
  running both — this device's own instance and one behind a server — and the
  two are the same app to look at, which is a bad way to find out which week
  you have just written into. The mark in the middle of the wheel is drained of
  its colour on the device, the way the dev and staging icons have said "not
  the ordinary copy" since there were two builds on one phone. The served app
  is untouched.

## 0.177.5 — 2026-09-15

- **Fixed: a phone that had refused notifications could not be talked round.**
  Android stops showing the permission dialog after two refusals, so the app's
  "Turn on" button did nothing at all and the screen could only describe where
  in the phone's settings to go. There is a button now, on the notifications
  setting and on the reminders page, and it opens that screen. The two states —
  never asked, and refused for good — are no longer drawn as one.
- **Reminders arrive wearing the mark.** Android keeps only the shape of a
  status-bar icon and throws its colours away, so the launcher icon turned up
  as a white blob. It is the mark's own silhouette now — one octagon inside the
  other — drawn as a vector, so it is sharp on every screen.

## 0.177.4 — 2026-09-15

- **Urgency, interest and energy are sliders.** Five numbered buttons each was
  fifteen targets for three answers, and "none of them" was a second press on
  whichever one was already lit — which nobody guesses. Off is the left end of
  the track now, so setting a scale and clearing it are the same drag.
- **A key tied to a notebook can still hang a task on that notebook's goal.**
  Judged on every id it could take, the tool that links them reaches outside a
  notebook and was refused outright; judged on what it actually requires, it is
  a goal tool with an optional list — and an id from outside is still refused
  when one is passed.

## 0.177.3 — 2026-09-15

- **A key for an assistant can be tied to one notebook.** Permissions used to
  be about the whole account — "your to-do list" meant every to-do there is —
  and the thing most people want to hand an assistant is narrower: work on this
  project with me. A key made for one notebook reaches that notebook, the tasks
  and goals filed under it and the notes written in it, and nothing else in the
  account exists to it. The permissions it cannot use are greyed out as you
  choose, because a box that grants nothing is worse than no box.
- **The assistant is a plugin now, for Claude Code.** Two lines to install, and
  it asks for the address and the key rather than having a header pasted into a
  configuration file — the key goes to the system keychain. It brings `/today`,
  `/week` and `/capture`, and the standing instructions that otherwise have to
  be repeated every conversation: read before writing, never write down a goal
  somebody did not commit to.

## 0.177.2 — 2026-09-15

- **An assistant can no longer be handed a number that is not yours.** Seventy
  of the assistant's tools take an id, and what kept each of those inside your
  account was every service filtering by account itself, in every query it
  writes — one forgotten line away from somebody else's week. Each tool now
  says which of its arguments name a thing and what kind of thing, and the id
  is looked for among the rows the key can already list. An id belonging to
  somebody else and an id belonging to nobody are refused in the same words, so
  the refusal cannot be used to ask what exists.
- **A goal can be filed under a notebook by an assistant**, which the app has
  always allowed and the tools did not.
- **The opaque icon keeps a margin from the edge**, so it reads as a mark on a
  tile rather than as a crop of a bigger drawing.

## 0.177.1 — 2026-09-15

- **Fixed: dismissing the tour in the phone app did nothing.** Its "I have been
  shown around" answers 204, which means there is no content — and the phone
  app's own request layer handed that back with a body, which the browser
  refuses outright. So the press threw instead of being recorded, and the tour
  came back on the next screen. Every answer of that kind was affected, not
  only this one.

## 0.177.0 — 2026-09-15

- **Asking to be told when something ships works on the first press.** It used
  to write the address down and wait for a confirming click in a mail, and the
  people who never went back to their mail were never on the list. Pressing the
  button is the answer now. What that gives up is the proof that an address
  belongs to whoever typed it; what stands in its place is a hard limit on the
  form and a way off the list in every message.
- **And there is something to be told.** The release notes go to the list as
  one message per person, each carrying that person's own unsubscribe link —
  never one mail naming everybody, which would hand the list to all of them.
  A version that has already gone out cannot go out again.
- **The pages those links land on are pages, not the app.** Following "stop
  these" out of a message drew the bar, the wheel and the rooms around a single
  sentence, offering a way into something the reader may have no account for.
- **A 512 icon with nothing transparent about it**, on the mark's own dark, for
  the places that refuse an alpha channel.

## 0.176.10 — 2026-09-15

- **Fixed: a phone-only instance offered AI & Integrations.** Every part of
  that tab is something reaching this instance over a network — an assistant, a
  calendar subscription, a webhook, a data stream — and a copy that lives on
  one phone is not on a network at all. It appeared the day a device got an
  account page, because one flag was answering two different questions.
- **The unit suite waits ten seconds rather than five.** What the limit has to
  survive is importing the services, not the tests themselves, and a green
  suite that goes red because the machine is busy teaches people to re-run
  instead of to read.

## 0.176.9 — 2026-09-15

- **Both wheels are round on the outside.** Only the outer edge: the hole
  keeps the mark's own outline, because the hole is the mark. The rim was
  eight mitred bands following an octagon and is one circle now.
- **The capture wheel is a third bigger.** Four wedges under a thumb should be
  four targets rather than a badge.
- **The back gesture closes what is open before it leaves the page.** Pressing
  back with a quick to-do on screen did whatever the page underneath would
  have done — which on the first screen of a session is leaving the app. A
  form, or a wheel, now goes first.
- **Unmaking a phone-only instance asks you to type “ERASE ONTOPLANO”.** It
  borrowed the wording of a different button on a different screen, unquoted,
  which is how somebody types a phrase from muscle memory without reading
  which screen they are on. It names the thing being destroyed now.

## 0.176.8 — 2026-09-15

- **Fixed: the phone app threw on every navigation.** Yesterday's fix for
  keeping your place read something a device's own instance does not have. It
  broke nothing you could see and it should not have shipped; the device build
  now runs clean.
- **Fixed: the account button on a device went to Preferences.** A device grew
  a real account page — your data out, your data in, and the end of the
  instance — and the button that should open it was still pointing at the old
  answer. Which mattered more than it sounds: moving to another instance lives
  on that page, and on a phone-only instance it is the only door there is.

## 0.176.7 — 2026-09-14

- **Fixed: changing how far ahead Reminders looks threw you back to the top.**
  The shell scrolled its own box to the top on every navigation, which
  overrode the "the address changed and nothing else did" the page was asking
  for — that flag governs the window, and on a phone the box that scrolls is
  the page area. Pressing "30" now leaves you where you were, under the control
  you pressed. A navigation that ends on the screen it started on is not an
  arrival.
- **Fixed: the new tooltips threw in the console.** A focus can land in the
  middle of the page being drawn — an autofocused field is exactly that — and
  the tooltip wrote to the page's state from inside that, which Svelte refuses.
  Nothing visible was broken; it is silent now, and the bookkeeping never
  touches the drawing.

## 0.176.6 — 2026-09-14

- **The app draws its own tooltips now.** Every `title` in it — three hundred
  of them — was being rendered by the browser, in a system font with a system
  delay, which made the one thing that appears when somebody is unsure look
  like a different program. Nothing was swept: one listener takes the attribute
  off whatever the pointer is resting on, draws the label in the app's own
  chrome, and puts the attribute back when the pointer leaves, because a title
  is also an accessible name where there is no label beside it. Keyboard focus
  brings it up too, Escape dismisses it, and a phone is unchanged — it never
  showed these at all.

## 0.176.5 — 2026-09-14

- **Fixed: every settings form stopped saving.** A hook added for the device's
  restore made the submit handler read an argument, and the test that stands in
  for SvelteKit was calling it with none — so the suite went red on a change
  that worked in a browser. The stand-in now calls it the way SvelteKit does,
  and the hook has tests of its own.

## 0.176.4 — 2026-09-14

- **A device can take an export back in.** It was left out of the last release
  and explained as something a browser cannot do, which was wrong: the restore
  is the same walk over every table either way. What it needed was the app's
  own portable digest instead of Node's, a base64 decode that does not go
  through `Buffer`, and somewhere for the copy it keeps before replacing —
  which on a device is a download to the person rather than a file beside a
  database nobody can reach. The restore will not run if that copy fails.

## 0.176.3 — 2026-09-14

- **The account and instance tabs work on a device.** An instance that is the
  phone itself had neither: the person button went to the instance chooser and
  the menu offered an account page that refuses. Both are there now, showing
  the half of each that is true — your data out as a file, and the end of the
  instance, which on a device is one act rather than two; and the build that is
  running with the file the data is kept in. What needs a server is absent
  rather than blank. Bringing an export back in is still server-only: the
  restore writes a copy of what it is about to replace beside the database and
  hashes the picture bytes it carries, and neither has a device answer yet.
- **The five small things are a flower now.** Account in the middle, bigger,
  just above the thumb, with the rest in a quarter turn of arc above it —
  rather than scattered around it in a ring, which read as a clump.
- **The capture wheel is two-thirds the size of the rooms wheel.** Four small
  things written down in passing did not need the whole screen, and its plus
  is drawn on its own dark ground: it was the chrome's white ink over a
  transparent hole, which on a light page was nothing at all.

## 0.176.2 — 2026-09-14

- **The `?` in the corner of the phone is gone.** It was a square parked over
  every screen, on top of whatever was under it. Pressing the account button in
  the bar fans the five small things out above the thumb instead — your
  account, the tour of this screen, telling the operator something is wrong,
  the documentation, and supporting ontoplano. Chosen the way the wheel is:
  drag onto one and let go, or lift and tap. The press that opens it never
  chooses anything, which is why it flies up clear of the finger. The corner
  dock stays on a wide screen, where a corner is a corner.
- **The wheel takes the mark with it, and brings it back.** The bar kept
  drawing its own copy while the wheel was up, so the flight read as a second
  mark appearing rather than as that one moving. The socket it came out of is
  empty while it is away, and both wheels now fly home into the button when
  they close rather than simply ceasing to be there.
- **An isolated instance stops offering an account it does not have.** The
  person button went to the instance chooser and the menu offered an Account
  page that refuses; it lands on the settings that do exist there, and choosing
  a different instance is one of them.

## 0.176.1 — 2026-09-14

- **Both wheels fly their middle up from the bar.** The rooms wheel never
  did: it is anchored at its own drawn position on any screen narrower than a
  laptop, and the flight was measured from that anchor rather than from the
  button under the finger — so the vector was zero and only the capture
  wheel, which has no anchor, appeared to move. Same journey, same speed, for
  both now.
- **The capture wheel has a big plus in its middle.** It was flying the app's
  own mark up out of the `+` button — the wrong answer to a wheel that has
  nothing to do with the brand. Same journey, its own symbol.
- **The wheel's middle is the logo, whole.** It was the medallion with the
  ring cropped off and a black ring drawn back around it — a different
  drawing from the one in the bar it came out of, and eight pixels taken from
  the rooms. The rooms have them back, and the mark in the middle is the mark.
- **The logo flies up into the wheel.** It comes out of the bar where your
  thumb is and lands in the middle, a beat after the rooms have bloomed
  around it.

## 0.176.0 — 2026-09-14

Security and a menu that goes one level deeper. The audit before the store
release found four things worth naming, all fixed here.

- **A webhook's signing secret is shown once, when the hook is made.** It was
  returned by every listing of `/api/v1/webhooks`, sat in the Integrations
  page's payload and rode along in account exports — so any read-only leak
  handed over the ability to forge signed deliveries for ever, and there is
  nothing to rotate. The row shows the first characters now, enough to tell
  two hooks apart and not enough to sign with. The API tokens beside it have
  always worked this way.
- **Signing in is no longer a way around the rate limit.** The call budget
  was spent on API tokens only, so a script with a session could ask the
  server to post to somebody else's address as fast as it liked — ticking one
  shopping item on and off is two cheap requests and ten outbound deliveries.
  The budget is the account's now, and this instance holds a bounded number
  of sockets open to any one host.
- **An assistant that may not delete really cannot.** Two tools — deleting a
  finance sorting rule, taking a block off a day — removed rows on the room's
  write grant alone, while the sentence somebody granted says "it can add and
  change but never remove". Both ask for the destructive grant now, both show
  up in the assistant log with a way back, and a test reads the tools' own
  code so the next one cannot slip through. **Tokens minted before this
  update will be refused those two calls until the grant is added.**
- **The assistant surface stops leaking names it was not granted.** A refusal
  used to recite every habit, category or shopping section; it names the tool
  to ask instead, and that tool is gated. `where_is` needs a name and answers
  only about things that have a place, rather than reading out the shopping
  list to a token that may only see the cupboard.
- **The MCP endpoint takes a bounded body and a bounded batch**, like every
  other endpoint.
- **Opening Integrations no longer reads every data point ever recorded** —
  it asked the database for all of them and counted the array, once per
  stream.
- **A tab can be put away without its room.** Hiding worked at one level, and
  Health ignored it entirely: Recipes could be switched off and the tab stayed.
  Preferences shows the rooms with their tabs underneath now, so Recipes can
  go while Workouts stays. First run still asks about rooms only.
- **The wheel is drawn in the mark's own colours.** Its edges were pure
  black, which is a colour the logo does not contain; the highlight also
  stops at them rather than washing over the outer one.
- **The turning mark winds up and runs down**, instead of snapping to full
  speed and holding it.
- Also fixed: a crafted `?days=` on a stream's page answered with an error
  instead of a sensible window; an absurd value could break a chart for good;
  a plugin's homepage is checked as a web address; and a stream's namespace
  obeys the same shape a manifest must declare.

## 0.175.1 — 2026-09-14

- **Android's own backup no longer copies a phone-only instance to Drive.**
  `allowBackup` was on, which means the system copies everything under the
  app's data directory to the person's Google account — and that directory
  holds the isolated instance's whole database. The screen that offers that
  instance says "no network, ever, for anything" and "nothing is copied
  anywhere"; both were false, and nobody was asked. Exporting from Settings
  is the backup, as the app already says.
- **The store build no longer trusts certificates installed on the phone.**
  That trust is what `make https-local` needs and what a release must not
  have: anything that can add a certificate — an MDM, malware, a captive
  portal that talked somebody through it — could read the app's traffic. The
  dev and staging apps keep it; the official one trusts the system's own.

## 0.175.0 — 2026-09-14

- **A shopping list you can take to the shop.** One button in Inventory opens
  it: everything that has run low, how many to buy — the shortfall, not the
  whole shelf — what each line costs at its last known price, and the total
  at the foot. It says how many lines have no price yet rather than counting
  those as free. The wishlist follows under the total instead of inside it:
  what you would buy if the trip goes well. A sheet on a phone, a modal on a
  desktop.

## 0.174.1 — 2026-09-14

- **The phone has a header again, in the room's own colour.** It was a flat
  grey slab: the one place in the app where changing rooms changed nothing
  above the tabs. It takes the same deep section colour the desktop header
  has, with the same inks on it.
- **Preferences work on a device's own instance.** The whole settings area
  was excluded from the isolated build, so a phone-only instance answered
  "this screen needs an instance with a server" to a page about the person
  rather than the deployment — its server file had been written for the
  device all along. The tabs on a device now show what it actually carries.

## 0.174.0 — 2026-09-14

A minor, and it is what that number is for: every screen in the app now wears
the same furniture, drawn once.

- **Every screen's main action is in the same place — the room's own bar, top
  right.** Fourteen screens each drew their own: filled on one tab and quiet
  on the next, right-aligned here and on the left in Finance, and on Plan it
  said "+ New" while the identical button on Notebooks said "New notebook".
  One button now, one look, one corner, and a screen declares what it is for
  rather than building it.
- **The bar is the same height whether or not a screen has one**, so sliding
  from Activities to Review no longer moves the tabs and everything under
  them.
- **The row of tools under the tabs is one shape everywhere.** Filters that
  sprawled on one tab and folded on the next, three ragged rows on To-do,
  content starting at a different height on every screen — one component,
  filled in.
- **Filters look like filters.** Ideas had two rows in two different selected
  colours, Habits four of its own; every one of them wears the section's
  colour now, and a group's name is set the way every other label in the app
  is.
- **The Board is the Plan's twin.** Where you are comes first, with the same
  arrows the plan has — it had bordered `←`/`→` text buttons and a filled
  Today pill of its own — and Today against To-do is the segmented control
  the plan uses for Day/Week/Month, sharing a row rather than spending one.
- **A card is a to-do.** The board's "New card" form had grown a smaller
  version of the to-do form: a title, a category and the ratings. It is the
  same form now, so a card can carry notes and belong to a notebook.
- **Settings is a room like any other**: its tabs answer a swipe, its header
  is the shape every room's is, and the strip no longer arrives at the last
  tab scrolled half off itself. Administration comes with it.
- **The phone's top bar takes the room's colour**, the way the page under it
  always did — it was the one place where changing rooms changed nothing
  above the tabs.
- **A colour that stands for something is drawn one way.** Category spines,
  tag dots and ledger stripes were nine slightly different marks; a black
  category is also no longer invisible on the dark theme.
- **Nothing wears a keyboard cursor where there is no keyboard.** Eight lists
  drew a hard outline on their first row, which on a phone looked like a
  stuck tap.
- **A toggle says which way it is set** rather than only what pressing it
  would do, and To-do's three stacked controls are one row on a phone.
- **The last row of a list clears the bar.** It sat under the raised mark in
  the middle of the phone's bar.
- **A week still running is not a week you failed** — the review says so
  instead of presenting nought of forty-two as a result.

## 0.173.15 — 2026-09-14

- **Changing tab turns the medallion too**, against the way the tabs are
  sweeping — the same rule the rooms follow.

## 0.173.14 — 2026-09-14

- **The app writes its name the way the site does.** The wordmark — the
  header's, and the one over the sign-in form — is set in Outfit now, light
  and a touch tracked, bundled with the app like its other faces.

## 0.173.13 — 2026-09-14

- **The glow stays inside its wedge.** The black edges are the limits of the
  selection and light does not cross them: the chosen room glows in its own
  colour, brightening away from the centre, and the glow ends exactly at its
  borders instead of washing into the neighbours. The edges themselves stay
  black, chosen or not.

## 0.173.12 — 2026-09-14

- **The medallion turns the way the screens are going.** Screens sweeping
  right spin it clockwise, screens sweeping left spin it the other way — it
  always turned clockwise, whichever way the rooms moved.

## 0.173.11 — 2026-09-14

- **The wheel says its names once, large — on every screen.** The desktop
  kept eleven-pixel labels inside the wedges while the phone already said
  the chosen room big at the top; now the wedges carry their icon alone and
  the name is announced the same way everywhere.
- **The highlight lives on the edges.** Pointing at a room no longer floods
  its wedge with colour: the wedge lifts a shade, and its two black edges —
  the outer rim and the inner ring — take the room's colour with a soft
  glow that fades to nothing.

## 0.173.10 — 2026-09-14

- **A mouse gets no movement again.** The landing that replays a late
  arrival forgot that a fine pointer opts out of the slides entirely, and
  the desktop caught an arrival animation on screens that never slid.

## 0.173.9 — 2026-09-14

- **The phone bar wears the mark's own field.** The dark ground between the
  medallion and the ring — measured off the artwork like the rest of the
  mark — is the bar's colour now, so the mark's inside flows into the bar
  instead of ending at an outline and a hairline.

## 0.173.8 — 2026-09-14

- **Only the medallion turns.** While the app waits, the mark's middle spins
  and the rim stands still — the turning layer is a disc cut just past the
  medallion's measured edge, so nothing clips and nothing shows a seam.

## 0.173.7 — 2026-09-14

- **A screen that loads slower than the slide still arrives.** The room on
  its way out left in an arc, and — when the data outlived the movement —
  the next one was revealed standing in place, out of nowhere. The arrival
  now plays again with the screen finally in it, from the side it was always
  coming from. Tabs the same.

## 0.173.6 — 2026-09-14

- **The turning mark lands on its feet.** When the page arrived mid-turn it
  snapped upright; it now finishes the turn it is in and rests there.

## 0.173.5 — 2026-09-14

- **The phone can actually say yes to notifications now.** Reminders are
  booked with Android only once it grants the permission — and nothing in the
  app ever asked, so a fresh install never notified. The notifications
  section under Preferences asks now, inside the app: Turn on asks Android,
  a test books one four seconds out, and the section no longer answers
  "This browser cannot do it" about a phone whose reminders never went
  through a browser. It also shows on an instance with no push keys, the
  on-device one included — alarms need none.
- **The phone bar's mark spins in place while it waits.** The turn was
  stacking a second centring translate on top of the one that holds the
  button in the middle, so the mark wandered across the bar instead of
  rotating.

## 0.173.4 — 2026-09-14

- **The docs' phone page is about the app now.** It was written for the
  browser-install era: a three-question wizard, browser menus drawn in SVG,
  a list of what you get once there is no address bar, and instructions for
  making the wheel gesture. It leads with the package now, keeps the
  on-device and widget halves, and gives an iPhone and a computer two lines
  each. The wheel's own page lost its essays too.

## 0.173.3 — 2026-09-14

- **The wait is the menu, turning.** While a screen is loading, the mark that
  opens the rooms — the corner of the header, the raised button in the phone
  bar — turns in place, instead of a mark conjured behind the departing
  screen. Nothing new appears; the thing that is always there does the
  waiting. Quick navigations still never visibly spin, and with reduced
  motion the menu holds still.

## 0.173.2 — 2026-09-14

- **Inside the installed app, nothing opens an outside checkout.** Google
  pulls apps that sell around Play Billing, and the app's web view cannot
  open Play's own sheet either — so the billing and card pages, drawn inside
  the app, keep their status and lose their buy buttons, the cycle switch and
  the payment portal. One sentence stands where they were. In a browser
  nothing changes, and a copy that can open Play's sheet still buys through
  it.

## 0.173.1 — 2026-09-14

- **A phone app that has fallen behind its instance says so.** The installed
  shell updates on the store's schedule, not when the instance deploys, and a
  shell a minor behind can meet a page that expects more than it has. The app
  now says which version it is on every request, and the page answers with a
  band naming both versions — update, or some things may not work. "Not now"
  puts it away until the instance moves again; patch drift stays quiet,
  being the permanent state of any store install.

## 0.173.0 — 2026-09-14

- **The CSV reader no longer mistakes an outgoing column for the bank's own
  reference.** `Paid out` contains the letters of `id`, so on a British
  statement every withdrawal of the same amount shared a fingerprint and the
  second one was dropped as already imported. It also keeps the first line of
  a headerless month-first file, survives a newline inside a quoted field,
  and reads `(-12.30)` as money going out rather than coming in.
- **Any bank's CSV can be imported now, by naming its columns.** It reads the
  header and says which column it thinks is the date, the description and the
  money; anything it got wrong is a dropdown. Semicolons and tabs as well as
  commas, `1.234,56` as well as `1,234.56`, a pair of money-in and money-out
  columns as well as one signed one, month-first dates, and files with no
  header row at all.

## 0.172.0 — 2026-09-14

- **The seeded finances belong to somebody in particular** — somebody who
  gardens, works wood, buys a vegetable box from a smallholding, keeps two
  cats, plays five-a-side and climbs. A statement of supermarket and streaming
  has nothing to sort; the sorting rules only mean something over a life the
  defaults do not describe.
- **The phone page says the app can be its own instance.** It described two
  ways in and there are three: the browser, the package, and the phone itself
  with no account and no server.

## 0.171.0 — 2026-09-14

- **The wheel's edges are black until you point at something**, and then the
  two that belong to that room — the outer rim and the inner one — light up in
  its colour. The mark in the middle stays as it is.
- **The glyphs read against their ground**, dark on a light wheel and light on
  a dark one, with enough of the room's colour left to tell the eight apart.
- **The section wheel is the mark, at wheel size.** An octagon with the same
  edge as the logo, the logo's own coloured ring as its rim, the rooms as
  trapezoids inside it, and the medallion from the middle of the mark in the
  hole — which is the way out, the same button you pressed to get there.
- **It grows out of that button.** The wheel comes out of the mark at the mark's
  own size, so the thing under your finger stays put and the rooms bloom around
  it. On a phone that means it travels up from the bar as it grows.
- **A pressed handle looks pressed on a phone too.** It gave way under a mouse
  and not under a finger, because that was the browser's opinion of what is
  active rather than the app's.

## 0.170.0 — 2026-09-14

- **Your phone tells you what an assistant did.** After it stops writing, one
  notification: "Claude added 3 todos", or "Claude changed 12 things" with the
  breakdown under it. One per burst rather than one per call, so a
  twenty-call instruction is one line. It points at the list under Settings →
  Integrations, which has held the same writes all along — and there is a
  switch beside that list to stop being told without stopping the record.

## 0.169.0 — 2026-09-14

- **A danger zone at the bottom of the account page**, on red, with the two
  irreversible things in it. **Delete everything in this account** is new: it
  takes every task, note, habit, goal, picture and record, and leaves the
  account — same address, same password, same plan, an app with nothing in it.
  Beside it, deleting the account itself.
- **Both ask for your password**, and for a word typed out: `DELETE EVERYTHING`
  for the first, your own address for the second. Deleting the account only
  asked for the address before, which is written on the screen above the box.
- **A page in the docs about deleting your data** — what each one does, that
  neither can be undone, and how long an instance's backups go back.
- **An export says which version of ontoplano wrote it.** Nothing reads it yet;
  a data file that cannot say what made it is one somebody has to guess about
  later.

## 0.168.5 — 2026-09-13

- **The mark that turns while you wait stays in one place.** It was set a
  quarter of the way down the page it was waiting on, so it landed somewhere
  different on every screen — and above the top of the window entirely when the
  navigation started from halfway down a long one.

## 0.168.4 — 2026-09-13

- **The demo says no to an export instead of preparing one for ever.** An
  export is every row and every picture in one file; on the demo's box that
  request took minutes or died, and the button said "Preparing…" for the rest
  of the visit. It is refused now, in a sentence — and everywhere else the
  button gives up after two minutes rather than sticking.
- **The domain vouches for the app that is actually built.**
  `/.well-known/assetlinks.json` still named `app.ontoplano.twa`, the Trusted
  Web Activity retired in 0.152.0 — so the file whose whole job is saying which
  app owns this domain named one nobody builds.
- **Less ring around the launcher icon**, and the mark itself trimmed to its
  own edges: the artwork carried a couple of per cent of empty margin, which
  every icon drawn from it wore, and which made the phone bar's raised button
  a shade too small.

## 0.168.3 — 2026-09-13

- **The mark moved to the top-left corner, beside the name.** It was over on
  the right among the tools, which made it read as a fourth button rather than
  as the thing the app is called. It still opens the rooms.
- **The app writes its name as Ontoplano** — in the header, on the login
  screen, on the front door and above the legal pages.
- **The journal says which database the instance opened**, on every start.
  Three instances share that box, and when the wrong one is opened nothing
  downstream names the cause.

## 0.168.2 — 2026-09-13

- **Screens now move when you press, not when the data arrives.** The change
  that was supposed to do this in 0.168.0 was hung on SvelteKit's
  `onNavigate`, which runs _after_ the load — so the movement still began the
  moment the wait ended, which is the thing it was written to remove. It runs
  at the press now.
- **The mark that turns while you wait shows up in time to be seen.** It sat
  in front of the screen on its way out, so it could not start until the
  movement was over — and it waited another beat past that, by which point
  most navigations had finished. It is behind the departing screen now and
  starts while that screen is still travelling, so it is already turning when
  the ground appears.
- **Reminders and the weekly review mail run again.** Both jobs reached a
  service without opening a database first and died on their first query —
  every minute, in a timer nobody reads. `make lint` now fails on a scheduled
  job that imports no database.
- **An export without pictures is measured against what the pictures weigh**
  rather than against half the file, so a feature that seeds something which
  is not a picture no longer fails a test about pictures.

## 0.168.1 — 2026-09-13

- **`make db-strangers` says when the clone is behind.** It can only name a
  migration the checkout has heard of, so a tree that has not fetched the
  commit which added one reported four perfectly good migrations as coming
  from nowhere. That reads as data corruption and it is a stale `git fetch`.

## 0.168.0 — 2026-09-13

- **Workouts keep a register.** "Last done" says whether you are keeping a
  workout up and cannot say whether you are getting anywhere with it. A session
  is now a day plus lines of what you did and how much of it — ran 5 km,
  deadlifted 120 kg — in your own words and units, under the plan it belongs
  to. Correct one, remove one, and a workout with history is archived rather
  than deleted, because the sessions behind it are the record.
- **A workout says what it measures.** Names and units on the workout itself —
  a run measures kilometres and a pace; a push day measures what you benched
  and for how many reps — so writing a session down is filling in figures
  beside words you already chose. A session may still measure anything.
- **An assistant can read and write the register**: `workout_sessions`,
  `log_workout`, `change_workout_session`, `remove_workout_session`,
  `set_workout_measures`, and `workout_history` for one activity over time.
- **A place folds away on the inventory list too.** Pressing a location heading
  puts it and everything under it out of sight — the same fold the tree beside
  it has, so the two halves cannot disagree about what is open.
- **The screen moves when you ask it to, not when the data arrives.** Changing
  tab or room used to take the old screen off, wait for the next one to load,
  and only then bring it on — so on a slow connection the screen left and
  nothing happened. Now the movement finishes either way, and the mark turns in
  the middle of a panel that has already stopped moving.
- **Weekly notes are one surface** rather than a column of cards each with its
  own accent edge.
- **The row of actions beside a task is two lines, not a column with a hole in
  it** — three abreast, the rest right-aligned under them. A finished task has
  three and takes one line, so the row is shorter.
- **Sign-in fills the screen on a phone**, the way registering already did,
  instead of floating as a card between two dark bands.
- **Number fields carry the app's own stepper** instead of the browser's.
- **An ops warning says which instance it came from.** A box runs production,
  staging and the demo; "4 mails failed to send" named none of them. The demo
  raises no mail warning at all, its administration page having nothing to show.

## 0.167.1 — 2026-09-13

- **Lists sit on one surface instead of floating apart.** Recipes, diary
  entries, ideas and habits were a card each on the page's own background, with
  a strip of it showing between every two; they are now rows of one bordered
  surface, the way the todo and activity lists already were. Inventory's
  filters moved onto the top of the panel they filter.
- **A notebook's tasks are worked on where they are.** The Tasks tab was a list
  you could read: you could see that four things about the kitchen were waiting
  and could not tick one off without going somewhere else. It is now the same
  list the to-do room shows — tick off, put on a day, edit, put away, delete —
  and a task written there is filed under that notebook without being asked.
- **A note can be put away too.** Hidden, not deleted: it stays in its
  notebook, keeps its number and its tags, and comes back unchanged. The strip
  says how many are away.
- **The docs stopped scrolling sideways on a phone.** Every page was as wide as
  its widest table; the table scrolls in its own box now and the words wrap.
- **An assistant can ask for one notebook's tasks** rather than reading the
  whole list to find four of them, and can read a notebook's notes at all,
  which it could not before.

## 0.167.0 — 2026-09-13

- **A todo can be put away.** Neither finished nor deleted — a task that
  matters but not this month. It leaves the list keeping everything about
  itself, including whether it was half-started, and comes back exactly as it
  was. "Show archived" brings them into view; an assistant has `archive_todo`
  and `unarchive_todo`.
- **The to-do list filters by notebook**, with an answer for the ones nobody
  filed: "Not in one" is a thing people go looking for, not the absence of a
  filter.
- **A notebook's tabs say how far along it is** — "Tasks 2/9" rather than
  "Tasks 9". Notes keep a plain count, having nothing of the sort to say.

## 0.166.1 — 2026-09-13

- **An instance never writes another instance's database path into its config.**
  The demo shares a config directory with the instance beside it unless told
  otherwise, and the app tops that file up with the settings in force whenever
  it finds a key missing — so the demo wrote its own database path into
  production's `config.toml`. Production restarted, opened the demo's database,
  and refused every sign-in and every API token while the real data sat
  untouched beside it. What the file said about where the database lives is now
  what it goes on saying; a path from the environment belongs to the process
  that was given it.
- **The demo gets a config directory of its own**, the way staging already did
  — including on boxes already set up.

## 0.166.0 — 2026-09-13

- **Restoring shows a preview before it does anything.** A restore empties the
  account first, so whose file it is, how many rows will land, what is left
  behind by policy, and what the import would refuse are all on screen before
  you type REPLACE. When the file carries a row the import cannot accept — a
  picture in no format it serves — you can leave those out and bring in the
  rest, rather than having the whole restore fail three seconds in.
- **Export without the pictures.** They ride in the JSON as base64 and are most
  of an account's weight, so a gallery makes a file too big for a small
  instance to take back. "Include pictures" is off for a file that moves an
  account between instances, on for a backup.
- **An assistant can move a todo into a notebook**, or out of one.

## 0.165.7 — 2026-09-13

- **Restoring an export says why it will not fit, before you send it.** An
  account with pictures in it exports to more than a small instance will
  accept, and what came back was either "that file is not JSON" — because
  choosing the file hit a two-megabyte cap meant for a task list and left the
  box empty — or a 500 saying "something went wrong on our side", because the
  server refuses an oversized body before any of the app runs. The page knows
  the real ceiling now, names both sizes, points at `make db-import` for the
  machine itself, and will not let you press Restore on something that cannot
  be sent.

## 0.165.6 — 2026-09-13

- **`make reset-dev` gives you a clean slate, every time.** It moved the old
  database aside instead of deleting it, and `make dev` runs as a service that
  holds that file open — so the app went on serving the old data and the reset
  appeared to do nothing. It stops the service, deletes the database and
  everything beside it (the write-ahead log, the copies past resets kept, the
  snapshots taken before past migrations), migrates, makes the same account it
  always makes, seeds, and starts the service again.

## 0.165.5 — 2026-09-13

- **The instance chooser uses glyphs rather than ticks and crosses.** A link
  for reachable, a box for backed up, a plug for plugins — the same glyph on
  both sides so the two columns read against each other. What the phone does
  not have is dimmed rather than crossed out: three red crosses is an argument,
  and this screen is not making one.
- **Home and the account screen turn the other way** from the rooms. They are
  what the wheel turns around rather than points on it.
- **`make reset-dev` refuses a database that is not a dev one.** It replaces
  the whole file, and on a server that is production: moved aside, its
  write-ahead log deleted under the running process, an empty one seeded in its
  place, and an operator account created whose password is in the Makefile.
- **An assistant can put a task in a notebook and give a note a title.** Both
  were things the app could do and the tools could not.

## 0.165.4 — 2026-09-13

- **The instance chooser says what it is.** "Cloud instance" and "On device"
  rather than "Connect to an instance" and "This phone only", each with a
  heading and a list you can read down: a tick against what you get, a cross
  against what you give up. Four plain lines read as four good things whichever
  side they are on.
- **The address field says what to put in it** — any instance URL, with the
  official one named.

## 0.165.3 — 2026-09-13

- **No more flick at the start of a movement.** A screen was made visible in
  one frame and moved to its starting place in the next, so it was painted
  once where it would end up before jumping to the edge to come in. It is put
  where it starts and shown in the same breath now.
- **The movement is smoother.** Both screens are given a layer of their own
  before the first frame rather than during it — otherwise the browser works
  out halfway through that something the size of a page is moving, and
  promoting it there costs the frames you can see.
- **Nothing of the old screen is left standing in the corner.** On a wheel, how
  far a point travels depends on how far it is from the hub, and the hub is
  below — so the bottom of the screen moved least and a wedge of it sat there
  until the copy was taken away a frame later.

## 0.165.2 — 2026-09-13

- **The screens either side of the wheel move too.** Home, Search and the
  account screen all answered "not a room", so a hop between any two of them
  had the same non-answer at both ends and stood still. They have places in the
  row now: the dashboard is the hub the wheel turns around, and the rest
  follow.

## 0.165.1 — 2026-09-13

- **The screen leaves the moment you ask it to.** It was leaving as a copy laid
  over the original, which had not moved — so nothing appeared to happen until
  the new page arrived and slid in, which read as the whole movement waiting
  for the load. The original goes out of sight now while its copy travels.
- **The mark turns while you wait.** Behind a screen that has left there is
  nothing to look at; that is where it goes. It waits a third of a second
  before appearing, because most navigations are over before anybody could read
  it.
- **Moving between rooms works from the dashboard too.** Anywhere that is not a
  room — the dashboard above all — counts as the hub the wheel turns around.
  Without that there was no movement on a phone at all: the way between two
  rooms there is the dashboard or the pie, so every hop had the hub at one end
  and was being thrown away as "not between rooms".
- **`make shots` takes the seven-inch tablet set** Play asks for alongside the
  ten-inch one. Its own walk rather than the ten-inch pictures scaled down: at
  1600 wide the app lays itself out differently from 1920.

## 0.165.0 — 2026-09-13

- **A swipe works anywhere on the screen.** It was listened for over the room's
  own content, which on a short page is a fraction of what you see — so most of
  the screen did nothing. It is the whole scrolling surface now. And it listens
  for touches rather than pointers: a real browser cancels a pointer the moment
  it decides your finger is scrolling, which is why this worked in every test
  and not on a phone.
- **Changing room moves too**, in the order the rooms sit in your menu, and
  round the wheel rather than across it: the screen leaving sinks and tilts as
  it goes, the one arriving rises into place. Four degrees, fixed, so it looks
  the same on a phone and on a laptop.
- **The movement goes the whole way.** A quarter of the width with a fade read
  as a wobble — the screen never left, so nothing was replaced.

## 0.164.0 — 2026-09-13

- **The dissolve is gone, and tabs move instead.** A whole-screen effect on
  every navigation is something to be sure about, and it was never right. What
  replaces it is the one movement that says something true: on a phone the
  outgoing tab flies the way you went and the new one comes from the other
  side. The Instance page's sliders and the three settings behind them are gone
  with it.
- **A sideways swipe changes tab**, in every room that has tabs — Tasks,
  Health, Finance, Notebooks, Integrations. Clicking the strip was the only way
  before, which on a phone means reaching for the top of the screen. The page's
  own scroll still wins unless the gesture is clearly across it, and a swipe
  that starts on something which scrolls sideways belongs to that thing until
  it runs out of room.
- **Ideas has one header again**, not two: the page was drawing a second room
  bar inside the room's own.
- **The tab strip fades its own letters** where the row continues, instead of
  drawing a chevron over a rectangle of colour that had to guess the page's
  ground and never matched. The chevron was a button in a strip whose point is
  that you drag it.
- **Exactly one tab is lit.** In Notebooks, whose first tab is the room's own
  root, both it and the tab you were on were underlined.
- **A notebook's note composer is behind a button.** It stood open above the
  notes on every screen — a title box, a text box, a picture button and a fold
  of tags — whether or not anybody was writing.

## 0.163.3 — 2026-09-13

- **Changing screen actually turns the page.** The second half of the dissolve
  began the moment the new page arrived, and against a server on the same
  machine that is inside one frame — so the first half had not moved yet, the
  threshold sat at "whole" from beginning to end, and no navigation anywhere
  showed anything. The page that arrives now waits for the screen it is
  replacing to finish leaving.
- **The logo is your logo again.** 0.163.0 put the previous one back as the
  source every icon is drawn from.

## 0.163.2 — 2026-09-13

- **The device test for creating a ledger runs again.** It had been parked as a
  known failure on the strength of a reproduction that was really a wrong
  selector in the test itself.

## 0.163.1 — 2026-09-13

- **The raised button in the phone bar is the shape of the mark again.** The
  outline committed with it had collapsed to a triangle, so the button was
  drawn as one.

## 0.163.0 — 2026-09-13

- **How the page turns is yours to set, on the Instance page.** Three sliders —
  speed, grain, hardness — and they take effect as you move them, because
  "hardness 30" means nothing until the screen does it. "Show me" plays the
  turn on the spot rather than making you navigate away to see what you
  changed, and there is a way back to the numbers it shipped with. Saved to
  `config.toml`: it is the instance's feel, so everybody who opens this copy
  gets it.

## 0.162.7 — 2026-09-13

- **The habit grid uses the whole width.** Ninety days is thirteen columns, and
  at a fixed cell size that was a third of a phone screen with two thirds of
  nothing beside it. The weeks share the width now, the days are square rather
  than the pills the touch-target rule was stretching them into, and a year
  still fits a desktop card.

## 0.162.6 — 2026-09-13

- **A location's name is readable however long it is.** "asf 1213 21321 a…"
  was the whole of what the panel would tell you. The name is its own tooltip
  now, and the divider between the house and the list is a handle: drag it and
  the panel takes the width it needs off the list, where it stays. Both halves
  sit on one surface rather than floating as two cards.

## 0.162.5 — 2026-09-13

- **A phone-only instance stops breaking its own database.** 0.162.4 taught the
  device to run new migrations, and it went about it by replaying the whole
  history and ignoring every "already exists" on the way. On a device that was
  already up to date that gets as far as migration 33 and dies —
  `there is already another table or index with this name: exceptional_tasks` —
  because migration 0 happily recreates a table migration 33 renamed away. It
  now works out which release the device is standing at before running
  anything, runs each migration whole or not at all, repairs a schema an
  earlier build mangled, and clears away the tables it left behind. Nothing is
  asked of you: open the app.
- **The phone build reads the machine it is on.** The heap it takes is half of
  physical memory rather than a flat 4GB, and `make android` refuses outright
  on a machine too small to be a workstation — building it on the server that
  runs the app is an outage, not a slow build. `PHONE_BUILD_ANYWHERE=1` if you
  mean it.

## 0.162.4 — 2026-09-12

- **The phone build stops running out of memory.** It compiles every route
  twice — once into the app, once into the database worker — and node's default
  heap is a guess about the machine rather than about the work. It says which
  heap it is using now, and appends to `NODE_OPTIONS` rather than obeying a
  small one silently.
- **A phone-only instance applies new migrations.** It only ever ran them into
  an empty database, so a device was frozen at the schema of the build that
  first opened it and every later release expected columns it did not have. It
  keeps its own record now and runs what it has not.
- **A goal card reads across again.** On a wide screen its actions took the
  whole row and the text beside them collapsed to one character per line — the
  title read downwards.
- **Changing screen no longer flicks.** The second half of the dissolve started
  from "gone" however far the first half had got, so a page that arrived
  quickly jumped there for a frame.
- **The page stops shifting sideways** between a room tall enough to need a
  scrollbar and one that is not.
- **The notebooks album behaves like an album**: each folder wears a picture
  from inside it rather than a glyph, and its contents are in it rather than
  also loose underneath.

## 0.162.3 — 2026-09-12

- **A migration cannot be edited after it is written.** Changing one strands
  every database that already ran the old bytes, because that is how an applied
  migration is identified — and the discovery happens during a deploy. A dev
  machine and the staging instance were both refused for exactly that reason
  tonight. `make lint` now fails on any edit to a committed migration, and
  `scripts/repair-0070.mjs` puts the two affected databases right.

## 0.162.2 — 2026-09-12

- **`make db-dry-run`** rehearses a deploy's migration against a throwaway copy
  of the database — taken with SQLite's own snapshot, so a live server can be
  checked while it serves — and reports whether it would work. Finding out by
  doing it to production is not a plan.
- **`make db-strangers`** now names a stranger rather than counting it: it
  hashes every version of every migration this repository has ever held and
  says which one the database ran and when that version existed.

## 0.162.1 — 2026-09-12

- **`make db-strangers`** lists the migrations a database has actually applied,
  naming any the build cannot account for and saying when each ran. The
  migrator already refuses such a database — correctly, before touching
  anything — but it says how many rather than which, which is the hard half of
  the question when a server will not start.

## 0.162.0 — 2026-09-12

A minor, and it is the first one under the new rule: the phone stopped being a
window onto ontoplano and became one, which is the kind of change that number
is for.

- **Reminders arrive with the app closed.** Android's web view has no Push API
  at all, so the app used to say it had no push support and suggest installing
  it as an app — to somebody holding the app. It books its own alarms with
  Android now, on any instance, and asks Android for permission rather than a
  browser.
- **Recipes and the address book work on a phone-only instance.** Neither ever
  needed a server; both were on the list of screens that do.
- **A picture goes into a note on a phone-only instance.** It answered "this
  screen needs an instance with a server" about bytes that were only ever going
  to live on that phone.
- **Changing screen dissolves as the page loads, not after it.** It could not
  before: the effect was built on a browser feature that cannot start until the
  new page is ready, which put the whole thing after the wait it was meant to
  cover. It also now works in Firefox, which that feature never did here.
- **A goal is counted or measured.** Twelve books gets a plus and a minus on its
  card, because a book is finished one at a time; 21.1 kilometres keeps a field,
  because 14.6 is not two presses away from anything. Which one it is is chosen
  beside the number, as ℤ or ℚ.
- **Bills has a tab**, and a bill can be attached to the line that paid it —
  the amount then comes from the statement rather than from what was expected.
  Ticking one paid without attaching anything still works.
- **A sideways swipe stays in the thing being swiped.** Pushing a room's tabs
  past their end dragged the whole page sideways and left it there.
- **The habit grid shows 90 days on a phone**, a year where there is room for
  one. Fifty-two columns of small squares on a phone is a wall.
- **The back gesture goes back**, and a link that leaves ontoplano opens outside
  it instead of replacing the app in a window with no way out.

## 0.161.1 — 2026-09-12

- **The phone app opens again.** Wiring up the back gesture called `.then` on
  something that is not a promise — Capacitor hands a listener back directly
  when the app holds the plugin the way this one does — and the throw happened
  while the client was starting, so nothing drew at all. Every build, every
  flavour, a white screen. The conveniences for the phone are each wired up on
  their own and each allowed to fail on their own now: losing the back gesture
  should cost you the back gesture.
- **The app may open the addresses it offers.** The list of what the web view
  will follow is hostnames again rather than a bare `*`, which is not one.

## 0.161.0 — 2026-09-12

- **Recipes and the address book run on the device.** Both were on the phone's
  "needs a server" list and neither needed one; the list existed in two places
  and only one of them had been corrected. A test opens every room the device
  is supposed to have, so the next one that was never ported fails the build
  rather than being found by opening it.
- **A picture goes into a note on the phone-only instance.** The composer posts
  to `/media`, and the device was only ever asked about `/api`, so attaching a
  photograph answered "this screen needs an instance with a server" about bytes
  that were going to live on that phone. The form crosses intact, too — read as
  text, it would have stored a corrupted copy.
- **The back gesture goes back.** It walks the app's own history and only puts
  the app away at the first screen of the session, the way every other app on
  the phone behaves.
- **A link that leaves ontoplano opens outside it.** The documentation replaced
  the app in a window with no address bar and no way back.
- **Reminders arrive on a phone-only instance.** There is no server to wake the
  phone, so the app hands the next few weeks of reminders to Android's own
  alarms whenever it opens or goes to the background.
- **The diary stopped offering to file a note in a notebook.** The diary is not
  one notebook among others — it is the day — and the question took notes out
  of the diary somebody was looking at.
- **Goals: the filters sit together.** The area chips and "Show closed" share a
  line, with managing areas up beside "New goal" where it belongs.
- **A sideways swipe stays in the thing being swiped.** Pushing a room's tabs
  past their end handed the rest of the gesture to the page, which a phone
  drags sideways and leaves there. Nothing was too wide; the strip was passing
  the swipe on.
- **The phone apps are Ontoplano, OntoplanoDev and OntoplanoStaging**, and
  `make android-install` refuses an app older than the build it carries — which
  is how yesterday's DEV and staging were installed over today's work and every
  fix looked like it had not landed.
- **The screen transition's numbers are in `src/lib/page-turn.ts`.** The screen
  with sliders that turned them while the app ran is gone: three numbers in one
  file do not need a page.

## 0.160.0 — 2026-09-12

- **One phone app, and the phone-only instance is a choice inside it.** There
  were four Android builds: three pointed at a server by the native layer and
  a fourth, under its own application id, that was the only one able to be an
  instance of its own — two launcher icons both called Ontoplano, and a
  decision made at build time that belongs to whoever is holding the phone.
  Every build now carries the whole app and boots on the copy it carries. The
  first screen asks where your ontoplano lives, with that build's address
  already typed, and the answer is remembered. Choosing the phone from a page
  an instance served comes home to the copy on the device.
- **The mark draws at the size it is given.** `make icon` left the hairline
  frame around an exported logo in place, so the mark kept a margin it was not
  meant to have and every icon drawn from it — the button in the bar, the
  favicon, the launcher — came out about a sixth too small. The frame is cut
  off now, and the button in the bar is the octagon itself rather than an
  octagon inside a bordered square.
- **The launcher icon stops losing its corners.** Android shows 72dp of a
  108dp foreground and the web's maskable icon is measured against a wider safe
  zone; one asset was being used for both, so the stricter of them was wrong.
  The adaptive icon's foreground is drawn for its own safe zone now.
- **Three commands for the phone, and they say what they do.** `make android`
  builds it, `make android-install` puts it on the phone, and
  `make android-install-all` installs the same app three times with its own
  icon and instance each. `make android-store` is the release artifact for the
  stores. `make up-phone` is gone — it called a target that no longer existed.
- **`make android` finds the SDK again.** It is looked for in `ANDROID_HOME`,
  `ANDROID_SDK_ROOT`, bubblewrap's config, `~/android-sdk`, `~/Android/Sdk`
  and beside `adb` — in one place, rather than three copies that had drifted.

## 0.159.1 — 2026-09-12

- **The room's header reaches the top of the screen.** A sticky element pins
  to the scrollport, which began below the page's own top padding — so the bar
  could never sit higher than that padding and a strip of page showed above
  it, with content sliding through. The scroller gives that padding up and the
  bar carries it.
- **The mark is the mark.** A logo exported on a plate arrives as a square of
  cream with the octagon in the middle, and every icon drawn from it carried
  the square. `make icon` lifts a flat ground to transparency — flood-filled
  from inside the edge, so the white _inside_ the mark is untouched — and
  squares what is left on the mark itself.

## 0.159.0 — 2026-09-12

- **A button has an edge.** Its border was transparent and its fill six
  shades from the page, so on a dark screen a button was a word floating
  where a control should be — and inside a card, whose surface is lighter
  than that fill, it read as a dent.
- **Inventory's controls stop wrapping into rags.** One action in the room's
  header, which list you are in on a row of its own, and what it hides below
  that. Six controls of three different kinds beside the room's name broke
  wherever they happened to run out of width.
- A page under a room with tabs no longer repeats the room's name: People
  said "People" three times, once in the header, once in the lit tab and
  once as its own heading. Neither People nor Notebooks tells a phone that
  nothing is selected in a column a phone does not have.

## 0.158.0 — 2026-09-12

- **Notebooks are folders when you want them to be.** A name with an em dash
  in it is a place: “Renovation — Kitchen” sits inside “Renovation”, which is
  the same reading the gallery gives an album and the same tree inventory
  draws for a location. A folder counts what is under it, and renaming one
  moves it.
- **A number field and a text box are components**, so the day they change
  there is one file rather than twenty-five call sites.

## 0.157.0 — 2026-09-12

- **The board slides sideways on a phone.** The columns are side by side in a
  strip that snaps, and a card dragged to the edge takes the strip with it.
  One column at a time is a list with a tab strip, and moving a card between
  two things you cannot see at once is a gesture nobody can aim.
- **The mark on the bottom bar is a docked button, not a sticker.** It was
  84 pixels hanging a third of itself over the page, with the bar's own line
  running through it and the page showing through the notches of its rim.
- **Where this ontoplano lives** is reachable from the account screen in every
  build, not only the one that is its own instance — and it opens prefilled
  with the address you are on, because the usual reason to open it is that a
  laptop moved.
- `make android-phones` takes the DEV app's address from `defaults.env`, and
  says plainly that a build inside a container cannot work out which address
  on the wifi is the laptop's. The app may now be pointed at any instance you
  type, which is what "or one you run yourself" means.
- An account with no notebooks stops saying so three times.

## 0.156.0 — 2026-09-12

- **Things sit on something.** A card, a panel, a row or a tile with a border
  and no fill was a hairline drawn on the page — outlines floating in space on
  a dark screen. Every bordered surface has the page's raised colour under it
  now, and on the dark theme that colour is _above_ the page rather than below
  it, which is the difference between a card and a hole.
- **A dropdown is the app's, not the platform's.** Still a real `<select>` —
  a phone opens its own wheel — in a box drawn like every other field.
- **Ideas is a tab of Notebooks**, after Diary. It is writing, and a room of
  its own in the bar for something that small was a room nobody entered.
- **A note has a name, and a notebook is a list of names.** Notes open on
  press and stay open; one without a name is listed by its first line. Naming
  is optional, because a note jotted in a hurry should not be held up by a
  form asking what to call it.
- Editing a note no longer takes it out of its notebook. An edit that said
  nothing about the notebook read as "no notebook" rather than as "not my
  business", and quietly unfiled the note.

## 0.155.0 — 2026-09-12

- **One file per route.** A route's `+page.server.ts` is the only copy of its
  load and its actions, and the instance running on a phone imports that exact
  file. There used to be a second file beside it and a one-line re-export — a
  pattern you had to know about before you could add a screen. The handful of
  screens that are about a deployment are named in one list and say so; what a
  route needs from a server goes through the host seam instead. Written down
  in CONTRIBUTING and in the architecture page.
- **"Self-contained" is called isolated**, everywhere: the mode, the
  directory, the make targets, the build flag, the copy.
- **The transition only runs where it draws.** Firefox has
  `startViewTransition` but does not honour an SVG filter on the snapshots, so
  a navigation there was a blank screen and then the new page. It changes
  screen the ordinary way now.
- **The room's header stays at the top of a phone**, in every room rather than
  the four with tabs — and it starts at the screen's edge instead of a strip
  below it. Beside the name is the room's own glyph, which is not a button:
  the way home is the bar underneath, with a bigger target.
- `make icon FROM=…` makes a picture the app's mark everywhere at once — the
  favicon, the touch icons, the maskable ones, dev and staging, every Android
  flavour, and the header, which draws the same file.
- The error page's button says where it goes. A ledger's month filter is a
  list of the months that have lines, because `input type="month"` is a text
  box in Firefox. Pressing a rule's count shows the lines it claims, and the
  uncategorized pile opens the same way.

## 0.154.1 — 2026-09-12

- An album's card counts its own pictures. A folder import's root said 28 and
  opened empty — the 28 were in the albums inside it, which the disclosure
  under the card now says.
- Inside an album, the drag-onto-another-album row is a desktop's: it says so
  itself, and on a phone it took the top third of the screen to offer
  something no finger can do.

## 0.154.0 — 2026-09-12

- **The phone keeps the room at the top.** Where you are, its tabs and the way
  home stay put while the room scrolls under them — which is most of what
  makes an app feel like one rather than like a page. Four rooms drew that
  header themselves and had already drifted; there is one of it now.
- **A tab's underline is straight.** The playful style rounds every anchor,
  which on an element whose only border is the bottom one drew the underline
  as a shallow bowl curving up under the word.
- Ideas opens on the ones you have not acted on yet.
- The month filter in a ledger says "Month" — empty, it drew as dashes beside
  the search box and read as a second search box that lost its placeholder.
- A goal's edit and delete sit at the right edge instead of packed against
  the words on the left.

## 0.153.0 — 2026-09-12

- **Where your ontoplano lives is a screen.** Two squares: connect to an
  instance — the official one or one you run yourself — or keep it on this
  phone alone. The paragraph under them changes as you choose and says what
  each costs, including the one nobody should pick by accident: on a
  phone-only instance nothing is backed up, no assistant can reach it over
  MCP, and no plugin runs. Choosing moves nothing on the page.
- On a phone that is its own instance the account press opens that screen
  instead, because there is no account there to open — and it is the only
  way off a phone-only instance, so it cannot be a page that needs a server.

## 0.152.0 — 2026-09-12

- **The Trusted Web Activity is gone.** The Android app is the Capacitor
  shell, which does everything the TWA did and one thing it never could: hold
  an instance on the device itself. With it go the keystore, the fingerprint,
  the Digital Asset Links dance and eight make targets. `make android` builds
  the store artifact; `make android-phones` puts the three developer apps on
  a phone. The project F-Droid builds is `capacitor/android/`, committed with
  its icons — which are byte-identical from one run to the next now, so a
  build no longer leaves eighty modified files behind.
- A release is a version bump and nothing else: the Gradle project takes its
  version from `package.json` rather than from a number typed into it.
- The home-screen widget's native sources are kept at `capacitor/native/` and
  are **not yet wired into the shell** — the TWA project copied them in and
  declared them, and this one has no equivalent step yet. A freshly installed
  app offers no widget until it does.

## 0.151.0 — 2026-09-12

- **Everything an instance decides is in `config.toml`.** How many albums an
  account keeps, how many people a family plan covers, what this instance
  charges, who runs it for the privacy page, whether the address has to be
  confirmed, when the review mail goes out — all of it was scattered across
  a dozen `ONTOPLANO_*` variables or compiled in. The file also grows: a
  config written before a setting existed gets the line written into it on
  the next boot, with the value in force, so there is always something to
  edit. A variable still set in the environment still wins and says so by
  name, once, so the move can be finished at your own pace. What stays in
  the environment is what the deployment is — where the database lives, what
  to bind, secrets — plus `ONTOPLANO_DEMO` and `ONTOPLANO_STAGING`.
- `ONTOPLANO_RECORDING` is gone. It hid the demo and staging bands for
  videos and was never used.
- **A screen that needs a server says so on the phone instead of looking
  broken.** The data request for a page ends in `.json`, which the bridge
  read as a file — so the account page went to the phone's own file server
  and came back as a 500. Every un-ported screen was affected.
- **The stray horizontal lines are gone.** A phone rule painted a separator
  above every second child of every card, so a heading and its own
  description had a line between them.
- Finance → Rules is a card like every other list — a header band, rows on a
  surface, the add form on a strip of its own — rather than text floating on
  the background. On a phone the goal groups no longer have a strip of page
  between them, and a goal's progress bar uses the width instead of leaving
  two thirds of the row empty.
- **"What you have decided" is its own thing again**, not another weekday
  band under Sunday.
- The seeded photographs are scaled to what an upload would be — they were
  camera JPEGs, fifteen times the size this instance accepts — and they get
  a root album to hang off.

## 0.150.1 — 2026-09-12

- The switch that turns the `/dev` workbenches on is `[instance] dev_tools`
  in `config.toml`, with everything else an instance allows, rather than an
  environment variable of its own. What the deployment is — where the
  database lives, what to bind — is the environment's; what the instance
  permits is one file.

## 0.150.0 — 2026-09-12

- **The page turn can be turned while it runs.** `/dev/page-turn` — on a dev
  server or on staging, never on a production instance — puts speed, grain
  and hardness under three sliders, with links to bounce between screens so
  the next turn uses what you just moved. The numbers stay in that browser,
  so you can carry a phone around the app with them, and the page prints the
  three lines to paste into the source once it feels right.

## 0.149.0 — 2026-09-12

- **The gallery's albums are cards again on a phone.** Every surface on a
  phone is pulled out to both screen edges, which is right for a stack of
  cards and wrong for a grid that keeps two columns: the albums drew their
  covers over each other and one album's count landed against the next one's
  name. A grid can now say it keeps its cells. What is inside an album — "5
  albums inside" — sits in the card rather than floating under it.
- **A category colours its whole row.** The wash was 8% of the colour, which
  is invisible on a dark screen, so a category was only ever the dot beside
  its name.
- **A picture has a description.** The name is for finding it again; the
  description is what a screen reader says and what stands in when the bytes
  do not arrive. It was the one field of a picture the gallery could not
  edit.
- **The operator sets where reports go.** The address feedback is mailed to
  is on the instance screen beside the switch that turns reporting on, rather
  than only in `config.toml`. Reports are capped at twenty an hour per
  account — each one is a mail the instance sends on somebody's say-so — and
  when one is refused the screen says why instead of "try again in a moment".
- Finance → Rules: "7 lines no category claims" was not a sentence, and the
  Add button sat between the two fields it needs.
- **`make android-phones` leaves your checkout alone.** It rewrote eighty
  tracked icons on every run — the PNG encoder is not byte-stable — so a
  build left the tree dirty. They are generated before every build now, from
  the one source they always came from, and `make android-isolated`
  generates its own too instead of relying on what was committed.
- A setting with a quote in it no longer corrupts `config.toml`. Every value
  the writer emits is escaped, and the reader understands the escapes — a
  tagline reading `a "quoted" one` was enough to leave an instance unable to
  read its own settings on the next boot.

## 0.148.0 — 2026-09-12

- **The gallery works on the phone with nothing behind it.** Pictures were the
  last room that still needed a server. The bytes were never the problem —
  they are a column in the same SQLite file as everything else — but the media
  service was written in Node's terms (`Buffer`, `node:crypto`, a config file)
  and an `<img>` is the one request the app's bridge cannot see, because a
  browser loads an image itself. So: the service is plain web bytes and a
  WebCrypto hash, its ceilings come from whichever instance is running, and
  the service worker answers `/media/<id>` by asking the open page, which asks
  the database. Albums, uploads, folder imports, tags and renames all run on
  the device now, through the same code a server runs.
- A picture uploaded twice is still one picture. On a Node Buffer the old
  hashing read the shared memory pool behind the bytes rather than the bytes,
  so two different small pictures could come out with the same fingerprint.

## 0.147.0 — 2026-09-12

- **A big folder imports.** The tree is sent in batches that fit in one
  request instead of all at once, which is what a hundred photographs needed:
  a single upload that large was refused by the server before the app saw it,
  with an error no page could read. The button counts as it goes.
- **The preview promises what happens.** It now counts the ceilings the
  import is actually judged against — your instance's megabytes, how many
  albums it keeps, how full an album already is, how many files one import
  takes — so "will import 40" means forty, not forty minus whatever the
  quota eats.
- **A folder's name is a name.** Paths from the picker stop being paths: no
  `..`, no separators, no control characters, and a folder called `a — b`
  makes one album rather than forging two levels. A tree too deep to name
  lands in the nearest album that fits instead of failing.
- **A pattern that could never finish is refused.** A finance rule like
  `(a+)+$` takes exponential time on a line that nearly matches and cannot be
  interrupted once running — on a shared instance that is everybody's app
  stopping. Rules are checked when written and again when read, and a rule
  that is not being run now says so beside its name instead of looking like
  one that matches nothing.
- A statement import has named ceilings — how much text, how many lines, how
  long a description — rather than an unbounded read.
- **Answering the last block of the day no longer throws the page upwards.**
  The card at the top of the dashboard emptied itself and everything under it
  — including the list you had just pressed something in — jumped up its whole
  height, several seconds after the press. It keeps its height now and says
  the day is answered.

## 0.146.0 — 2026-09-12

- **Three apps on the phone, one command.** `make android-phones` builds and
  installs Ontoplano, Ontoplano DEV and Ontoplano — Staging side by side,
  each with its own icon and its own instance. `ONTOPLANO_DEV_ORIGIN=…`
  points the DEV one at whatever address your laptop has today.
- **The week's note is prose.** Written, it renders as markdown with a pencil
  to edit; only an unwritten week opens straight into the box. The box used
  to sit open for ever holding whatever the browser had rather than what was
  stored, which is what made saving twice hard to tell from saving once.
- **The review says how many answers are waiting.** A count at the top of
  "What did not happen" scrolls to the pile at the bottom; it is drawn on
  every render and merely invisible when there is nothing to commit, so it
  never pushes the first row down under the finger about to press it. And
  the pile has air above it on a phone.
- **The plan's grid reaches the edges** on a phone like everything else.

## 0.145.0 — 2026-09-12

- **A folder import says what it will do before it does it.** Choosing a
  folder lists every file, the album each would land in, and the ones that
  would be refused with their size in red against this instance's ceiling —
  then you decide. Nothing is uploaded until you do.
- **The gallery is a tree.** Albums that came from folders inside folders now
  read that way: roots on the screen, what is inside them behind a chevron,
  the way inventory's locations work — and the same tree when dragging a
  picture from one album to another. A parent's count includes what is under
  it.
- **A year band across the statement.** MM/DD says nothing about which year
  it is; when the rows cross into another one, the list says so.
- **The regex link on Finance → Rules went nowhere** — MDN moved the
  cheatsheet out of Reference and into Guide.

## 0.144.0 — 2026-09-12

- **The phone screen is one surface, not a stack of boxes.** Every card,
  list and notice now reaches both edges and squares its corners there — a
  rounded corner belongs to something that ends where you can see it end.
  The line between two rows is the section's own colour, dropped almost to
  the background and lit by a single hairline, so a join reads as a fold
  rather than as two things stacked.
- **A row is one line again.** A list row put its title on one line and threw
  its buttons onto a second, right-aligned under half a line of nothing —
  every list on a phone was twice as tall as it needed to be. Title and
  actions share the row now, and a card's actions line up with the card's
  own left edge instead of floating in the corner.

## 0.143.0 — 2026-09-12

- **A whole folder of pictures goes into the gallery at once**, subfolders
  and all: `Birds/Herons/…` becomes the album "Birds — Herons". Choosing the
  folder is the gesture, and a picture that appears twice in the tree still
  costs its bytes once.
- **The report button takes ideas too.** One dialog, one press to say whether
  this is something wrong or something that could be better, and the operator
  sees which it was. An instance that names `feedback_email` in its config
  gets them by mail as well, as a retryable send like every other.

## 0.142.0 — 2026-09-12

- **Finance is ledgers now.** A ledger is one place money moves through — a
  current account, a credit card — and every line belongs to one, which is
  what makes "what did the card cost this month" a question with an answer.
  A ledger remembers the export it usually receives, so importing into it is
  one gesture. Lines can be written by hand, corrected, moved between
  ledgers and dropped; a plugin can push them in over the API.
- **Rules can be edited.** Every rule's name, pattern and colour is
  changeable, rules move up _and_ down, and each one says how many lines it
  currently claims. Categories wash their rows in their own colour and a
  live ring shows where the month went, with "N lines no category claims"
  beside it. The patterns are JavaScript regular expressions and the page
  says so, with a link to the syntax.
- **Insights.** What each month was made of, stacked by category; the whole
  window as a ring; and what any one tag costs per month with its average —
  one tag at a time, because tags overlap and adding them would count a line
  twice. Filter by ledger and window.
- **Bills are no longer the finance section**, since the section is about
  money that actually moved. They keep their page, reachable from Ledgers,
  because a bill is a thing that wants paying on a day — which is why it
  rides your week.
- **The Android app is called ontoplano and wears ontoplano's icon.** One
  app, not a variant labelled by how it was built.
- **A screen that needs a server says so.** On the isolated app,
  pages that cannot work there — the account, pictures — explain themselves
  instead of failing with a 500.

## 0.141.0 — 2026-09-11

- **Finance opens on Income**, and the statements tab is called
  Transactions — which is what it holds; importing is one card on it.
- **Gallery tags behave like diary tags.** Written with spaces or commas,
  #-prefixes dropped, shown as chips — and clicking a chip filters the
  album to that tag, the same gesture the diary has. Pictures can be
  renamed from their own view.
- **`make android-isolated-install`** puts the isolated app on
  a phone over adb — `make android-install` installs the store app (the
  TWA), which is a different artifact, and installing one while meaning
  the other was exactly the trap. While both apps exist the shell is
  labelled "ontoplano (device)". The `android-lan` and `android-staging`
  targets are retired: which instance the app talks to is chosen inside
  the app, on the instance screen, never baked into an APK.

## 0.140.0 — 2026-09-11

- **Finance grew three tabs.** Income, before Bills, records money coming in
  exactly the way bills record money going out — a name, an expected amount,
  a rhythm, one payment per period. Net draws the last twelve months as
  paired in/out bars with the net under each — once from your own records,
  once from your imported statements, never merged, so nothing counts twice.
  And Imports reads bank exports: pick the export (Nubank conta corrente and
  the card's monthly export to start), hand over the file or paste it, and
  the lines land deduplicated — the same file twice adds nothing. A "flip
  amounts" switch covers an export whose signs mean the opposite.
- **Statement lines sort themselves by your rules.** A category or tag is a
  regular expression: any line matching it belongs. Categories partition —
  first match wins, so a month's totals add up — while tags overlap freely,
  which is what makes a broad "healthy" tag possible. Rules apply at read
  time, so one written today sorts last year's lines too.
- **A Gallery, of albums.** Pictures live in albums; the same picture put in
  a second album is one picture and two references, never a copy — remove it
  from one album and it stays in the other; remove it from its last and it
  is deleted for real, and the confirmation says which is about to happen.
  Drag a picture onto another album to move it, hold Ctrl to have it in
  both; pictures take tags, and choosing files is the upload. Self-hosters
  set their own ceilings (`gallery_albums`, `album_images` in config.toml).
- **The isolated app fails out loud instead of hanging.** A device
  whose WebView cannot hold the database, or whose worker never answers, now
  gets a sentence naming the problem — never an eternal splash screen.

## 0.139.0 — 2026-09-11

- **A notebook can be maximized.** The whole screen for reading or writing,
  with a type-size control in steps that the device remembers. Leaving puts
  everything — a half-written note included — back exactly where it was, and
  on a phone the back gesture leaves it too.

## 0.138.0 — 2026-09-11

- **No side margins on a phone.** Below the phone breakpoint a card takes the
  screen edge to edge and loses its side borders, so a small screen spends
  its width on the content rather than on white space either side of it.

## 0.137.0 — 2026-09-11

- **The back gesture closes a form instead of leaving the app.** A dialog on
  a phone is a screen, and a screen owns a history entry now: Android's back
  button — or the browser's — closes it and stays on the page it was opened
  from.

## 0.136.0 — 2026-09-11

- **The app can run entirely on your own device.** `make local` builds a copy
  that needs no server, no account and no network: the database lives in the
  browser's own storage, every screen runs against it, and reminders ring
  while the app is open. `make android-local` wraps the same build as an
  Android app. The main rooms — the plan, the board, to-dos, goals, notebooks
  and the diary, ideas, habits, workouts, bills, inventory, reminders, search
  and the settings that are yours — all work; photos and mail need an
  instance with a server, as they always did.

## 0.135.0 — 2026-09-11

- **Changing screen no longer flicks before it dissolves.** The first frame of
  a turn still carried the end of the previous one, which on a short turn is a
  large share of it.

## 0.134.0 — 2026-09-11

- **A block you skipped no longer sits in your calendar.** The published feed
  marked every occurrence as confirmed, skipped ones included, so dropping
  Tuesday's gym left a gym block in Google Calendar on Tuesday. Skipped
  occurrences now go out cancelled, which is what makes a client hide them.
  Ones you finished stay as they were — they did happen.
- **The install commands on the docs actually work.** They named a file that
  has never existed (`ontoplano_amd64.deb`, when every release attaches
  `ontoplano_<version>_amd64.deb`), so the first command on the page was a 404.
  The download links are generated from the newest release now, and the
  packager reads its file names from the same place, so the page cannot name a
  file the build does not produce.
- **The phone app asks for an official or a custom instance**, in those words,
  and says which server the official one is. Choosing comes before signing in,
  because which accounts exist is the server's answer and not the app's.

## 0.133.0 — 2026-09-11

- **An instance now says what it cannot do, and why.** Some things are somebody
  else reaching in — a calendar client fetching your feed, an assistant, an app
  pushing readings — and some happen while nobody is looking, like the Monday
  review mail. An instance that cannot do one of those now says so where the
  feature lives, with both ways round it, instead of offering a button that
  quietly does nothing. Nothing changes on an ordinary server, which can do all
  of it.

## 0.132.0 — 2026-09-11

- **Every release can now be checked.** A `SHA256SUMS` file goes up with the
  packages, covering each one by the name you download it under, and the docs
  say how to use it. The Arch recipe carries a real checksum of the release's
  own source tarball instead of skipping the check entirely, so `makepkg`
  refuses to build anything that is not that file.

## 0.131.0 — 2026-09-11

- **The page turn dissolves properly now.** The dots are drawn live rather than
  stepped through a handful of prepared images, so the screen breaks up evenly
  instead of in eight visible jumps.

## 0.130.1 — 2026-09-11

- **The page turn is quicker** — 240ms rather than 480. Same dots, half the
  wait.

## 0.130.0 — 2026-09-11

- **Changing screen turns the page.** The screen you were on breaks up into
  dots and the one you asked for arrives in the gaps they leave, the way an
  e-reader changes page. It happens when you follow a link or press back, and
  not when you page the week or change a filter — those stay instant. It is
  off if your system asks for reduced motion, and it costs nothing: the dots
  are eight small images made at build time rather than something computed
  while you wait.

## 0.129.1 — 2026-09-11

- **Calendar subscriptions are stamped the way the format requires.** Each
  event said when it was published in local time with no zone on it, which is
  a contradiction the lenient clients ignored and the strict ones are entitled
  to refuse. The blocks themselves are unchanged — those are deliberately
  wall-clock, so 09:00 stays 09:00 wherever you are.

## 0.129.0 — 2026-09-11

- **The phone app's first screen is a proper one.** It always asked which
  ontoplano it was for; now it says so with the app's own mark and type, the
  instance the app was built for is one button, your own address is a box under
  it, and the copy from the store offers the demo as well — somewhere to look
  before deciding anything.
- **You can change which ontoplano the app opens without reinstalling it.**
  Settings → Account, in the app only, beside the sessions and sign-out: it
  names the server you are on and takes you back to the chooser.
- **The home-screen shortcuts work again.** Long-pressing the icon offers
  Board, Diary and Goals — and now Switch instance. They had been gone since
  the app started asking which instance to open, because Android reads that
  list off the launcher icon's own activity and the list had stayed behind on
  the old one.

## 0.128.0 — 2026-09-10

- **A goal can be measured by several things at once.** "Get the band going"
  is three gigs played and five songs recorded — one goal, one line per
  number, each with its own bar and its own box to type into. The goal is as
  far along as its measures are on average, so playing every gig without
  recording anything reads as half done. Goals that counted one thing keep
  counting it; nothing has to be retyped. Measures can be added and dropped
  while a goal is running, the unit box offers the units you already use, and
  an assistant can read and move any of them (`add_goal_target`,
  `remove_goal_target`, and `log_goal_progress` now takes the unit that moved).
- **A goal with tasks linked to it also counts what you type in.** It used to
  ignore its own number entirely — a goal with an activity attached read
  "0 of 0 done" while its own count stood at seven of twelve.

## 0.127.4 — 2026-09-10

- **Ticking something off Today's Tasks no longer takes the row away.** A
  block inside its undo window keeps its place on the list, struck through,
  with the Undo still on it. It used to leave the moment the write landed —
  a couple of hundred milliseconds — taking the offer to take it back with
  it and moving everything below up a line. The card no longer grows by a
  line either when the first block of the day is done.

## 0.127.3 — 2026-09-10

- **Deleting a workout category no longer fails on a real instance.** The
  schema always said the workouts in it survive with no kind, but no
  migration ever carried that rule to a deployed database, which refused the
  delete instead — and refused the demo's cleanup of expired accounts the
  same way, so the demo slowly filled with ghosts.

## 0.127.2 — 2026-09-10

- **The block editor reads top to bottom again.** Notes has a row of its
  own, a little taller, with the reminder alone on the row below it — the
  last thing before the collapsed urgency, interest and energy ratings.

## 0.127.1 — 2026-09-10

- **An imported file can no longer lie about what its pictures and sounds
  are.** Restoring an account re-derives every picture's type from its bytes
  and holds sounds to the same short list the upload does — a crafted backup
  could previously store an HTML "picture" that the app then served as a page,
  running its script as you. The picture and ringtone endpoints also now carry
  headers that keep any such row inert.
- **An expired account's assistant token stops working, like its other
  tokens.** The assistant endpoint now enforces the same payment hold the
  REST API and the calendar link already did, answering 402 instead of
  staying open as a side door.
- **The authentication plugin's spare doors are shut.** Its whole admin
  surface — impersonation, setting another account's password, deleting and
  creating accounts around the app's own audited paths — now answers 404,
  as does its raw change-email endpoint, which skipped the settings form's
  password check.
- **A handful of smaller fences.** Family seat invitations honour the
  registration override a box was closed with; an invitation code spent by
  two simultaneous sign-ups grants its entitlement once; searching for a
  literal `%` or `_` works and neither acts as a wildcard; a reminder cannot
  name another account's ringtone; the published calendar neutralises bare
  carriage returns in titles; the week CSV import bounds durations; and the
  demo reset refuses accounts that are not demo accounts.
- **A Google Play purchase can no longer be claimed by more than one
  account.** The purchase token stays attached to the account that first
  claimed it; presenting it from a second account is refused. (The Play
  channel ships only in the Play build — today's instances are unaffected.)
- **Calendar feeds, webhooks and push endpoints can no longer be steered at
  the server's own network.** The old check matched the typed hostname once;
  a redirect, a DNS record, or an unusual spelling of an address could walk
  past it. The check now sits inside the connection itself — every address is
  resolved and judged at the moment of dialing, on every hop.
- **Administration actions now refuse anyone who is not an administrator.**
  They were reachable by a direct POST without opening the page, which let any
  signed-in account drive the ban controls and clear the mail-failure and
  error-report queues. Every action under Administration now answers the same
  404 the page itself gives a non-administrator.

## 0.127.0 — 2026-09-09

- **Letting an AI assistant use the app has its own page.** Settings is now
  AI & Integrations, and it opens on AI: make a key, hand it to your assistant,
  and see everything the assistant has changed with a way to put back anything
  it removed. Two steps and no jargon: what the key may do is a grid — one row
  per thing, a column each for reading and writing, ticked to begin with and
  every box yours — without the grants an assistant has no use for, and with
  letting it delete things as its own unticked line at the bottom. The
  command and the prompt used to appear only in the instant after a token was
  created, three cards down a page about calendar addresses and webhooks, so
  nobody who did not already know this existed could find out that it did.
- **The calendar link, webhooks and data streams moved one click.** They are
  the Integrations tab of that same section, with the full permission form for
  anybody wiring up a script.

## 0.126.0 — 2026-09-09

- **A room's tabs scroll instead of wrapping.** Health, Finance and Notebooks
  had a plain row of tabs, so on a narrow phone the labels broke mid-word —
  "Hab / its", "Work / outs". They now scroll sideways with a chevron on the
  side that has more, the way Tasks and Settings already did, and the underline
  no longer nudges the row when you change tab.

## 0.125.0 — 2026-09-09

- **Fields and buttons line up on a phone.** A button has always been given the
  44px a finger needs and a text field had not, so any row pairing the two — the
  number you type your goal's progress into and the Update button beside it, the
  inventory's Find box and Add item — sat visibly crooked. Every field gets the
  same height now.
- **A goal card's buttons fit across a phone.** "Tasks (n)" moved under the goal
  it belongs to, where it reads as what it is: a way to see what counts towards
  the goal, rather than something you do to it. That leaves Achieved, Missed,
  edit and delete on one row instead of five controls squeezing until the
  labels broke over two lines.

## 0.124.0 — 2026-09-09

- **A reminder only needs a day.** Leave the time empty and it goes off when
  your day starts — the field says which hour that is. `set_alarm` takes a bare
  day too.
- **"Coming up" ends where the window says it does.** Reminders you had set
  ignored the window entirely, so asking for the next day answered with
  something in December. Birthdays and bills already stopped at the horizon;
  now both halves of the list do.

## 0.123.0 — 2026-09-09

- **The card page's plan choice looks like a payment page.** Two big square
  tiles side by side — Just me and Family, each with its cheapest rate — and
  the selected one drives the yearly/monthly buttons below, which are the only
  things shaped like buttons that charge. The no-charge promise is bold, and
  the demo is a plain link again so nothing free dresses like a purchase.

## 0.122.0 — 2026-09-09

- **The card page leads with the promise.** "Nothing is charged today" is the
  heading now, the two plans are two big cards instead of a tab strip, a short
  paragraph says what the money is for — the app is free to self-host, paying
  is for the hosted instance — and the demo got a real button. A quiet link
  points anyone who would rather run their own instance at the docs.

## 0.121.0 — 2026-09-09

- **The record of a deletion outlives the account.** Deleting your own account
  leaves one disowned line in the instance's audit log — the event and the
  address, nothing else — where before the deletion erased its own record. And
  everywhere that log is read back, a deletion now names the account that was
  deleted rather than the administrator who did it.

## 0.120.0 — 2026-09-09

- **Deleting is its own grant for API tokens.** A write scope used to be both:
  the token that let an assistant add a todo could also remove one for good.
  The nine MCP tools that delete now also need the `destructive` grant — one
  extra tick on the token form. The "An AI assistant (MCP)" preset no longer
  hands it over; a quieter button beside it does, pressed on purpose. Tokens
  made before this keep their write scopes and lose deletion until you grant
  it.
- **Every assistant write answers with what it replaced.** The result carries
  `before` and `after` — and for a delete, the whole removed row — so a bad
  call is reversible from the conversation itself.
- **What your assistants did, on the integrations page.** The last writes made
  over the API, each with the state it replaced, and a **Put it back** on any
  call that deleted something — it recreates the thing through the same code
  the app uses. The log leaves with your export like everything else.
- **The tool surface can no longer change shape by accident.** It is
  snapshotted in the repo and diffed by the test suite: removing a tool or a
  parameter, making one required, or dropping an enum value fails the build
  unless a release announced it first. The MCP server also reports the app's
  real version in its handshake, so "it broke when I upgraded" can say from
  what to what.

## 0.119.1 — 2026-09-09

- **The skip button no longer says what is fine.** Its tooltip read "It did not
  happen, and that is fine".

## 0.119.0 — 2026-09-09

- **Monday's mail goes out every week, and it is two mails rather than one.** A
  week with blocks still waiting for an answer gets "Review your week" — what
  you did, and what you have not said happened yet. A week you have already
  answered for gets "Your week": what you did, and nothing to press. It used to
  send only the first, and only while the week was open, so somebody who keeps
  their week tidy got no mail at all.

## 0.118.0 — 2026-09-09

- **A repeating block starts on a day, and does not fill the past.** "Every
  week on Saturday" was a rule about every Saturday there has ever been, so
  walking the plan back a month generated a routine invented in September onto
  days in August. Every rhythm now has a "counting from" date — weekly and
  monthly as well as the every-N ones — and nothing before it is an occurrence.
  Blocks that already exist start from the day they were written down;
  occurrences already generated are left exactly as they are.
- **"Monthly" is called "Every month"**, beside Every week, Every N weeks and
  Every N days.

## 0.117.0 — 2026-09-09

- **The weeks you have already written about are a link, not a wall.** The
  review used to print the last two months of writing under the box you write
  in. There is a room for that — Notebooks → Weekly notes — so the card's header
  points at it: "See what I wrote before".

## 0.116.0 — 2026-09-09

- **Answering for the blocks is what closes a week, not writing about it.** The
  dashboard's "still open" line, the reminder and Monday's mail all read the
  note: a week where every block had been answered kept asking forever because
  nobody felt like writing, and a week with an unanswered Tuesday went quiet the
  moment you typed a sentence. A week is open now while a block on it is still
  waiting, and the line counts those blocks rather than everything that was
  planned — so "1 blocks" is gone too.

## 0.115.0 — 2026-09-09

- **Ticking something off writes it immediately.** It used to hold the request
  for the length of the undo toast, which made the tick a lie for five seconds:
  the row said done while everything counted from it — the next-up card, the
  totals — was still drawn from a server that had not been told. Undo now
  writes the opposite, which is an ordinary change. Deleting still waits, since
  a deletion has no opposite to write.
- **The docs open by saying what ontoplano is**, instead of explaining the
  script that generates the pages. How they stay correct is still written down,
  at the bottom, where somebody who wants to know can find it.
- **The quick note form calls its box "Diary note".** From the capture wheel,
  which offers four things to write, a box labelled "Note" did not say which of
  them it lands in.
- **A flag for recording.** `ONTOPLANO_RECORDING=true` hides the bands that say
  "Demo version" and "Staging" — the thing that ruins a video — and changes
  nothing else about how the instance behaves.

## 0.114.0 — 2026-09-09

- **The time field is the browser's own again.** There was a hand-drawn clock
  face here, added because Android opens `<input type="time">` as typeable
  digits unless it feels like opening a dial. It looked like nobody's control
  everywhere the native one is fine, which is most places. A standard control
  is the browser's to draw.
- **`make help` lists every target.** It described about forty of the
  ninety-odd, so tab-completion offered the rest with no way to tell what they
  were. Help is generated from the makefiles now, grouped, and `make lint`
  fails if a target says nothing about itself.
- **Each room's tab strip is a `<nav>`** with a label, the same in all of them.
  It was a bare `<div>` in three of the four, which is worse for a screen
  reader and meant nothing could enumerate a room's pages.

## 0.113.0 — 2026-09-09

- **Bills in reminders say what they cost.** A bill for two hundred reais
  announced itself as "Hedi — 20000, due 2026-09-15". Amounts are stored as
  whole cents, and these were the one place in the app printing the integer
  instead of the price.
- **Reminders look backwards too.** "Coming up" hid everything that had already
  fired, which left "did that actually go off?" with nowhere to be answered.
  The same window now points either way — Ahead or Past — and the past view
  includes the ones you dismissed.
- **Import markdown opens on the Notebooks page.** It used to be a link to a
  settings screen headed "An Obsidian vault": the right form under a name
  nobody was looking for, one navigation away from the notebooks it fills. Same
  form, opened where you are. The settings screen still has it.
- **The note composer reads as one column.** The rule between the picture
  button and "Tags, people" is gone, the two line up, and the rule that
  separates the composer from the notes below sits under the Add note button
  where it belongs. The composer is tinted, so it looks like where you write
  rather than like the first note in the list.

## 0.112.0 — 2026-09-09

- **The app asks which ontoplano it is for.** It used to open whatever server
  it was built against and there was no changing it, which made it a client for
  one company's copy rather than for ontoplano. Now the first launch asks: the
  instance the build was made for is a button, and your own address is a field
  beside it. Whatever you pick is checked before it is kept, so a typo fails
  there rather than as a blank page later, and the home-screen widgets follow
  it.
- **And a way back out.** Long-press the launcher icon and pick "Switch
  instance". Leaving one forgets its widget key too, since a key minted by one
  server means nothing to another. An instance the app was not built for opens
  with an address bar unless that server serves the app's fingerprint —
  `docs/ANDROID.md` says how.

## 0.111.0 — 2026-09-08

- **Reminders no longer appear twice.** A reminder falling due used to raise a
  notification _and_ float a card over the app with its own × to close — two
  things to dismiss for one thing that happened, and the notification is the
  better of the two since it arrives whether or not the app is in front. The
  card is gone. Nothing else changed: the same reminders arrive at the same
  time and make the same sound, and dismissing one is the Reminders page's job,
  where it always was.
- **The Reminders page asks for notification permission.** That question used
  to live on the floating card, which is where it went with it. It is a button
  on the page now, shown only while the answer is still no — which is also the
  page you are on when you have decided you want to be reminded.

## 0.110.0 — 2026-09-08

- **The time is a clock you touch.** `showPicker()` opened the platform's own
  picker, and which mode that opens in — the dial, or a numeric keypad — is
  Android's choice, remembered from whatever was used last; Firefox does not
  implement it at all, so on Firefox it opened nothing. There is no web API
  that asks for the dial, so the field is one: hours on two rings, 00–11
  outside and 12–23 in, picking one moves to the minutes, and dragging works
  throughout. The native input is still underneath it, hidden but focusable, so
  a keyboard and a screen reader still have the control they had.
- **A disabled button no longer turns black when you press it.** The rule that
  stopped a disabled button changing colour under the pointer set its
  background to `inherit` — which is the _parent's_ background, near-black on a
  dark card — and on a touch screen the hover state sticks after a tap. So
  pressing a button that could not be pressed made it vanish. Hover now belongs
  to buttons that can be pressed, rather than being undone afterwards.
- **"Coming up" only holds what is coming.** A reminder whose time has passed
  left the list; it still arrives as the notification it fires as, which is a
  thing you dismiss rather than a thing that is ahead of you.

## 0.109.0 — 2026-09-08

- **The time field opens the clock.** On a phone it was a box you typed into
  with a small clock beside it, and typing into six segments is not what
  anybody wants from a phone. Tapping either the day or the time opens the
  browser's own picker.
- **"Set it" is off until there is something to set.** It looked pressable with
  the fields empty, so pressing it appeared to do nothing — the browser's own
  validation message is easy to miss on a phone.
- **And setting one leaves the day on today** rather than blanking it to
  `--/--/----`. A form that forgets what day it is asks for the date every
  single time.
- **A reminder that will make a noise says so in the list**, with a small
  speaker beside its kind. That is the one thing about a reminder worth knowing
  before it happens rather than after.
- **A reminder pushed to a locked phone can make a sound again.** A notification
  carrying a tag replaces the previous one _silently_ unless it says otherwise,
  which is exactly what every reminder here does — so they were arriving
  correctly and mutely. They now ring, or stay silent, according to what you
  chose in Reminders. Your own uploaded sound is still only for a page that is
  open: nothing may play arbitrary audio from a service worker, so a locked
  phone gets its own notification sound and no other.

## 0.108.0 — 2026-09-08

- **A birthday next week no longer says it is today.** The sentence came from
  the reminder that fires on the morning, where "today" is true; in a list of
  what is coming it made every future birthday claim to be this one. It says
  "Ana turns 34", and the date is on the row where it always was.
- **Importing markdown checks the files are text, not just the names.**
  Markdown has no signature — every text file is valid markdown — so the honest
  version of the check is "is this text at all". A renamed binary was never
  dangerous (everything is escaped before it is rendered, and the renderer
  emits only tags it writes itself) but it was a hundred notes of mojibake to
  delete by hand. Those files are now skipped by name and counted back to you.
- **And the importer is reachable from Notebooks.** It was a settings page,
  which is not where anybody stands when they think of it.
- **The note form is not separated from the notes by a line.** It was the same
  line the notes are divided by, so the form read as the first entry in the
  list rather than as the thing that writes them.

## 0.107.0 — 2026-09-08

- **`make https-local` says what it is doing.** It asked for a password in the
  middle of Caddy's own output with no explanation — that is the CA being added
  to _this_ machine's trust stores, it is the only thing here that needs root,
  and `TRUST_LOCAL=0` skips it. It also serves the certificate the phone needs
  on its own port, so getting the file onto the device is opening a link rather
  than a puzzle, and prints the Android and iOS steps. Including the one that
  costs an evening: Chrome trusts a certificate you install this way and
  Firefox for Android does not.

## 0.106.0 — 2026-09-08

- **The Tailscale route is gone.** It was one company in the path for something
  that does not need one. What is left is the truth: HTTPS needs a certificate
  a browser trusts on a name the phone can reach, which means a domain you own
  or a tunnel from a machine that has one — and `make https-local` for when you
  have neither, which signs its own and asks the phone to trust it once. The
  Android documentation says plainly which of those hides the URL bar, since a
  private authority satisfies a service worker and does not satisfy Digital
  Asset Links.

## 0.105.0 — 2026-09-08

- **One and three days join the window buttons.** "What is today" and "what is
  this weekend" are the two questions somebody opens the page with, and a week
  was the shortest answer it offered.
- **`make https-local` serves the development app over HTTPS with no third
  party at all.** A certificate this machine signs, through Caddy's own
  authority; the phone is told once to trust it and then reminders, installing
  it as an app, and offline all work over the LAN. `make https-tailscale` is
  still there and is the other trade: nothing to install on the phone, one
  company in the path.

## 0.104.0 — 2026-09-08

- **"Coming up" says how far ahead it is looking, and you can change it.** Seven,
  fifteen, thirty or sixty days, or any number up to a year in the box beside
  them. It is in the address bar rather than in a preference, because it is a
  question you ask once and not a setting you keep.
- **Each kind of reminder has its own glyph.** A cake for a birthday, a wallet
  for a bill, the planner's own mark for a block. Six identical clocks made the
  icon column worth nothing.
- **Pressing a window does not throw you back to the top.** They were links,
  and a link is a navigation — on a phone, pressing "30" scrolled the page away
  from the control you had just pressed.
- **Uploading a ringtone no longer asks for your microphone.** Naming audio
  MIME types on a file field tells a phone browser you want audio, and its
  answer is to offer the recorder — Firefox on Android asked permission to
  record before it would show a file picker. It asks for a file now.
- **The app says why notifications cannot work, when they cannot.** They need a
  secure context, and `http://192.168.1.50:1493` is not one — `localhost`
  counts only on the machine running it, which is exactly what a phone on the
  same network is not. The browser's way of saying so is to make the API not
  exist, so the app did nothing, said nothing, and looked broken rather than
  unsupported. It now names the address it is on and points at
  `make https-tailscale`.

## 0.103.0 — 2026-09-08

- **Closing a week is a decision, then a commit.** Answering a row applied it
  immediately, so twenty blocks was twenty round trips and a misclick was
  already done. The card has two columns now: what is left on the left, and
  what you have decided on the right, each saying what will happen to it. You
  can put any of them back. Nothing is written until you press save.
- **A reminder asks for a day and a time separately.** One `dd/mm/yyyy, --:--`
  control is two questions in one box, and it looked it — on the phone most of
  all.
- **What is coming shows before it is due.** A birthday becomes a reminder on
  the morning of it, which is right for firing it and useless for seeing what
  is ahead — so the page works out the next two months of birthdays and bills
  itself. Nothing to run: it is right on dev, staging and production the first
  time the page is opened.
- **The weekly-review nag is a notification, not an appointment.** It is sent
  and it no longer sits in a list of things that are going to happen; the
  dashboard already carries the standing version.
- **"The one the app comes with" is just "Default".**
- **Short is red.** It is the one filter on the inventory that is about
  something being wrong rather than about which list you are reading.

## 0.102.0 — 2026-09-08

- **Reminders are a room of their own.** Everything with a time on it in one
  list — blocks, birthdays, bills, the review — and a place to set one that is
  about nothing at all, which is what an alarm clock is. Every reminder shows;
  only the kinds you say so about make a sound. You can upload ten sounds of
  your own, 300 KB each, and choose which one each kind uses.
- **A reminder now arrives at the second it says.** It used to be a timer that
  asked once a minute whether anything was due, which was correct and up to
  fifty-nine seconds late every single time. It sleeps until the exact moment
  the next one falls due, is woken by anything that writes a reminder — set an
  alarm for ten minutes' time and it reschedules immediately — and never sleeps
  longer than a minute regardless, so a clock change or a suspended machine
  cannot strand one.
- **Bills and the weekly review remind you now.** The day a bill wants paying,
  every day after that while it is still unpaid, and a sharper sentence on the
  day it can no longer be paid late. And the review, once the week is over.
- **The review opens on this week.** It opened on last week, so every arrival
  started with working out which week you were looking at.
- **What did not happen is answered a row at a time.** It was a column of
  checkboxes and three buttons at the bottom, so settling a week meant ticking
  things that had to all mean the same thing — and they rarely do. Each row now
  has its own four answers: it happened, it did not, it goes on the todo list,
  or it gets a day.
- **One note about the week instead of three lines.** Three boxes labelled
  "what went well", "what did not" and "what you will do differently" made a
  form of the one part of a review that is writing. Everything ever written is
  kept: the three lines of each week are now its first three paragraphs.
- **And the notes live in Notebooks.** A new Weekly notes tab, because a thing
  you write and can only find by navigating back to the week it was about is a
  thing you stop writing.
- **The dashboard counts the weeks you are behind.** It said "last week is
  still open" whether you were one week behind or five.
- **Inventory has a Short button.** Only the things there are fewer of than you
  keep — which is what a shopping trip is actually for. `shopping_list` takes
  `short: true` for the same question.
- **A block's Label is its Notes.** Same field, honest name, and it takes two
  thousand characters instead of three hundred so what a thing actually is fits
  in it. The grid still shows the first line, because a block is a rectangle an
  hour tall.
- **Three more home-screen widgets.** _Now_ — what you are meant to be doing
  and how much of it is left, with a bar that empties as it runs out. _Rings_ —
  today as three arcs: blocks, habits, todos. _The day_ — the whole day as one
  strip in your categories' colours, with a line where you are now.
- **Smaller things.** The urgency/interest/energy pickers stopped breaking
  their own labels in half. A todo's tick is as tall as its row instead of a
  small square in the corner of it. A habit's notes are five deep and scroll,
  rather than ten deep followed by "and 45 more" below the fold.

## 0.101.0 — 2026-09-07

- **The blue box that was not a block is gone.** Dragging out an hour drew a
  solid block in the selection colour with a time on it — a picture of
  something that did not exist, looking exactly like something that did, and
  counting in the column's layout so a real block over the same hours was
  squeezed beside it. It is drawn only while the pointer is down now, as an
  outline, so nothing can be left holding one. A shift-drag never gets it at
  all: that gesture has its own rectangle, and two answers to "what am I
  dragging" is one too many.
- **On the phone, how far you pull is how long it is.** A touch had to be held
  a full second before it counted as dragging out a block, by which time the
  pull was over — so every block came out the default half hour and the form
  opened before you could say otherwise. A fifth of a second: longer than a
  tap, short enough that the block follows your finger from the start. A tap
  still makes nothing.

## 0.100.0 — 2026-09-07

- **The grid draws the block the form is describing.** A block form is a page
  of fields about a rectangle you cannot see, and "every third day from the
  8th, 45 minutes" is a sentence nobody can picture. While the form is open the
  grid shows what pressing Save would leave behind — on the dates on screen and
  no further — as a dashed outline in the block's own colour. Editing one hides
  the block itself, so the grid shows the would-be state rather than the before
  and the after at once, and the hours scroll to wherever the preview lands.
- **The block form sits beside the week rather than on top of it.** On a wide
  screen it docks against the right edge with the grid readable next to it,
  because a preview under the dialog previewing it is no use. Below that width
  it is the sheet it always was.
- **The other way to be left holding a ghost.** A shift-drag on the grid is the
  multi-select rectangle, so no form opens — but the calendar made its
  selection anyway, and with nothing opening to take it off the screen it sat
  there, a box with a time on it and nothing in it, until the page was
  reloaded. This is the one that kept happening after the form's own exits were
  dealt with.

## 0.99.0 — 2026-09-07

- **What an every-N rhythm counts from is a field you can set.** It said
  "2026-09-08, set above" about a date nothing above it could set. It is a date
  input in the How often panel now, filled with the square that was clicked on
  the grid, or today for the New button, or the block's own date when one is
  being edited.
- **A block dragged out on the grid is drawn as a block.** Dragging out a
  square leaves the calendar holding a selection it draws as a box with a time
  on it and nothing in it. Abandoning the form left that ghost there for good,
  and anything created over the same hours had to share the column with it —
  which is why a new block sometimes came out as a sliver down the left edge
  with only its time showing. The selection goes when the form does.
- **Every number in the inventory panel counts what the filters allow.** A
  drawer said "2", you opened it, and one thing was in it: the panel counted
  everything filed there while the list showed what got past the filters. They
  answer the same question now, "Everything" included.
- **And the page says how much it is not showing.** "Not showing 4 items" sits
  under the filter buttons whenever the filters are keeping something back. It
  is in the layout either way — invisible rather than absent — so switching a
  filter never moves what is under it.
- **A location folds away what is inside it.** A house with a row per drawer
  made the panel taller than the things it was meant to help you find. Folding
  keeps the location and its number, hides its contents, and is remembered
  between visits.

## 0.98.0 — 2026-09-07

- **A block that does not come back weekly is finally drawn where it happens.**
  Every N days, every N weeks and monthly were saved correctly and generated
  correctly, and then the calendar drew them once a week on their weekday like
  everything else — so a stretch every other day appeared on Mondays and the
  rent appeared every week. The grid asks each block's own rule about each day
  it is showing now: four occurrences in a week where there are four, none in a
  fortnightly block's off week, the rent on its date.
- **Dragging one of them moves its rhythm, not just its weekday.** A weekday is
  all a weekly block is, so a drag used to send only that — which meant nothing
  to a rule that counts in days or in months, and the block sprang back as if
  the drag had never happened. Dropping it somewhere new moves what the rule
  counts from, so "every other day" dragged onto today comes back from today.
  Duplicating one keeps its rhythm too; it used to quietly produce a weekly
  copy.
- **Skipping one occurrence skips that one.** Skipping and moving named the
  block rather than the day, so on a block with four occurrences in the week
  they either did nothing or greyed out all four at once.
- **Copying a fortnightly block to another day keeps the fortnight.** The
  copies carried no rhythm at all and arrived weekly.
- **Editing a block no longer moves it.** Opening an every-other-day block from
  one of its days to fix a typo re-started the count from that day, so every
  occurrence after it moved. It keeps what it was counting from; choosing a
  different rhythm starts the new one from the day on screen.
- **The hover card says how often a block comes back.** A fortnightly block and
  a weekly one are the same rectangle; nothing on the grid said which was
  which, and the difference only showed up as a block that was missing next
  week. Weekly ones say nothing, because labelling every block "every Tuesday"
  would bury the ones worth reading.
- **An assistant can set a rhythm too.** `add_repeating_block` and
  `change_repeating_block` take `repeats` — weekly, every N weeks, every N days
  or a day of the month — and `repeating_week` says in words how often each
  block comes back. Only weekly ones could be asked for before, so "the bins
  every other Tuesday" was something you could do and it could not.

## 0.97.0 — 2026-09-07

- **A workout's category is yours to name.** Strength, cardio, mobility, sport
  and other were five words in the schema — somebody else deciding what your
  training is made of, and the fifth being called "other" is the proof. They
  are a list you keep now, with the same name and shape as the shopping
  categories: rename them, add "Swimming", remove what you never do. Every account starts with the five it
  had, and every workout keeps the one it was.
- **A repeating block's rhythm can be changed after it is made.** Every N
  weeks, every N days and monthly could be chosen when the block was created
  and never afterwards: the form posted the change, Save said it worked, and
  the block stayed weekly. Editing one applies it now.
- **A 500 offers a button, not a hash to copy out.** "Quote ba41f4" is asking
  somebody to be a courier for a string they cannot read; the id travels
  inside the report.
- **The row does not clip what is on it.** The last release gave the line under
  a name one line of room and a control to un-clip it — which cut recipe names
  in half, and moved every row below when pressed. The line has a floor and no
  ceiling: a thing gaining its first field costs nothing, and a thing with a
  great deal on it is simply taller.
- **Recording a price is a field on the item, not a button on the row.** It was
  the one thing that appeared on a press, and a price is not special enough to
  be worth what that cost.

## 0.96.0 — 2026-09-07

- **Nothing a row can gain makes it grow.** The price editor and a thing's own
  fields share one line under the name that is there whether or not anything
  is in it, so writing a price or giving something its first field leaves every
  other row exactly where it was. More than fits on that line is folded behind
  a chevron, which appears only where there is something folded — expanding is
  the one thing allowed to change a card's height, because it is somebody
  asking for it.

## 0.95.1 — 2026-09-07

- **Counting something up moves nothing.** "Record what you paid" used to
  appear beside the name the moment a count went above none, making that card
  taller and pushing every row under it down the screen — a press somewhere
  moving the thing you were about to press. It is an icon in the row's own
  actions now, on every row and visible only where it means something, so the
  space it needs is space the row always had.
- **The count is stacked, and a name stays readable.** Plus above, minus
  below: three controls across the front of a row took the width the name
  needed, and after a press "olive oil" came out as a column of letters. The
  "set price" prompt sits under the name now rather than beside it.

## 0.95.0 — 2026-09-07

- **How many, not whether.** The tick on a restock item is a count with arrows
  where it used to be, and the item's form asks how many you keep. Two tins of
  tomatoes and none were both "unticked" the moment you opened the last one;
  now the list is what you are short of, and having four of something you keep
  two of is a fact rather than an error. Everything you had ticked has one of
  it and keeps one, so the list you open is the list you left.
- **The new-location button starts where you are standing.** Pressing + in the
  kitchen offers a place in the kitchen.
- **A thing's location is on its edit form**, for when a drag is not how you
  want to do it — or not possible, on a phone.
- **A drag near an edge scrolls the page.** Something four screens down could
  be picked up and had nowhere to go.

## 0.94.0 — 2026-09-07

- **The lists say where things are.** Location first, category inside it: on
  Everything you can see what is in the cabinet and what is in the drawer, and
  standing in a room the four things under it are told apart instead of being
  one number.
- **A thing's own fields are back**, on its edit form and saved by the same
  button as the rest of it — a tape's length, a cable's plug — and shown on the
  row. An X beside each takes one off, instead of a sentence explaining that
  clearing its name is what removes it.

## 0.93.0 — 2026-09-07

- **A location's count says what it is counting.** It counts everything inside
  too — a kitchen whose cabinet holds a thing is not empty — and the number now
  carries "1 thing in Kitchen: 0 here and 1 in what is inside it", so the
  arithmetic on the way down a branch is not left to the reader.
- **A location that has things but shows none says why** — "3 things are
  hidden by it" — instead of a count beside an empty list, both true.
- **The demo and the dev database get a whole small flat**: rooms, furniture,
  drawers, and fifteen things filed through them, so the tree has depth and
  the counts are worth reading.

## 0.92.1 — 2026-09-07

- **The report box says exactly what it sends**: your account, the screen you
  are on by name, and which browser. It claimed "nothing else" while quietly
  attaching a user agent, which is a worse promise than none.
- **`make lint` runs again** — the job-dependency check crashed on an import
  of a directory rather than a file, taking the whole gate down with it.

## 0.92.0 — 2026-09-07

- **A new thing can be given its location as you write it down.** Standing in
  a drawer and adding something puts it in that drawer. Editing a thing does
  not ask again — moving it is a drag, or the row's own control.
- **The subscribe page is not a wall of buttons.** Choosing between one seat
  and the family plan is a tab now, so the only things shaped like buttons are
  the ones that take money. There is a way out that is not "sign out": a link
  to the demo, in its own tab.
- **The help buttons fold up on a phone.** They were a bar across the corner
  of every screen; now they are one square wearing a question mark, and a tap
  opens the row. Tapping it again closes it.
- **Something wrong on this screen?** A new button beside them opens a box to
  say what happened. It goes to whoever runs the instance, with the address of
  the screen and nothing you have written down.
- **`make dev` names the migrations it ran** instead of counting them, because
  which one ran is always the question.

## 0.91.0 — 2026-09-07

- **The inventory is one page, and it is the shopping list.** The two tabs are
  gone: they were the same rows read twice, and the half that showed what you
  own had no price, no tick, no archiving and no category. Now the house is a
  panel down the left and everything you own or need is beside it, with all of
  the list's powers on every row.
- **Everything you already had is in it.** Each account gets a root location
  called Home and every unfiled thing goes in it, so the panel is useful on the
  first visit instead of showing an empty tree beside "Not filed anywhere".
- **Drag a thing onto a location.** Pick a row up and drop it on a room, a
  cupboard or a drawer. Opening a location narrows the page to what is in it
  and everything under it; "Everything" gives them all back.
- **A find box**, because an inventory gets long in a way a list never did.
- **No form raises the autofill bar any more.** Sixty single-line fields were
  plain inputs, and Android offers its key, card and pin row over an input and
  never over a textarea — no attribute reaches that. They are all the same
  one-line field now, and writing a new plain one fails the build rather than
  turning up on your keyboard.

## 0.90.0 — 2026-09-07

- **Shopping is now Inventory, with two halves.** "To buy" is the list you
  always had, unchanged. "What I have" is the other half: a tree of rooms,
  cupboards and drawers, what lives in each, and each thing's own fields — a
  tape's length, a cable's plug. It answers "where do we keep the measuring
  tape". Your list is untouched: a thing with no address is exactly a
  shopping-list line, which is what every row already was.
- **Places are locations.** The word, everywhere it appeared, including for an
  assistant (`locations`, `add_location`, `put_item`).
- **The inventory has its own permission.** A shopping list is what you are
  about to buy; an inventory is a map of your home. `inventory:read` and
  `inventory:write` are separate from `shopping:*`, so a widget given the list
  is not told where the spare keys live. Tokens you already made keep
  everything they could do.
- **A person's card shows their birthday.** "Jan 8" with a small cake, rather
  than the `--01-08` it is stored as — and the card is half the height it was,
  which on a phone is the difference between six people and two on a screen.
- **Reminders say why a phone stayed quiet.** A delivery pass that found
  things due and had no device to send them to, or no push keys at all,
  wrote nothing anywhere. It says so now, once, on the minutes it matters.

## 0.89.0 — 2026-09-07

- **Trainings are workouts.** It was never a word anybody says, and the page
  itself already said "workout" everywhere but on its own tab. Health →
  Workouts; `/health/trainings` still answers, and an API token that asked for
  `trainings:read` now asks for `workouts:read` without you doing anything.
- **A workout dropped on the week is called by its name.** Planned from the
  plan rather than from the workout, it drew itself as a grey box labelled
  "Untitled". It wears the workout's title now — and renaming the workout
  renames the block, because nothing was copied.
- **A recipe goes on a day from the list.** The calendar button beside it
  opens the same "put it on a day" the recipe's own page has, so putting
  dinner on Thursday is one click instead of three.
- **The Meals tab is gone.** It was a read-only week beside a copy of the
  shopping list — the plan already draws meals, and the ingredients were
  already on the list. `/health/meals` goes to the recipes.
- **A note written in a notebook takes tags and people.** The same note typed
  into the diary carried both; typed into a notebook it carried neither. Both
  forms are the same two fields now, folded away until you want them.
- **Nothing hides under the help buttons.** On a page short enough not to
  scroll, the floating help dock sat on top of whatever was at the bottom
  right — a form's own save button, in one case — and it could not be clicked
  at all.

## 0.88.0 — 2026-09-07

- **Seven rooms instead of nine.** People is a tab inside Notebooks, and
  Recipes and Meals are tabs inside Health — the Kitchen room is gone. The
  menu was growing a room per feature; these belong beside what they are
  already about. Old `/kitchen/...` links still work.
- **A workout planned from the week no longer asks for a category.** Adding a
  training block from the plan failed with "Training required" and then
  demanded a category, though being a workout is what it is. It plans in one
  step now, in Health's colour.
- **The docs list the app's own menu.** A new Interfaces page shows every
  room and its tabs, generated from the navigation itself, so it cannot
  describe a menu the app no longer has.

## 0.87.1 — 2026-09-06

- **Rows look the same wherever they are.** A list row is one shape now — the
  thing's name on the left, what you can do to it on the right as bare icons
  — so a workout, a bill and a notebook stop each having their own idea of
  it. On a phone the name takes the width and the actions sit under it,
  instead of a title crushed into six-character lines beside four buttons.
- **One word for putting something aside: archived.** The shopping list said
  "snooze" while bills and workouts said "archive". It is archive
  everywhere, including for an assistant (`archive_item`, `unarchive_item`).

## 0.87.0 — 2026-09-06

- **A workout goes on the week, and the week finishes it.** A block can now
  be a training the way it can be an activity, and a workout has a "Plan it"
  that puts it on a day. The two are bound rather than copied: ticking the
  block off finishes the workout, and marking the workout done ticks today's
  block. Its plan also opens where you read it, instead of only inside the
  edit form.
- **A bill falls due the way its rhythm falls.** A weekly bill is due on a
  weekday — "the cleaner, Fridays" — and a yearly one on a date in the year,
  rather than both pretending to be a day of the month.
- **A bill's name is readable on a phone.** The row squeezed it into a few
  characters beside its buttons and broke words in half.

## 0.86.0 — 2026-09-06

- **The shopping list learns where things live.** Places nest the way a house
  does — a room holding a chest holding a drawer — and a thing can say which
  one it sits in, with fields of its own, because a tape measure and a cable
  do not describe themselves the same way. The list is unchanged: it is still
  what you need to buy. What is new is the other half, what you already have
  and where it is, and an assistant can now answer "where do we keep the
  measuring tape". The rest of the inventory — its own screens — comes next.

## 0.85.0 — 2026-09-06

- **Trainings, under Health.** A workout is a name, a kind and a plan, and it
  goes on the week the way a meal does — a block with the workout attached —
  so exercise is part of the plan rather than a calendar of its own. Add,
  edit, mark one done, archive; delete is confirmed in its own dialog and
  only reaches a workout already put away. There is a dashboard card for it,
  off unless you want it, and an assistant can keep them over MCP.

## 0.84.1 — 2026-09-06

- **The privacy page no longer claims an administrator can sign in as you.**
  They cannot — that was removed in 0.81.0 — and a privacy page saying
  otherwise is the worst kind of thing to leave stale. It now says what is
  true: the administration pages hold accounts and coarse events, never what
  anybody wrote.

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
