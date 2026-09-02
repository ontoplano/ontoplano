<!-- title: Ways in -->
<!-- blurb: tokens, scopes, streams, webhooks and the calendar link — the whole outside surface -->

# Ways in

Other programs reach an account five ways, and each is deliberately narrow.
Nothing here runs code inside ontoplano: there is no plugin that is a file you
drop in, and that is on purpose — a plugin platform made of processes on
somebody's own machine cannot take the instance down with it.

## API tokens

A token is created in Settings → Integrations, shown once, and stored as a
hash. It carries scopes, and a scope is a sentence somebody agreed to rather
than a permission bit: a grant given to a string of jargon is not informed.

<!-- generated: scopes -->

The narrowness is the point. A phone pushing weight readings needs to write to
a stream and read the schedule; it has no business reading the diary if that
phone is ever lost.

## The calendar link

The one exception to "shown once". A calendar app cannot send a header, so the
credential has to live in the URL — which means it is written into config
files, walked past by every proxy in between, and sometimes shared with a
household.

Two things keep that bounded. It holds `calendar:read` and nothing else, and
the feed route accepts a token holding exactly that — a powerful token pasted
into a feed URL is refused rather than honoured. And because what it can do is
so small, the address is kept and can be shown again, which is what makes
adding a second device possible without breaking the first. Up to five, each
revoked on its own.

## Data streams

An external program declares a stream and pushes points into it. The app
decides how to draw them; the program decides nothing about the UI. This is how
anything that measures the world — a scale, a sensor, a script — gets onto the
dashboard without shipping any code into ontoplano.

## Webhooks

The other direction: a subscription is an address, a set of events, and a
secret the delivery is signed with, so the receiver can tell it is really us.

<!-- generated: webhook-events -->

A subscription that keeps failing is disabled rather than retried forever, and
says so on the settings page where it can be revived.

## An assistant, over MCP

`POST /api/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server: the same API tokens, the same scopes, and a set of tools a model can
call. It is what "put that on my todo list" means when the thing being asked is
an assistant rather than the app.

Point a client at it with an ordinary bearer token. In Claude Code:

```sh
claude mcp add --transport http ontoplano https://app.ontoplano.com/api/mcp \
  --header "Authorization: Bearer onto_…"
```

Four things about it are worth knowing before you grant a token:

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

The tools are declared in one file, `src/lib/server/mcp/tools.ts`, and each one
carries the sentence a model reads to decide whether it is the thing it wants.

## Two plugins to read

Both are in `examples/`, both are plain Node with no dependencies, and neither
runs anything inside anybody's server.

**`onto-morning.mjs`** is the short one, and the place to start: a single token
holding one scope, one GET of `/api/v1/today`, and a message to ntfy or Telegram
from a crontab line. Around 150 lines including the comments. It is what most
plugins look like.

**`onto-household.mjs`** is the two-way one: it keeps two accounts' shopping
lists equal over webhooks — add milk on one phone and it is on the other, tick
it in the aisle and it is bought on both — with signature verification and
idempotent subscription. The two accounts can be on _different instances_, which
is the thing no shared-table design can offer.

## The server makes no request on your behalf

There is no place in ontoplano where you hand it an address and it goes and
fetches it. That is a deliberate absence rather than a gap.

Importing a recipe from a link would be the obvious place for one, and it was
built that way once. A request made from inside the box reaches everything the
box can reach and nothing outside it can — on a rented VPS the cloud provider's
metadata service, which hands out credentials to whatever asks; on a home
server the router's admin page, the NAS, and this app's own port. That is
server-side request forgery, and it is defensible: check the resolved address
rather than the string, refuse every private range in v4 and v6, re-check each
redirect, cap the body and the clock, and say the same sentence about every
refusal so the messages cannot map a network.

It was all of that, and it was still a door, on machines belonging to people
who did not ask for it. So the recipe import takes the page as a **paste**
instead: select all on the recipe page, copy, paste. It reads the same
schema.org data, works on sites that refuse servers anyway, and there is
nothing left to guard.

Outbound requests ontoplano does make are ones the operator configured —
webhooks to an address in your own settings, ntfy, mail. Those are a different
thing: the address comes from the person running the instance, not from
whoever can sign in to it.
