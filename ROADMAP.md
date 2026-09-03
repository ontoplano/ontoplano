# Roadmap

What Ontoplano does not do yet. `CHANGELOG.md` is what it already does.

Nothing here is scheduled. Want one? Open an issue saying so — the bullets under
each are the parts already decided; the rest is open.

---

## In scope

### A business section

For someone running something small on their own, in the same place as the rest
of their life.

- Products or services: name, price, cost, still offered.
- Revenue: what sold, when, how much, to whom — a customer is a `people` row.
- Costs: one-off and recurring, categorised.
- One page answering "how was this month", by month and by product.

Not accounting software: no ledgers, no tax, no invoicing. Reuses `categories`
and links to `goals` like everything else.

### Trips

A date range with a place, and things hanging off it: what to pack, what it
cost, what happened. Most of those units exist; the work is the linking and the
one page that shows a trip whole.

### The rest of the REST API

`/api/v1` covers `me`, today, the schedule, shopping, streams and webhooks. MCP
reaches further — todos, diary, notebooks, ideas, goals, habits, recipes — and
those have no REST equivalent.

- A thin adapter and an ownership test each, done as one set, or the tenth will
  not look like the first.
- Scopes already exist per entity and per direction; nothing new is needed
  there.

### Another language

Every string is written into its page in English.

- Strings into a keyed catalogue; the build fails on a key that is gone.
- Locale per account in `user_settings`, browser first, instance as fallback.
- Dates and numbers through `Intl` — several places still hardcode `en-US`.
- Portuguese first.

Not in scope: right-to-left layout, translating the docs.

### Sharing, narrowly

A family plan shares a bill and nothing else. The first thing worth actually
sharing is a **shopping category** — one household, one list of what is out of
milk. Per category, opt-in, never a default.

Everything else stays private. "Share your diary with your family" is not
somewhere this is heading.

---

## Small improvements

- **Audio on notes**, by the path images already take.
- **An `.ics` importer**, beside the Todoist, Google Tasks, Google Keep and
  Obsidian ones. Subscribing to a calendar already works; importing one does
  not.
- **Reorder the capture wheel.** The rooms wheel is arrangeable; the four
  capture kinds are not.
- **A scheme you can schedule** rather than apply by hand.
- **A token's own log** on the page that lists them: a token says when it was
  last used and not what it did.

---

## One day, maybe

- **An Obsidian plugin.** A vault already imports; writing back is the other
  half and a different thing.
- **Video on notes.** Probably never: a planner is not a media library.

---

## Decided against

So they stop coming back:

- **Budget tracking** — huge, crowded, barely touches the week.
- **Reading lists** — a different app.
- **An in-process plugin system** — data streams and the API cover it.
- **AI features inside the app.** The interface is MCP: your assistant, your
  token, your machine. Nothing in here calls a model.
- **Importing a recipe from a URL.** The server would be fetching an address
  somebody typed, which is a request forgery waiting to happen. Paste the page
  instead — that already works.
