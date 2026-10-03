# Roadmap

## In scope

### Widgets

Many Android widgets can be made, no attention has been given to that yet.

### Needs attention

So far, most attention have been given to: Tasks, Notebooks and Inventory.
meaning Finance, Goals, Media, Reminders, Health probably have many small and
big improvements in UX or general behavior and capabilities.
the REST API also probably lack obvious necessary endpoints

---

## Small improvements

- **An `.ics` importer**, beside the Todoist, Google Tasks, Google Keep,
  org-mode and Obsidian ones. Subscribing to a calendar already works;
  importing one does not.
- **A token's own log** on the page that lists them: a token says when it was
  last used and not what it did.
- **Filter the plan by kind.** On `/tasks/plan`, show only the recurring
  blocks or only the one-off ones — the repeating week versus what is unique
  to these days.

---

## Big features

- **Sharing notebooks and its contents.** : Maybe family/organization kind of thing with an invite link with scoped permissions.
- **Organizations**: Family / organization to do the above with multiple people
- **CLI**: A CLI tool that uses the REST API for easier scripting

## One day, maybe

- **More media**: annexing PDFs
- Cool plugins: webhook + API for a server that trasliterates text
- **A scheme you can schedule** rather than apply by hand, and an MCP tool
  for changing schemes.

### A business section

For someone running something small on their own, in the same place as the rest
of their life.

- Products or services: name, price, cost, still offered.
- Revenue: what sold, when, how much, to whom — a customer is a `people` row.
- Costs: one-off and recurring, categorised.
- One page answering "how was this month", by month and by product.

Not accounting software: no ledgers, no tax, no invoicing. Reuses `categories`
and links to `goals` like everything else.

This may be a big task of its own.

### Instances talking to each other

Two people on two instances — or one person on two of their own — have no way
to reach across. The obvious first thing is a calendar: an event one instance
holds, visible or subscribable from another, without either of them handing
over an account. What that looks like is open; whether it is a feed, an
invitation, or something two instances agree on between themselves is part of
the question.

---

## Decided against

So they stop coming back:

- **An in-process plugin system** — data streams and the API cover it. Too easy to accidentally create an RCE entry point.
- **AI features that call a model on your behalf.** The app holds no model
  account and pays for no inference.
- **Importing a recipe from a URL.** The server would be fetching an address
  somebody typed, which is a request forgery waiting to happen. Paste the page
  instead — that already works.
