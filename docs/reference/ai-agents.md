<!-- Written by hand in docs/prose/ai-agents.md — edit that file, then run `yarn docs`.
     The tables below marked "generated" come from the code itself. -->

# Using it with AI agents

`POST /api/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server: the same API tokens, the same scopes, and a set of tools a model can
call. It is what "put that on my to-do list" means when the thing being asked is
an AI agent rather than the app.

## The short version

Make a token (Settings → Integrations → **New token**, then the **An AI
assistant (MCP)** button), then hand it to whatever you are using.

**Claude Code, Codex, or anything else with a shell** — one command:

```sh
claude mcp add --transport http ontoplano https://app.ontoplano.com/api/mcp \
  --header "Authorization: Bearer onto_YOUR_TOKEN_HERE"
```

**Or just ask, in words.** Paste this to the assistant, with your token in
place of the last line, and let it do the setting up:

```text
I use ontoplano — a life management app with an MCP server. Please connect to it
and use it whenever I ask you about my week, my todos, my diary, my notebooks,
my shopping list or my recipes.

  MCP endpoint:  https://app.ontoplano.com/api/mcp
  Transport:     streamable HTTP (stateless — no session, GET is not supported)
  Auth:          an Authorization: Bearer header

Once connected, list the tools you were offered and tell me what I asked you to
do today. Do not write anything into my account until I ask you to.

Token: onto_YOUR_TOKEN_HERE
```

Your own instance answers at `https://your-host/api/mcp` — the address is the
one you type into the browser, with `/api/mcp` after it.

Two things the prompt is doing on purpose. It names what the app is _for_, so
the assistant reaches for it instead of asking you to repeat yourself; and it
says not to write anything yet, so the first thing it does is show you what it
can see rather than what it has done.

## Blocks and to-dos are different things

Worth knowing before you ask for anything, because it is the one distinction an
assistant gets wrong: a **to-do** is something to do with no hour attached, and a
**block** is an hour. "Ring the dentist" is a to-do; "deep work from 9 to 11" is
a block.

An assistant that only has `add_todo` answers the second by writing the time
into the title — `deep work 09:00–11:00` — and your day still looks empty. With
`schedule:write` it puts a real block on the day, and it can answer for the ones
already there:

> Skip the gym and the stretching today, and put deep work on from 9 to 11.

`finish_block` takes both answers. **Skipped is a real answer**, not a failure to
record one — a week that can only be told about the parts that went well is a
week that starts lying by the second one.

It can also change what is there, which matters more than it sounds:

> Push the study block to four, and put down that I was actually organizing
> my bird pictures for the last hour and a half.

`change_block` moves and renames; `cancel_block` takes something off a day
because it is not happening. **Cancelled is not skipped.** Skipped means you
meant to do it and did not, and the weekly review asks about it; cancelled means
the plan was wrong — the meeting moved, the class was called off. Without both,
an assistant asked to move something has only one way to clear the old one off
the grid, and it will use the wrong one: this is not hypothetical, it is what
happened, and the day ended up holding a duplicate block and a skip that never
took place.

Everything here is **that day only**. Moving this Thursday's gym never moves gym:
the occurrence is detached and the weekly plan is left alone, which is the same
thing alt-dragging it in the app does.

## How it behaves

Four things are worth knowing before you grant a token:

**It offers only what the token holds.** `tools/list` is filtered by scope, so a
token with `today:read` and nothing else is offered one tool. The scope is
checked again on every call, because a client that was never offered a tool can
still name one.

**Nothing in it is new behaviour.** Every tool calls the same service function
the web page calls, so the ceilings, the validation and the ownership checks are
the ones that already exist. A tool cannot be a way around a rule.

**It is stateless.** No session, no event stream, no state between calls — every
request carries its own token and is answered on its own. A `GET` answers 405,
because there is no server-initiated stream to open.

**A refusal is an answer.** A service saying "that is not a date" comes back as
tool content the model can read and act on, not as a protocol error it can only
give up on.

