# Money owed, held and set aside

Finance → Commitments tracks amounts held or outstanding, called stocks:

- **Custody:** somebody else's money you hold.
- **Payable:** money you owe somebody.
- **Receivable:** money somebody owes you.
- **Reserve:** your own money set aside for a purpose.

A stock has an original currency, optional person, opening amount and dated entries. Positive entries add; negative entries subtract. History shows each running balance. Stock changes create no bank movements. Kinds and currencies stay separate from each other and from bank balances.

## Mixed bank payments

Edit a ledger line and choose **Split this movement**. Personal and custody parts must share the line's sign and sum to its exact amount; the form shows the difference. Personal parts can name a category. Custody parts need an open custody or payable stock in the same currency.

For a 2,500.00 payment, 2,475.00 personal and 25.00 payable leave the bank line unchanged; only 2,475.00 counts as spending. Parts and stock entries save together or not at all. Parts for the same stock become one entry.

To undo, reverse the stock entries, then choose **Remove split**. Reversal keeps the bank line and its parts. A split or stock entry blocks changes to the line's amount, date, currency, meaning or ledger, and blocks deleting its ledger. The app names the affected lines.

## Settlements and reserves

Choose **Settle**, or **Consume reserve**, and pick an existing bank movement. Check the resulting balance and confirm.

- Outgoing custody/payable settlements are excluded from personal spending.
- Incoming repayments settle receivables.
- Reserves use personal expenses or fees; spending counts once, in the movement's month.
- Currencies must be known and match. There is no conversion.
- One movement cannot settle or consume the same stock twice. Overpayment requires a stock increase first.

Manual adjustments create dated stock entries, never bank movements. Running balances must stay nonnegative and within safe integers, including after corrections or reversals.

## Closing, archiving and recovery

Closing a nonzero stock needs a write-off note. The note and write-off remain in history. Settled and archived stocks leave the working list; find them under **Settled and archived** and reopen them to use them again.

Deleting a stock with history archives it. Permanent deletion needs the archived view, separate confirmation and no linked bank evidence. Assistant entry reversal needs `destructive`; **Put it back** in Settings → Integrations restores eligible deletions. A reversal keeps its split; remove that separately if wrong.

## Assistants and account moves

Read tools: `commitments`, `commitment_entries` (`statements:read`).

Write tools: `add_commitment`, `change_commitment`, `archive_commitment`, `close_commitment`, `record_commitment_entry`, `delete_commitment_entry`, `settle_commitment`, `consume_reserve`, `split_movement`, `unsplit_movement` (`statements:write`; deleting an entry also needs `destructive`). Amounts are signed integer minor units in the stock's currency. Notebook-confined assistants cannot reach stocks.

Export/import carries stocks, history and splits with links remapped. Account deletion removes them. Migration `0125_green_cobalt_man.sql` creates no financial records and changes no amounts. Back up before migrating. Before a code rollback, retain the database and export its data.

[Monthly budgets](finance-budgets.md) track spending ceilings separately. Reminders, interest, sharing and the combined money overview remain outside this feature. See the [finance guide](finance.md) for the other screens.
