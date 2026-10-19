# Finance

Open **Finance** for the money overview: what is yours, what is committed, what you spent this month and what is left against your plans. Movement classification, balance checks, commitments and monthly budgets (Epics 1 to 4) sit underneath it, and each is linked below.

Money is shown per currency and never added across currencies. No exchange rate is assumed or invented.

## The money overview

- **What is yours:** supported funds per currency, with the number of that currency's accounts that are supported. Custody and reserves are subtracted to give available money, and both subtractions are listed beside it. Payables and receivables stay separate claims rather than being netted into funds.
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

## Assistants and recovery

MCP and the JSON tools API use the same finance rules. Reads need `statements:read`, writes need `statements:write`, and destructive tools also need `destructive`. Notebook-confined keys can reach their ledgers, but cannot access account-wide commitments or budgets. The assistant can read the overview summary as well as the individual records. Tool names, fields and retry/error handling are in the [assistant reference](reference/ai-agents.md).

A full account export carries budgets, commitments, commitment history, balance checks and transaction splits, and import remaps their ledger, person and movement links. Emptying an account clears every one of those records for that account and leaves another account's rows untouched. The development seed includes a budget, one commitment of each kind, a synthetic transfer pair between two owned ledgers and a split payment. Before deploying a migration, keep a [database backup](BACKUP.md) and the previous application image. The current worktree's implementation and tests do not imply production deployment.
