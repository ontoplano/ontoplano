# Roadmap

## In scope

### Widgets

Redo those that are gone.

### Insights

More cool optional dashboard overviews for data


### The rest of the REST API

`/api/v1` covers `me`, today, the schedule, shopping, streams, webhooks and
plugin manifests. MCP
reaches further — todos, diary, notebooks, ideas, goals, habits, recipes — and
those have no REST equivalent.

- A thin adapter and an ownership test each, done as one set, or the tenth will
  not look like the first.
- Scopes already exist per entity and per direction; nothing new is needed
  there.
- Keep track of how the two surfaces compare — what one can do that the other
  cannot.

### OAuth, so a phone can connect to the MCP server

`POST /api/mcp` takes an API token in an `Authorization: Bearer` header, which
works wherever you control the request — Claude Code, Codex, a script. The
connector UI on claude.ai and on the phone has no field for a header: it
speaks OAuth 2.1, discovers an authorization server from the MCP address, and
registers itself. Finding none here, it falls back to asking for a client id
and secret by hand, and there is nothing to give it. So the app is
unreachable from a phone.

- The endpoints are the standard set: `/.well-known/oauth-protected-resource`
  and `/.well-known/oauth-authorization-server`, dynamic client registration
  (RFC 7591), authorize, and token with PKCE — plus a 401 from `/api/mcp`
  carrying `WWW-Authenticate` so a client can find them.
- better-auth ships `mcp` and `oidc-provider` plugins that cover most of it;
  only `admin` is loaded today.
- The consent screen is the existing New token form with an Allow button: a
  grant mints the same token row with the same scopes, so `tools/list` stays
  filtered exactly as it is.
- Open: whether registration is open to any client that finds the address or
  restricted, and whether a self-hosted instance exposes this at all or waits
  for the hoster to turn it on.


---

## Small improvements

- **Sharing beyond shopping and notebooks.** A family plan can share a
  shopping category and a notebook today, opt-in, owner-controlled. Tasks
  and goals that belong to it should be shared too, but only editable by the
  owner (much like the categories and notebooks are).

- **An `.ics` importer**, beside the Todoist, Google Tasks, Google Keep,
  org-mode and Obsidian ones. Subscribing to a calendar already works;
  importing one does not.
- **A token's own log** on the page that lists them: a token says when it was
  last used and not what it did.
- **Filter the plan by kind.** On `/tasks/plan`, show only the recurring
  blocks or only the one-off ones — the repeating week versus what is unique
  to these days.
- **A blue "connect an assistant" box on the Integrations tab**, the same
  shape as the one by New token, shown only when the account has no token yet
  — so somebody arriving for the first time finds the AI setup without
  hunting for it. Easy: the preset and the button already exist.
- **A crash report the person can send.** The 500 page shows a hash to quote;
  replace it with a form that files a report we can read in admin — the route
  and what they were doing, never the content of what they wrote. So a bug is
  reported without us ever seeing their data.

---

## One day, maybe

- **More media**: annexing PDFs 
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
- **AI features inside the app.** The interface is MCP: your assistant, your
  token, your machine. Nothing in here calls a model.
- **Importing a recipe from a URL.** The server would be fetching an address
  somebody typed, which is a request forgery waiting to happen. Paste the page
  instead — that already works.
