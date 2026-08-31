<!-- title: Ways in -->
<!-- blurb: tokens, scopes, streams, webhooks and the calendar link — the whole outside surface -->

# Ways in

Other programs reach an account four ways, and each is deliberately narrow.
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
