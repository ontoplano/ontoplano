# Category budgets

Open Finance → Budgets and choose a month (`YYYY-MM`). Each budget sets a ceiling for one category and original currency. It creates no bank movement, reserve or stock entry.

## Set a ceiling

Choose **New budget**, enter an existing category rule's name, a 3-letter currency code and an exact nonnegative amount. The currency needs an owned ledger; a refusal names the missing currency. Amounts use that currency's precision.

**Edit budget** changes the month, category, currency or amount. If someone has changed the row since you opened it, reload before saving again. **Delete budget** opens a confirmation; **Delete** removes only the ceiling. Transactions and spending history stay intact.

**Copy from last month** copies the previous month's ceilings into the selected month. Existing category/currency pairs are skipped, never overwritten. A renamed or deleted category leaves its old budget visible as **Category no longer exists**; it is not reassigned.

## Read the progress

- Allocated amount is the ceiling you set.
- Spent is personal expenses and fees minus refunds, floored at zero.
- Remaining is allocated minus spent, floored at zero and capped at the allocation.
- Credit is the excess when refunds outweigh expenses. It stays in the month received and never carries forward or becomes income.

The same progress appears on [Insights](finance-spending.md) for a complete selected month. Budgets cover all ledgers in their currency, even when a cash-flow chart is filtered to one ledger. Remaining budget is a spending allowance, not evidence of money in the bank.

## Assistants and upgrades

The JSON tools API and MCP expose `budgets`, `add_budget`, `change_budget`, `delete_budget`, `copy_budgets` and `personal_spending`. Reads need `statements:read`; writes need `statements:write`; deletion also needs `destructive`. Creation and copying support `requestId`; edits support `ifUpdatedAt`. On a stale-edit conflict, read the row again before retrying. Notebook-confined keys cannot access budgets. See the [tool reference](reference/ai-agents.md) for fields and errors.

Assistant deletion can be restored with **Put it back** if its category and currency still pass creation checks. Account export/import includes budgets. Migration `0126_zippy_blue_blade.sql` adds only the budget table and constraints; back up before applying it. See the [finance guide](finance.md) for recovery precautions.