The tools are declared in one file — `src/lib/server/mcp/tools.ts` — and each
carries the sentence a model reads to decide whether it is the thing it wants.
[The tools](#the-tools) below lists every one, generated from that file, with
the scope each needs.

## Making the token

Settings → Integrations → **New token**. There is a button on that form called
**An AI assistant (MCP)** which ticks exactly the scopes the tools need.
Grant fewer if you want it to read and not write: the tools it was not granted
are not offered to it at all, so an assistant with a read-only token does not
know that `add_todo` exists.

The token is shown once, on the screen where you made it, with a link back to
this page. It is revoked from the same place, and revoking it takes effect on
the next request — there is no session to expire.

## The tools

Every tool the server offers, with the exact description a model is handed —
published from the same array that serves them, so the two cannot drift. A
token is only offered the tools its scopes reach: a tool missing from
`tools/list` is a permission not granted, not a feature that does not exist.
The scopes themselves are on [the permissions page](permissions.md).

### `today` — Today's plan

What is on today: the blocks planned for it and the tasks pulled onto it. This is the answer to 'what am I meant to be doing', and the first thing to reach for before adding anything. Habits are not here — they are their own permission, and their own tool.

_Needs `today:read`; read-only._

### `habits` — Habits due today

The habits scheduled for today, each with its streak and whether it has been kept yet. Separate from the day's plan on purpose: whether somebody kept their habits is a more personal thing than what is on their calendar, so it is granted separately.

_Needs `habits:read`; read-only._

### `tick_habit` — Tick a habit

Tick a habit for a day: for something being built, the tick means it was done; for something being avoided, it means it happened. Name it or give the id `habits` gave; a name that matches two habits is refused rather than guessed. Ticking twice is not an error; the second call takes it back, which is how the app’s own tick behaves.

_Needs `habits:write`; writes._

### `finish_block` — Mark a block done or skipped

Answer for one block on the day: it happened, or it did not. Takes the id `today` gives for that block. Skipping is a real answer — say skipped when the person says they did not do it. It is NOT a way to clear something off the day: a skip goes into the week’s record and the review asks about it. To move a block use `change_block`; to take one off because it was never happening use `cancel_block`. `todo` takes an answer back, for one ticked by mistake.

_Needs `schedule:write`; writes._

### `add_block` — Put a block on a day

Add a one-off block to one day: a title, a start time and how long it runs. This is for "deep work from 9 to 11 today" — a thing with an hour. Use `add_todo` instead when there is no time attached, and `change_block` to move or rename something already on the day rather than adding a second copy of it. It does not touch the repeating week; this is that day only.

_Needs `schedule:write`; writes._

### `change_block` — Move or rename a block

Change one block on one day: its time, its day, how long it runs, or what it is called. This is "push the study block to four", "make it two hours", "that was actually client work". Takes the id `today` or `upcoming` gives. Only the fields you pass change. It affects that day only — moving this Thursday’s gym does not move gym — and it never edits the repeating week. Renaming keeps which part of life it belongs to and stops it being the named activity it was, because that is what saying it was something else means.

_Needs `schedule:write`; writes._

### `cancel_block` — Take a block off the day

Remove a block from a day because it is not happening — the meeting moved, the class was called off, it was put on the wrong day. This is NOT the same as marking it skipped: skipped means it was meant to happen and did not, which is a fact the weekly review asks about, and cancelled means it was never going to. Use `finish_block` with "skipped" for the first and this for the second. A repeating block is only removed from that one day.

_Needs `schedule:write`; writes._

### `upcoming` — The days ahead

Everything planned from today onwards — the blocks of the week, in order. Use it to answer questions about a day that is not today.

_Needs `schedule:read`; read-only._

### `past` — The days behind

What was on the days that have already happened, with what each one was answered — done, skipped, or nothing yet. Use it before correcting a week: it gives the ids `finish_block` needs. Ask for a week back with `days: 7`, or name the day it starts on.

_Needs `schedule:read`; read-only._

### `search` — Search everything written

One search over diary entries, notebooks, notes, ideas, goals, people, recipes and todos. Prefer this to guessing which room a thing is in.

_Needs `search:read`; read-only._

### `todos` — The todo list

Tasks with no date on them yet. A todo gains a date by being put on a day, which promotes it onto the week.

_Needs `tasks:read`; read-only._

### `add_todo` — Add a todo

Put a task on the todo list. Leave the date off unless the person said when — a todo with no date is the normal case here, not an unfinished one.

_Needs `tasks:write`; writes._

### `finish_todo` — Finish a todo

Mark a todo done, which is what "I did that" means here — it is not deleted, it moves to done and stays in the record. Ask `todos` first for the id.

_Needs `tasks:write`; writes._

### `drop_todo` — Delete a todo

Remove a todo entirely, because it is not going to happen and is not worth a record — "bin that one", "forget it". Different from `finish_todo`, which keeps it as something that was done. Gone for good; prefer finishing it when it actually happened.

_Needs `tasks:write`; writes._

### `reopen_todo` — Put a todo back on the list

Undo a finish or a drop: the todo goes back to not-done. Use it when something was ticked by mistake, or when a dropped thing turns out to matter after all. It keeps its notes, its day and everything linked to it.

_Needs `tasks:write`; writes._

### `change_todo` — Change a todo

Rewrite a todo’s title or notes. Only the fields given change. Moving it on or off a day is `schedule_todo`; done and not-done are `finish_todo` and `reopen_todo`.

_Needs `tasks:write`; writes._

### `schedule_todo` — Put a todo on a day

Give a todo a date, which moves it onto that day’s board. This is what "do it on Thursday" means here.

_Needs `tasks:write`; writes._

### `unschedule_todo` — Take a todo off its day

Take the date off a todo, which moves it back to the list of things with no time yet. This is "not today after all" — the todo is kept, it just stops being on a day.

_Needs `tasks:write`; writes._

### `goals` — Goals

What the person is working towards, by horizon, with the work counted against each. `add_goal` transcribes one they just said; `close_goal` says how one ended.

_Needs `tasks:read`; read-only._

### `close_goal` — Say how a goal ended

Close a goal: achieved, missed, or abandoned. Missed and abandoned are different — missed is a deadline that passed, abandoned is a decision to stop — and both are worth recording honestly rather than being rounded to one. Takes the id `goals` gives. There is no tool that opens a goal; that is the person’s to make.

_Needs `tasks:write`; writes._

### `link_to_goal` — Count work towards a goal

Attach todos or repeating blocks to a goal, so finishing them moves its progress. Adds to what is already linked; nothing is replaced. `goals` gives the goal id and what it already has on it.

_Needs `tasks:write`; writes._

### `unlink_from_goal` — Take work off a goal

Detach todos or blocks from a goal. Only the ones named; everything else it counts stays.

_Needs `tasks:write`; writes._

### `reopen_goal` — Reopen a goal

Put a closed goal back to open. Its outcome note is cleared and the date it was closed on goes with it, so a reopened goal does not read as having been finished at some point in the past.

_Needs `tasks:write`; writes._

### `change_goal` — Change a goal

Rename a goal, or change its notes, horizon, start date, target or unit. Only the fields given change. Saying how it ended is `close_goal`, not this.

_Needs `tasks:write`; writes._

### `diary` — Recent diary entries

What has been written lately, newest first. An entry can belong to a notebook or to no notebook at all.

_Needs `notes:read`; read-only._

### `write_entry` — Write a diary entry

Add an entry. Markdown. Writing one when asked is the point of this tool — keep their words and their voice where you have them, and do not invent an entry nobody asked for. Put it in a notebook when it is about one subject; leave the notebook off for an ordinary day.

_Needs `notes:write`; writes._

### `notebooks` — Notebooks

The subjects being written against — a trip, a renovation, a book. Ask for these before writing an entry into one.

_Needs `notes:read`; read-only._

### `add_notebook` — Make a notebook

Make a notebook — a subject written against with no deadline: a book, a trip, a renovation. `write_entry` files notes into it by name.

_Needs `notes:write`; writes._

### `remove_notebook` — Remove an empty notebook

Delete a notebook that holds nothing — no notes, no tasks, no goals. One with anything in it is refused with what it holds: somebody’s writing is deleted by them in the app, never through a tool. For a notebook made by mistake.

_Needs `notes:write`; writes._

### `share_notebook` — Share a notebook with the family

Share one of the person’s notebooks with everybody on their family plan — they read it and write their own entries into it — or stop sharing with `shared: false`. Only its owner’s to flip, and only when they asked.

_Needs `notes:write`; writes._

### `ideas` — Ideas

Things caught before they evaporated, newest first. An idea is not a task: nobody has committed to doing it, which is what makes it cheap to write down.

_Needs `ideas:read`; read-only._

### `add_idea` — Catch an idea

Write an idea down without deciding where it belongs. The lowest-friction thing here; prefer it to a todo when the person has not said they will do it.

_Needs `ideas:write`; writes._

### `remove_idea` — Delete an idea

Delete an idea — for one added by mistake, or one that has been dealt with. It is gone, not archived, so prefer leaving it alone unless the person asked.

_Needs `ideas:write`; writes._

### `change_idea` — Change an idea

Rewrite an idea, or retag it. Only the fields given change — this is for a misheard word or a better tag, not for turning it into something else.

_Needs `ideas:write`; writes._

### `shopping_list` — The shopping list

What is to buy and what is already in the cupboard. An item is a thing, not a line: ticking it bought puts it back in the cupboard rather than deleting it.

_Needs `shopping:read`; read-only._

### `add_to_shopping_list` — Add to the shopping list

Put something on the list. If the cupboard already has it, this says so rather than adding a second one.

_Needs `shopping:write`; writes._

### `tick_bought` — Tick something bought

Mark an item bought, which moves it out of "to buy" and into the cupboard. The row stays: the same thing is bought again the next time it runs out.

_Needs `shopping:write`; writes._

### `untick_bought` — Put something back on the list

Undo a tick: the item comes out of the cupboard and back onto "to buy". Use it when something was marked bought by mistake, or when it has run out again. Nothing is lost either way — the row, its category and its price history are the same row.

_Needs `shopping:write`; writes._

### `archive_item` — Put something aside for now

Put an item away without deleting it — for something not wanted this week. It keeps everything about itself and comes back with `unarchive_item`. Prefer this to removing when somebody says "not now" rather than "never".

_Needs `shopping:write`; writes._

### `unarchive_item` — Bring something back to the list

Bring back an item that was put away, so it shows on the list again. `shopping_list` says which items are archived.

_Needs `shopping:write`; writes._

### `remove_from_shopping_list` — Take something off the shopping list

Remove an item because it is not wanted — "take milk off", "we already have that". Not the same as `tick_bought`, which records that it _was_ bought and keeps it in the history and the price record. Takes the id `shopping_list` gives.

_Needs `shopping:write`; writes._

### `recipes` — Recipes

Every recipe, with its ingredients. An ingredient here is a shopping item with an amount, which is what lets a meal on a day fill the shopping list.

_Needs `kitchen:read`; read-only._

### `add_recipe` — Add a recipe

Write a recipe down. Ingredients are one per line — "200 g flour", "2 eggs" — and each becomes a shopping item, so the list knows about them the day the meal is planned.

_Needs `kitchen:write`; writes._

### `change_recipe` — Change a recipe

Change a recipe’s title, method, servings, time or source, and add ingredients — one per line, quantity first. Only the fields given change, and existing ingredients stay.

_Needs `kitchen:write`; writes._

### `cooked_recipe` — Say a recipe was cooked

Record that a meal was made — `recipes` shows when each was last cooked, and this is what sets it. Name the ingredient ids that ran out and they land back on the shopping list, which is the loop the kitchen exists to close.

_Needs `kitchen:write`; writes._

### `archive_recipe` — Put a recipe away

Archive a recipe — out of the everyday list, not deleted — or bring one back with `archived: false`. For the dish nobody makes any more that somebody may yet ask for.

_Needs `kitchen:write`; writes._

### `file_shopping_item` — File an item into a section

Move a shopping item into a section — "put the milk under Dairy". Takes the item’s id from `shopping_list` and the section by name from `shopping_categories`; an empty section name unfiles it. A name matching no section is refused with the ones that exist.

_Needs `shopping:write`; writes._

### `shopping_categories` — The shopping list’s sections

How the shopping list is sectioned — produce, cleaning, whatever the person keeps. Read it before filing an item somewhere.

_Needs `shopping:read`; read-only._

### `add_shopping_category` — Add a shopping section

Make a new section for the shopping list — and say whether it holds food, because only food sections can feed recipes as ingredients.

_Needs `shopping:write`; writes._

### `change_shopping_category` — Rename a shopping section

Rename a section, or change whether it holds food. Only the fields given change; the items filed under it stay exactly where they are.

_Needs `shopping:write`; writes._

### `remove_shopping_category` — Delete a shopping section

Delete a section. Its items are not touched — they stay on the list, just unfiled. A section is a shelf label, and removing the label must not empty the shelf.

_Needs `shopping:write`; writes._

### `record_price` — Record what an item cost

Write down what was paid for a shopping item — "milk was 6,50 today". The list keeps a small price history per item, which is how it can notice drift. Takes the id `shopping_list` gives, and the price as the person said it.

_Needs `shopping:write`; writes._

### `add_goal` — Write down a goal they made

Transcribe a goal the person just committed to, in their own words — "apply to twenty companies this quarter". Never invent one, and never add a goal they did not say: a goal is a commitment, and the commitment is theirs. `goal_areas` lists the areas one can be filed under.

_Needs `tasks:write`; writes._

### `log_goal_progress` — Move a goal’s number

Record progress on a goal that counts something: pass `value` to set where it stands, or `delta` to add what just happened — "I sent three more CVs" is `delta: 3`. Exactly one of the two. `goals` shows the current number.

_Needs `tasks:write`; writes._

### `goal_areas` — The areas goals are filed under

The areas of life a goal can belong to — career, health, whatever the person keeps. Read it before filing a goal; `add_goal_area` makes a missing one.

_Needs `tasks:read`; read-only._

### `add_goal_area` — Add a goal area

Make a new area to file goals under. Only when the person named one that does not exist — `goal_areas` says what already does.

_Needs `tasks:write`; writes._

### `all_habits` — Every habit

The full list of habits, due today or not — id, name, type and which days each is scheduled. `habits` is today’s view with streaks; this is the one to read before adding or changing one.

_Needs `habits:read`; read-only._

### `add_habit` — Add a habit

Start tracking a habit: something to keep doing (`good`), to avoid (`bad`), or just to watch (`neutral`). Scheduled days come in the same shape `all_habits` shows for existing ones; leave them out for every day.

_Needs `habits:write`; writes._

### `change_habit` — Change a habit

Rename a habit or change its type, description or days. Only the fields given change; its history of kept days stays exactly as it was.

_Needs `habits:write`; writes._

### `reminders` — What will reach out, and when

The reminders set to fire — each hangs off a block, because a reminder here is "tell me before this starts". Include the past to see what already fired.

_Needs `schedule:read`; read-only._

### `remind_before_block` — Set a reminder on a block

Be told some minutes before a block starts — it reaches the phone even with the app closed. A reminder belongs to a block: for "remind me at three to call the dentist", first `add_block` the call at three, then set the reminder on it. Takes the id the day gives, like `slot:42`.

_Needs `schedule:write`; writes._

### `dismiss_reminder` — Dismiss a reminder

Wave one reminder off so it does not fire — for "no need to remind me about that any more". Takes the id `reminders` gives; the block it sat on is untouched.

_Needs `schedule:write`; writes._

### `repeating_week` — The week as it repeats

The blocks that make up every week — each with its weekday, time, length and category. Weekdays are numbered from Monday: 0 is Monday, 6 is Sunday. Not all of them are weekly: `repeats` says in words how often each one comes back, which can be every N weeks, every N days, or a day of the month. This is the template the days are generated from; `today` and `upcoming` show what it produced. Read it before changing Tuesdays rather than a Tuesday.

_Needs `schedule:read`; read-only._

### `add_repeating_block` — Put a block on every week

Add a block that comes back — "gym on Tuesdays at seven", "the bins every other Tuesday", "rent on the first". Weekly unless `repeats` says otherwise. This changes every week from now on; `add_block` is the one for a single day. Weekdays count from Monday: 0 is Monday, 6 is Sunday. A block can be a bare category rather than a named thing — leave the title out and it shows as the category itself, which is what "put work in those hours" means.

_Needs `schedule:write`; writes._

### `change_repeating_block` — Change a repeating block

Change every future occurrence of a repeating block: its weekday, time, length, how often it comes back, the text on it, its category or its reminder. This is "move gym to Wednesdays" or "make it every other week"; `change_block` is "move this Wednesday’s gym". Only the fields given change. Takes the id `repeating_week` gives.

_Needs `schedule:write`; writes._

### `remove_repeating_block` — Take a block out of the week

Remove a repeating block from every week to come. Its past occurrences and their record stay. For one day only, use `cancel_block` instead — this is the whole pattern.

_Needs `schedule:write`; writes._

### `categories` — The parts of a life

The categories blocks are filed under — the areas of this person’s life, each with its colour. Read it before writing a block, so the name is real rather than guessed.

_Needs `schedule:read`; read-only._

### `activities` — The named recurring things

Activities are the named things inside categories — "piano", not just "music". A block can name one instead of a bare category. `add_activity` and `change_activity` write them.

_Needs `schedule:read`; read-only._

### `add_activity` — Name a new recurring thing

Add an activity — a named thing inside a category, like "piano" inside "music" — so blocks can name it instead of the bare category.

_Needs `schedule:write`; writes._

### `change_activity` — Rename an activity, or say what it is

Change an activity: its name, the line describing it, or which category it belongs to. Takes the id `activities` gives. Only the fields you pass change. Blocks that name it follow the change; nothing on any day is moved.

_Needs `schedule:write`; writes._

### `people` — The people in their life

Everybody the person keeps a page for — name, relationship, birthday, contact details. These are other people’s facts held in this account, which is why they sit behind their own permission.

_Needs `people:read`; read-only._

### `upcoming_birthdays` — Whose birthday is coming

Birthdays in the days ahead, soonest first — the answer to "whose birthday is coming up". Only people with a birthday written down appear.

_Needs `people:read`; read-only._

### `add_person` — Add a person

Keep a page for somebody — name at minimum; birthday as YYYY-MM-DD, or --MM-DD when the year is unknown. A birthday written down announces itself on the morning, unless told not to.

_Needs `people:write`; writes._

### `change_person` — Change a person’s page

Correct or extend what is recorded about somebody — a birthday learnt, a number changed. Only the fields given change. Takes the id `people` gives.

_Needs `people:write`; writes._

### `daily_wins` — Three things that went well

The day’s three wins, as written. A practice, not a log: three lines a day, and blank ones are simply not written yet.

_Needs `notes:read`; read-only._

### `record_win` — Record a win

Write one of the day’s three good things, in the person’s own words, into the first empty line. Refused when all three are written — a day holds three, and the fourth is tomorrow’s first.

_Needs `notes:write`; writes._

### `weekly_review` — How a week actually went

A week read whole: planned against done, by category, with the three lines written about it. The heart of the app — this is what the Monday mail says, and what closing a week means. Defaults to the week now running.

_Needs `tasks:read`; read-only._

### `write_review_lines` — Write the week’s three lines

Replace the three lines of a week’s review — in the person’s own words, and only when they said them. These are what they will reread in a year; never compose them unasked.

_Needs `tasks:write`; writes._

### `data_streams` — The numbers being tracked

The account’s data streams — weight, mood, sleep, anything a plugin or a person logs over time — each with its slug, kind and unit. `log_data_point` writes into one by its slug.

_Needs `streams:read`; read-only._

### `log_data_point` — Log a reading

Write one point into a data stream — "I weigh 82 today", "slept 6 hours". Takes the stream’s slug as `data_streams` gives it; a slug that names nothing is refused with the list, never created on the quiet.

_Needs `streams:write`; writes._

### `apply_idea` — Mark an idea applied

Say an idea was acted on, with a note about what came of it — or take that back by calling it again. Applied is not deleted: the idea stays, wearing what happened.

_Needs `ideas:write`; writes._

### `favorite_idea` — Star an idea

Star an idea, or unstar it by calling this again. A star is the person’s to ask for — never decorate their inbox on your own judgement.

_Needs `ideas:write`; writes._

### `where_is` — Where a thing lives

Find a thing by name and say where it lives — "Living room › White chest › First drawer" — with its fields (a tape’s length, a cable’s plug). The inventory half of the shopping list.

_Needs `inventory:read`; read-only._

### `locations` — The locations tree

Every location, nested the way the house is — rooms holding furniture holding drawers — each with how many things sit directly in it.

_Needs `inventory:read`; read-only._

### `add_location` — Add a location

Add a location things can live in — a room, a chest, a drawer — optionally inside another location.

_Needs `inventory:write`; writes._

### `change_location` — Rename or move a location

Rename a location, or move it under a different parent (no parent_id moves it to the top level). It refuses to be put inside itself.

_Needs `inventory:write`; writes._

### `remove_location` — Remove a location

Remove a location. Locations inside it rise to where it was; things in it stay, just without an address.

_Needs `inventory:write`; writes._

### `put_item` — Say where a thing lives

Put a shopping/inventory item in a location, or take its address away by leaving location_id out. The item itself is untouched.

_Needs `inventory:write`; writes._

### `set_item_fields` — Set a thing’s own fields

Replace an item’s free fields wholesale — { "length": "5m", "plug": "USB-C" }. Not every thing shares a shape; these are this thing’s. Send the full set: removing a field is writing the rest.

_Needs `inventory:write`; writes._

### `workouts` — Your workouts

The workouts you have written down, under Health. Each has a category and a plan; put one on the week with add_block and its workoutId to have it planned like a meal.

_Needs `workouts:read`; read-only._

### `workout_categories` — The categories of workout this account keeps

The categories a workout can be filed under — this account’s own list, not a fixed one. `add_workout` and `change_workout` take a category_id from here.

_Needs `workouts:read`; read-only._

### `add_workout_category` — Add a category of workout

Add a category to this account’s list — "Swimming", "Physio". Answering with one that already exists returns it rather than making a second.

_Needs `workouts:write`; writes._

### `remove_workout_category` — Remove a category of workout

Take a category off the list. Workouts filed under it keep existing, without one.

_Needs `workouts:write`; writes._

### `add_workout` — Add a workout

Write a workout down: a title, a category (one of the account’s own, from `workout_categories`), a plan as Markdown, and roughly how long it takes. Scheduling it onto a day is a block with its workoutId, the way a meal is a block with a recipe.

_Needs `workouts:write`; writes._

### `change_workout` — Change a workout

Rewrite a workout. Only the fields given change — for a misheard word or a better plan, not to turn it into a different session.

_Needs `workouts:write`; writes._

### `archive_workout` — Put a workout away, or bring it back

Take a workout out of the working list, or restore it. Nothing is lost either way — its history stays.

_Needs `workouts:write`; writes._

### `workout_done` — Mark a workout done

Record that a workout happened just now — the gym’s version of marking a recipe cooked. It stamps the last-done time.

_Needs `workouts:write`; writes._

### `bills` — Your bills

The bills you expect to pay, and what you have actually paid. Amounts are in minor units (cents): 12000 is R$120,00. Marking one paid records the real amount, which can differ from the expected one.

_Needs `bills:read`; read-only._

### `bill_payments` — What a bill has cost

Every period a bill has been paid for, with the expected amount and what was actually paid. Amounts in minor units (cents).

_Needs `bills:read`; read-only._

### `month_bills` — A month of bills at a glance

For a month (YYYY-MM), what the monthly bills expected, what has been paid, and the gap. Amounts in minor units (cents).

_Needs `bills:read`; read-only._

### `bills_due` — Bills that want paying

The bills falling due between two dates, each on the day it wants paying (the due day less its lead), with whether that one is already paid. This is what the week shows.

_Needs `bills:read`; read-only._

### `add_bill` — Add a bill

Write down a bill you expect to pay: a name, the expected amount in minor units (cents), and a rhythm (weekly, monthly, yearly, once). A monthly bill can name the day of the month it falls due.

_Needs `bills:write`; writes._

### `change_bill` — Change a bill

Rewrite a bill. Only the fields given change. Editing the expected amount does not rewrite what past payments recorded — those are snapshots of the day they were paid.

_Needs `bills:write`; writes._

### `archive_bill` — Put a bill away, or bring it back

Take a bill out of the active list (it stopped being paid), or restore it. Its payment history stays either way.

_Needs `bills:write`; writes._

### `pay_bill` — Mark a bill paid

Record a bill paid for a period. The amount defaults to the expected one; give amount_paid in minor units (cents) when it differed. The period defaults to the current one for the bill’s rhythm. Paying the same period again corrects it, never doubles it.

_Needs `bills:write`; writes._

### `unpay_bill` — Undo a bill payment

Remove the payment recorded for a period — it was not actually paid, or was recorded by mistake. The inverse of pay_bill.

_Needs `bills:write`; writes._
