# Ledger balances and statement evidence

Finance distinguishes recorded movements from a supported balance. None of these features fetch bank balances, convert currencies, rewrite old movements or invent balancing entries.

## Declare an opening

Open **Finance → Ledgers**, then **Ledgers → New ledger** or edit an existing ledger. Set its original ISO currency, opening amount and opening date. The amount is what the account held immediately **before** movements on that date.

The supported figure at a date is the opening plus all movements on or after the opening date, through the requested as-of date inclusive. The page uses today in the account timezone and prints that date; MCP's `ledgers` read also accepts `as_of`. Earlier movements remain intact and appear in the **Outside covered period** count. A date before the declared opening has no supported figure.

- **Recorded movements only:** no opening covers the date. The figure is an imported/recorded subtotal, not a bank balance.
- **Supported by opening:** a declared opening supports the arithmetic, but there is no matching latest statement observation.
- **Verified at latest check:** the latest observation at or before the as-of date matches. This label refers to that check's date, not independent evidence for later movements.

Unknown currency stays **Unspecified**. Its numbers are labelled minor units and never enter a currency subtotal. No user-preference currency is substituted. A known currency cannot be changed while movements, an opening or statement observations depend on it; this feature does not perform conversion.

Amounts entered in forms are signed original-currency amounts, with the currency's actual precision. Unspecified currency accepts explicitly labelled whole minor units. Excess precision and unsafe integers are refused rather than rounded.

## Record the statement's closing figure

Select the ledger and expand **Statement balance checks**. Enter the statement closing date and amount, optionally a short evidence note.

Observations are unique per ledger and date. History shows the observed amount, computed amount, observed-minus-computed difference and **Matched**, **Different** or **Unverified** status. Evidence without a covering opening is retained and re-evaluated after an opening is declared. Edits to movements or openings also re-evaluate the history. A difference never creates an adjustment.

Delete an incorrect check explicitly using its confirmation control, then record the correction. Deleting a check does not change the opening or any movement. An assistant deletion can be restored with **Put it back** in Settings → Integrations; restoration keeps the original evidence and refuses to overwrite a replacement for the same date.

## Import integrity

The import result names added rows, duplicates skipped and missing-opening coverage. The entire file succeeds or writes nothing:

- An unreadable row names its physical source line.
- A parsed row rejected by validation or storage has a distinct rejection message and line number.
- Rows before a declared opening refuse the whole file and identify the earliest date.
- Replaying the same file leaves existing rows and fingerprints unchanged.

Generic CSV amounts use the ledger's currency precision. Historical two-decimal parser identities are retained for fingerprints, including ledgers whose currency was previously unspecified; old history is not silently rescaled. Review and explicitly correct any historically mis-scaled amount instead of re-importing it as a second movement.

## Other surfaces and recovery

The ledger page and dashboard call the same supported-funds query. Subtotals include only active, covered ledgers with known currency, and name excluded accounts. Notebook tiles carry the same evidence labels.

MCP supports opening/currency fields on `add_ledger` and `change_ledger`, and `balance_checks`, `record_balance_check`, `delete_balance_check`. Existing `statements:read` / `statements:write` scopes apply; deletion additionally requires destructive permission. Notebook confinement includes observations only for its own ledgers. The separate REST finance family remains part of Epic 5, not this change.

Migration `0124_milky_goliath.sql` adds nullable opening coverage, a zero default opening amount and a statement-observation table. It does not backfill or rewrite financial history. Export/import carries openings and checks with ledger IDs remapped; account deletion removes the owned checks. The existing native database snapshot is the restore mechanism. Keep a pre-activation snapshot and the previous image before deploying; no production activation is part of this implementation.
