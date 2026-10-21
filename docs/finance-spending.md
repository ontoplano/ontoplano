# Personal spending and Insights

Open Finance → Insights and choose a month and original currency. The URL keeps your selection. A custom range uses `from=YYYY-MM-DD&to=YYYY-MM-DD`, including both dates. Every chart and total uses that window; the default is the last twelve calendar months in the account timezone.

Currencies stay separate. Unspecified currency is shown in raw minor units, never converted or replaced with the preferences currency.

## What spending means

- Gross expenses include outgoing expenses and fees. Unclassified negative lines count as assumed expenses and stay in the unclassified count.
- For a split movement, only personal portions count. Custody portions contribute neither personal spending nor personal income.
- Refunds reduce spending when received. A linked refund uses its parent's category, including an explicit personal allocation category. An unlinked refund is shown as an unmatched credit. Refunds never count as income.
- Transfers and cash withdrawals are excluded. The exclusions panel shows transfer counts and amounts in each direction, cash withdrawn with use unknown, and custody counts and amounts.
- The category table keeps gross expenses, refunds and signed net spending, including negative net values. Positive-only charts cannot draw refund credit and say so. Bank cash-flow charts show the original bank amounts separately from personal spending.

Spending does not certify a bank balance or available funds. The report shows the selected currency's [balance coverage](finance-balances.md). An empty period says **No recorded activity in this period**; a failed load stays an error.

Follow the unclassified count to review matching lines across ledgers. The link keeps the currency and exact dates. It shows up to 500 lines with the full matching count, names each ledger and links to its movement editor.

[Monthly budgets](finance-budgets.md) appear when a complete month is selected, using the same spending calculation. They cover all ledgers in their currency, even if the chart is filtered to one ledger.

For clients, `statements.spending(ctx, filter)` returns original-currency groups containing gross expenses, refunds, signed net spending, income, exclusions, unclassified counts and category totals. Aggregate reports have no movement-list cap. Single-currency chart helpers require a currency or ledger when the data contains several currencies. MCP and JSON tools callers can use `personal_spending`; see the [tool reference](reference/ai-agents.md).
