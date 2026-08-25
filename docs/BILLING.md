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
  (`self-hosted`, `trial`, `subscription`, `lapsed`, `free`) and until when.
- **Ceilings are enforced in the service layer**, at the moment a thing is
  created — `assertWithinLimit(ctx, 'notebooks')` — so the API has the same
  ceiling the form does.
- **A new account gets 14 days of Pro** with no card. When it runs out the
  account is on Free. Nothing is deleted: whatever is over a Free ceiling stays
  where it is and stays readable, and only _adding more of that kind_ is refused.

## The provider

Lemon Squeezy, as merchant of record: they take the payment, issue the invoice
and handle the tax, which is what a solo founder selling worldwide wants.

Set these on the server:

| Variable                      | What it is                                            |
| ----------------------------- | ----------------------------------------------------- |
| `LEMONSQUEEZY_CHECKOUT_URL`   | The buy link for the Pro variant.                     |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | The signing secret from the webhook you create there. |
| `LEMONSQUEEZY_API_KEY`        | Optional. Only the nightly reconcile uses it.         |

Point the webhook at `https://your-instance/api/billing/lemonsqueezy` and
subscribe to the `subscription_*` events.

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

## Checking it works

`scripts/check-billing.ts` exercises the parts the e2e suite cannot, because
that suite runs self-hosted:

```sh
DATABASE_URL=/tmp/billing-check.db yarn db:migrate
DATABASE_URL=/tmp/billing-check.db npx tsx scripts/check-billing.ts
```

A forged signature is refused, a real one is applied, a retry is not applied
twice, a trial that has run out reads as lapsed, and an expired subscription
drops to Free.

**Not verified against a live Lemon Squeezy account.** The signature check, the
idempotency and the status mapping are tested against fixtures; the shape of a
real payload and the remote reconcile call are written from their documentation.
Make one real test purchase before you open the doors.
