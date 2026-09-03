# The payment provider goes here

Empty on purpose, and ignored by git. This repository ships no payment code:
what an instance charges with, if anything, is not a property of the software.

A build that is meant to take money drops exactly one module in here before
`yarn build`, exporting `provider` — an object satisfying `BillingProvider` in
`../contract.ts`:

```ts
export const provider: BillingProvider = new Paddle();
```

`make deploy` copies it from a sibling checkout automatically when one is there
(see `ontoplano-server/deploy.mk`). With nothing here the app builds and runs
completely, minus the ability to sell: `none.ts` answers every question with
"this instance takes no payments", the pages that would sell disappear, and the
webhook route refuses.

Nothing in here is ever committed. `.gitignore` in this directory is what makes
that true; if you find yourself adding an exception to it, the thing you are
adding belongs on the other side of the seam.
