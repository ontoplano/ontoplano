# Finance

This fork has movement classification, balance checks, commitments and monthly budgets (Epics 1 to 4). The combined money overview and dedicated finance REST endpoints are still planned for Epic 5.

Start in Finance → Ledgers. Add an account in its original currency, import a statement, then review what each line means.

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

MCP and the JSON tools API use the same finance rules. Reads need `statements:read`, writes need `statements:write`, and destructive tools also need `destructive`. Notebook-confined keys can reach their ledgers, but cannot access account-wide commitments or budgets. Tool names, fields and retry/error handling are in the [assistant reference](reference/ai-agents.md).

Account export/import carries finance records and remaps their links. Before deploying a migration, keep a [database backup](BACKUP.md) and the previous application image. The current worktree's implementation and tests do not imply production deployment.
