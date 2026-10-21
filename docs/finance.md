# Finance

Open **Finance** for the money overview: what is yours, what is committed, what you spent this month and what is left against your plans. Movement classification, balance checks, commitments and monthly budgets (Epics 1 to 4) sit underneath it, and each is linked below.

Money is shown per currency and never added across currencies. No exchange rate is assumed or invented.

## The money overview

### Everything, or only your own money

The Overview has a **Display** switch with two views. **Everything in accounts** shows every account balance and names money held for other people as custody. **My money only** removes custody money from the top figures: it shows **My money** (supported funds less custody), **Set aside** (your own reserves) and **Available** (My money less set aside). An account with no declared opening is not added to supported funds or My money; it stays separate as recorded-only until an opening is set. The choice is stored for the account and survives reloads; links can also ask for either view with `?view=mine` or `?view=all`. The switch affects the Overview; the other Finance screens keep their own rules.

Currency fields use **USD** only as an example placeholder. The actual currency is still the ledger's own, and no conversion is assumed anywhere.

- **What is yours:** every account balance when Everything is shown; in My money only, supported funds less the custody money held for other people. Reserves are then subtracted to give available money, and the subtraction is named beside it. Payables and receivables stay separate claims rather than being netted into funds.
- **What you spent this month:** personal spending only. Transfers, cash withdrawals and custody shares are excluded and counted beside the figure, refunds reduce the month they land in, and the unclassified outgoing count is visible so assumed spending is not presented as fact.
- **What is left against your plans:** each budget for the chosen month shows allocated, spent and remaining.
- **What the figures cannot say:** an account with no declared opening or an incomplete period is named at the total with the way to fix it. A currency held only in recorded-only accounts shows a recorded subtotal marked as not a balance; nothing on it is labelled available. Ledgers that predate the original-currency column stay readable: their amounts are shown in the account's own currency and marked as an undeclared currency until one is set. Accounts with no declared original currency show no total at all.

The overview reads aggregate queries per currency and dimension. It does not load the movement list.

## Read the same numbers elsewhere

`GET /api/v1/finance/summary`, `/ledgers`, `/movements`, `/budgets` and `/commitments` return the same values the screens show for the same parameters, for the caller's account only. A read token needs `statements:read`; there are no finance write endpoints in this release — writes stay on MCP and the existing movement endpoints. `/movements` accepts `limit` (default 100) and an id cursor, so no response returns the whole history. An id belonging to another account behaves exactly like a missing id. Fields and errors are in the [assistant reference](reference/ai-agents.md).

## Classify movements

Edit a line, or select several lines and choose **Classify selected**. Available kinds are expense, income, transfer, refund, fee and cash withdrawal. Clearing the kind returns the line to an assumption based on its sign. Unclassified outgoing money counts as assumed spending until you review it.

- Pair a transfer with its existing counterpart in another ledger. Same-currency legs must cancel exactly. Different currencies stay separate; the app does not invent an exchange rate. Both ledgers need known currencies.
- A transfer without a counterpart stays marked as pending. Unlink a pair before changing one leg's kind or deleting it. Unlinking clears the transfer classification on both legs; attached refunds or fees must be detached first.
- Attach a refund to the expense it reverses, or a fee to its payment. The currencies must match, though the ledgers may differ. A line has one parent; several partial refunds can share an expense.
- Linking preserves each line's date and amount. Deleting a refund's parent keeps the refund as an unmatched credit. Cash withdrawals stay excluded from spending because their use is unknown.

Bulk classification saves the whole selection or nothing. Linked stock entries and splits can block edits; the app explains which evidence to resolve first.

## Next steps

- [Balances](finance-balances.md): declare an opening and compare it with a statement closing figure.
- [Commitments and mixed payments](finance-commitments.md): track money held, owed or set aside, and split a payment's personal and custody shares.
- [Spending and Insights](finance-spending.md): choose a period, reconcile exclusions and review unclassified lines.
- [Category budgets](finance-budgets.md): set monthly ceilings and track remaining amounts and refund credits.

## Migration order

Upstream's `0123_user_last_active` and `0124_note_background_colour` stay in place. The finance migrations follow them as `0125` through `0128`; their SQL contents and hashes are unchanged.

A database from the earlier finance preview has already run the finance SQL, but not those two upstream migrations. Drizzle's timestamp cursor cannot discover that gap: it can report “already up to date” while the upstream columns are missing. Do not reset that database or replay the finance migrations. Stop the instance, take a consistent backup, and reconcile the two missing upstream migrations and their recorded hashes transactionally before starting this build. Verify row preservation, foreign keys and database integrity on a restored copy first. Fresh databases and databases on upstream's history use the ordinary migrator.

## Assistants and recovery

MCP and the JSON tools API use the same finance rules. Reads need `statements:read`, writes need `statements:write`, and destructive tools also need `destructive`. Notebook-confined keys can reach their ledgers, but cannot access account-wide commitments or budgets. The assistant can read the overview summary as well as the individual records. Tool names, fields and retry/error handling are in the [assistant reference](reference/ai-agents.md).

A full account export carries budgets, commitments, commitment history, balance checks and transaction splits, and import remaps their ledger, person and movement links. Emptying an account clears every one of those records for that account and leaves another account's rows untouched. The development seed includes a budget, one commitment of each kind, a synthetic transfer pair between two owned ledgers and a split payment. Before deploying a migration, keep a [database backup](BACKUP.md) and the previous application image. The current worktree's implementation and tests do not imply production deployment.
