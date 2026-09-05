# Plans

Only a hosted instance sells anything. On a self-hosted one —
`ONTOPLANO_SELF_HOST=true` — every account is the whole app forever, `/settings/billing`
says so in one sentence, and there is nothing to configure. That is the same
rule the deployment settings follow: the things that exist
because somebody is running this _as a service_ are off when nobody is.

## What a plan actually decides

Everything about entitlement is in `src/lib/server/services/subscriptions.ts`
and is part of this repository:

There is no free tier on a hosted instance — the free version of ontoplano is
the one you host. What exists beside "subscribed" is what an account becomes
when the subscription ends:

|                                                             | not subscribed       | subscribed                 |
| ----------------------------------------------------------- | -------------------- | -------------------------- |
| the week, the diary, the notebooks, the people, the kitchen | readable, exportable | all of it                  |
| writing more                                                | no                   | yes                        |
| API tokens and data streams                                 | none                 | with ceilings on pile-up   |
| exports a day                                               | a couple             | more                       |
| accounts on one invoice                                     | —                    | up to 5 on the family plan |

**No feature is behind a plan.** The only ceilings are on the things that
accumulate — stored data points, exports — because those are what cost somebody
money to keep, and a limit on _use_ would make the app a demo. An account that
stops paying keeps everything it wrote, readable and exportable: the writing is
yours. A self-hosted instance has no ceilings at all, because nobody is paying
for that disk but you.

## Taking money is not in this repository

There is no payment code here. `src/lib/server/billing/` holds an interface and
an implementation that answers "this instance takes no payments"; a build that
sells copies one more file in before compiling. `billing/contract.ts` explains
the reasoning and what a provider has to be able to do.

This is deliberate and it is the same choice Vikunja made. If you are reading
this repository to run ontoplano yourself, none of that half concerns you — and
you should not have to work out which half is yours.

## Writing a provider

If you want your own instance to charge for something, the whole surface is
`BillingProvider` in `src/lib/server/billing/contract.ts`: about fifteen methods,
covering a checkout, a webhook, a customer portal and a nightly reconcile. Drop
a module exporting `provider` into `src/lib/server/billing/providers/` and the
build picks it up.

Three rules the existing one follows, learnt the expensive way, and worth
copying whatever provider you use:

- **The webhook is the source of truth.** Nothing in the app decides that
  somebody has paid; it records what the provider said.
- **Every webhook is stored by the provider's own event id.** They retry, and a
  retry has to apply exactly once.
- **The webhook is never the only way to learn.** Every checkout is written down
  when it opens, so the app can ask what became of it — when the customer comes
  back, and again nightly for the ones who closed the tab. This is not
  theoretical: a webhook destination that had become a redirect once cost hours
  of silent failures, and the nightly pass over subscription rows could not
  help, because the row was the thing that never got written.
