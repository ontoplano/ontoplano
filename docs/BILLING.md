# Billing

Only a hosted instance sells anything. On a self-hosted one — `ONTOPLANO_SELF_HOST=true` —
every account is Pro forever, `/settings/billing` says so in one sentence, and the
webhook endpoint does not exist. This is the same rule the Telegram bot and the
deployment settings follow.

## The shape of it

- **Plans are objects**, in `src/lib/plans.ts`. A plan is a label, a price and a
  set of ceilings on things that accumulate — notebooks, people, API tokens, data
  streams, exports per day. Nothing limits _use_: a planner that stops working on
  the 200th block is not a smaller plan, it is a broken one.
- **`resolvePlan(userId)`** in `services/subscriptions.ts` is the only question
  anything asks. It answers with the plan, the status, where the answer came from
  (`self-hosted`, `trial`, `subscription`, `invited`, `lapsed`, `none`) and
  until when.
- **Ceilings are enforced in the service layer**, at the moment a thing is
  created — `assertWithinLimit(ctx, 'notebooks')` — so the API has the same
  ceiling the form does.
- **A new account gets 14 days of Pro.** On a selling instance the card comes
  first — see "Trials take the card first" below; elsewhere the internal
  no-card trial starts at signup. When it runs out nothing is deleted:
  whatever is over a ceiling stays where it is and stays readable, and only
  _adding more of that kind_ is refused.

## The provider

Paddle, as merchant of record: they take the payment, issue the invoice and
handle the tax, which is what a solo founder selling worldwide wants. (Lemon
Squeezy came first; it pays sellers through Stripe Connect, which cannot pay
out to Brazil.) Sandbox and live are separate Paddle accounts with separate
keys — which one the instance talks to follows from the API key alone
(`pdl_sdbx_…` keys reach `sandbox-api.paddle.com`).

Set these on the server:

| Variable                  | What it is                                                          |
| ------------------------- | ------------------------------------------------------------------- |
| `PADDLE_API_KEY`          | An API key. Checkout creation and the nightly reconcile use it.     |
| `PADDLE_WEBHOOK_SECRET`   | The secret of the notification destination you create there.        |
| `PADDLE_CLIENT_TOKEN`     | A client-side token (`test_`/`live_`) — safe to expose; Paddle.js on `/buy` initializes with it. |
| `PADDLE_PRICE_ID_MONTHLY` | The Pro monthly price (`pri_…`), with the 14-day trial on it.       |
| `PADDLE_PRICE_ID_YEARLY`  | Optional. Adds a "year at once" button.                             |

Point the notification destination at `https://your-instance/api/billing/paddle`
and subscribe to the `subscription.*` and `transaction.completed` events. One
dashboard prerequisite rides along: the **default payment link** (Paddle >
Checkout settings) must be set — `https://your-instance/buy` is the right
value — or transactions cannot be created at all.

"Go Pro" is an action, not a static link: the server creates a transaction
with the account id in `custom_data` — what every later webhook matches on —
and redirects to `/buy`, the one page allowed to load Paddle.js (the CSP is
widened for exactly that route in hooks.server.ts). The overlay checkout
opens itself from the `_ptxn` parameter. Paddle's own *hosted* checkout is
not used: it is gated behind approval on live accounts, and /buy is the same
overlay without the gate.

### Trials take the card first

On an instance that sells (and unless `ONTOPLANO_TRIAL_REQUIRES_CARD=false`),
a fresh open-registration account gets **no** internal trial: it lands on the
billing page, the button says "Start your free 14 days", and the fourteen
days live on the Paddle price (`trial_period`, card required). Nothing is
charged at checkout; the first charge lands when the trial ends, the page
and the mail both say so, and the trial-ending notice two days out carries
the cancel link. An account let in by **invitation code** gets Pro with no
billing UI at all (`provider: 'invited'`) — the alpha deal. Known caveat,
accepted for now: a lapsed account that re-subscribes gets the price's trial
again; if serial trials ever matter, returning accounts need a no-trial
price.

### Three rules

1. **The webhook is the source of truth.** Nothing in the app decides that
   somebody has paid; it records what the provider said.
2. **Every delivery is verified and stored by the provider's own event id.**
   They retry, and a retried "payment succeeded" applied twice is a bug you find
   out about from a customer. The unique index on `(provider, event_id)` is what
   makes exactly-once true rather than intended.
3. **A nightly pass catches what never arrived.** A webhook that was never
   delivered leaves nothing to notice.

```sh
0 4 * * * cd /path/to/ontoplano && npx tsx scripts/reconcile-billing.ts
```

It marks anything whose period has run out as expired, and — with an API key —
fetches every live subscription and corrects drift. Safe to run twice.

It also sends the trial-ending mail: two days before a trial runs out, once per
account, through the same SMTP-or-log path as everything else. This one is not a
courtesy — a person who forgot their trial and meets the receipt first is a
chargeback. It is marked sent only when it actually went: an undelivered notice
stays due (the next nightly run tries again), lands on `/admin` under "Mail that
did not go out" with a retry button, and raises a `/healthz` warning the
watchers alert on. Configure SMTP before opening the doors anyway — a notice
that spends its whole two-day window failing was still never read in time.

## Checking it works

`scripts/check-billing.ts` exercises the parts the e2e suite cannot, because
that suite runs self-hosted:

```sh
DATABASE_URL=/tmp/billing-check.db yarn db:migrate
DATABASE_URL=/tmp/billing-check.db npx tsx scripts/check-billing.ts
```

A forged signature is refused, a real one is applied (including through a
secret rotation's second `h1`), a stale timestamp is treated as a replay, a
retry keyed by Paddle's own `event_id` is not applied twice,
`transaction.completed` alone can bind a subscription to an account, and a
canceled subscription past its period drops off Pro.

**Not verified against a live Paddle account.** The signature check, the
idempotency and the status mapping are tested against fixtures; the shape of a
real payload and the remote calls are written from Paddle's documentation.
Walk the whole path in the sandbox — checkout, webhook, cancel — before the
live account sells anything.
