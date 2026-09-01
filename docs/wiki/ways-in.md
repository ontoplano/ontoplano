<!-- Written by hand in docs/prose/ways-in.md — edit that file, then run `yarn docs`.
     The tables below marked "generated" come from the code itself. -->

# Ways in

Other programs reach an account four ways, and each is deliberately narrow.
Nothing here runs code inside ontoplano: there is no plugin that is a file you
drop in, and that is on purpose — a plugin platform made of processes on
somebody's own machine cannot take the instance down with it.

## API tokens

A token is created in Settings → Integrations, shown once, and stored as a
hash. It carries scopes, and a scope is a sentence somebody agreed to rather
than a permission bit: a grant given to a string of jargon is not informed.

| Scope             | What granting it allows                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `streams:write`   | Send readings into your data streams, and create new streams             |
| `streams:read`    | Read everything your data streams have ever recorded                     |
| `schedule:read`   | Read everything on your calendar for the days ahead                      |
| `today:read`      | See today's blocks, habits and tasks — what the phone widget shows       |
| `plugin:declare`  | Name and describe itself on your integrations page                       |
| `webhooks:manage` | Ask to be told when things happen — and manage those subscriptions       |
| `shopping:read`   | See everything on your shopping list                                     |
| `shopping:write`  | Add to your shopping list, and tick things bought                        |
| `calendar:read`   | Show your plan in a calendar app. It can see the plan and change nothing |

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

| Event             | When it fires                       |
| ----------------- | ----------------------------------- |
| `todo.created`    | a todo is added                     |
| `todo.completed`  | a todo is finished                  |
| `idea.created`    | an idea is captured                 |
| `diary.created`   | a diary entry is written            |
| `shopping.added`  | something goes on the shopping list |
| `shopping.bought` | something on the list is bought     |

A subscription that keeps failing is disabled rather than retried forever, and
says so on the settings page where it can be revived.

## The one request the server makes for you

Importing a recipe from a link is the only place ontoplano fetches something on
your behalf. That makes it the one place a **server-side request forgery** could
live: a request made from inside the box reaches everything the box can reach
and nothing outside it can — on a rented VPS, the cloud provider's metadata
service, which hands out credentials to whatever asks; on a home server, the
router's admin page, the NAS, and this app's own port.

So it is guarded, and the guard is not a setting:

- **http and https only.** `file://` reads the disk; other schemes have been
  used to speak entirely different protocols through a fetch.
- **The resolved address is checked, not the string.** `localhost`, `127.0.0.1`,
  `[::1]`, and a name whose A record points at `10.0.0.5` are the same request,
  and only the address knows it. Loopback, link-local, both private ranges,
  carrier-grade NAT and multicast are all refused, in v4 and v6.
- **Redirects are followed by hand and re-checked at every hop.** A public URL
  that redirects to a private one is the standard way past a naive check.
- **The response is capped** at 2MB and 10 seconds, and only HTML is read.
- **Every refusal says the same sentence.** Distinguishing "that is private"
  from "that does not resolve" would map your network one guess at a time.

One residual: a name could resolve to a public address at the check and a
private one microseconds later — DNS rebinding. Closing it means connecting to
the checked address with the Host header set, which Node cannot do through
`fetch`. It is written down rather than hidden: the payoff is a single GET whose
body is parsed as a recipe and discarded, and only accounts that can already
sign in can reach it.
