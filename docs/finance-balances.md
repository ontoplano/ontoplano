# Ledger balances and statement evidence

An opening balance supports the arithmetic; a statement check tests it. Finance does not fetch balances, convert currencies or add balancing entries. See the [finance guide](finance.md) for movements and transfers.

## Declare an opening

Open **Finance → Ledgers**, then **Ledgers → New ledger**, or edit a ledger. Set its original ISO currency, opening amount and date. The opening is what it held **before** that day's movements.

The supported figure is the opening plus movements from that date through the as-of date, inclusive. The page shows today in the account timezone; MCP's `ledgers` also accepts `as_of`. Earlier movements stay under **Outside covered period**. Dates before the opening have no supported figure.

- **Recorded movements only:** no covering opening; the subtotal is not a bank balance.
- **Supported by opening:** arithmetic has an opening, without a matching latest statement check.
- **Verified at latest check:** the latest check at or before the as-of date matches. It verifies that check's date, not later movements.

Unknown currency stays **Unspecified**, in minor units, outside currency subtotals. Preferences do not supply a replacement. A known currency cannot change while movements, an opening or statement checks depend on it.

Enter signed amounts at the original currency's precision, or whole minor units for unspecified currency. Excess precision and unsafe integers are refused, not rounded.

## Record the statement's closing figure

Expand **Statement balance checks**. Enter the closing date and amount, with an optional evidence note.

One check is allowed per ledger/date. History shows observed and computed amounts, observed-minus-computed difference, and **Matched**, **Different** or **Unverified**. Checks without openings are retained. Opening or movement edits recalculate the history; differences create no adjustment.

Confirm deletion of an incorrect check, then record its replacement. Openings and movements stay unchanged. **Put it back** in Settings → Integrations restores assistant deletions with their original evidence, unless a replacement already occupies that date.

## Import integrity

Import reports additions, skipped duplicates and missing-opening coverage. The whole file succeeds or writes nothing:

- An unreadable row names its physical source line.
- A parsed row rejected by validation or storage has a distinct rejection message and line number.
- Rows before a declared opening refuse the whole file and identify the earliest date.
- Replaying the same file leaves existing rows and fingerprints unchanged.

Generic CSV uses the ledger's precision. Fingerprints retain historical two-decimal parser identities, including previously unspecified currencies. Old amounts are never rescaled; correct a mis-scaled amount explicitly instead of importing a duplicate.

## Other surfaces and recovery

Ledgers, dashboard and notebook tiles share the same balance evidence. Subtotals include active, covered ledgers with known currency and name exclusions.

MCP supports opening/currency fields on `add_ledger` and `change_ledger`, plus `balance_checks`, `record_balance_check`, `delete_balance_check`. `statements:read` / `statements:write` apply; deletion also needs destructive permission. Notebook keys reach checks only for their ledgers. Dedicated finance REST endpoints remain in Epic 5.

Migration `0124_milky_goliath.sql` adds nullable opening coverage, a zero default opening amount and statement checks. It rewrites no history. Export/import remaps ledger links; account deletion removes owned checks. Keep a native database snapshot and the previous image before deployment. Local implementation does not activate production.
