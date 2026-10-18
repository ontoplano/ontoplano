# Money owed, held and set aside

Finance → Commitments keeps four kinds of stock:

- **Custody:** somebody else's money you hold.
- **Payable:** money you owe somebody.
- **Receivable:** money somebody owes you.
- **Reserve:** your own money set aside for a purpose.

A stock has an original currency, an optional person, an opening amount and dated entries. Positive entries add to it; negative entries take away. History shows the balance after each entry. Creating or changing a stock never creates a bank movement. Different kinds and currencies stay separate, and none of these amounts is a bank balance.

## Mixed bank payments

Edit a ledger line and choose **Split this movement**. Enter signed personal and custody parts. Every part needs the line's sign and the parts must add to the line's amount exactly; the form shows what is missing. A personal part can set its own category. A custody part needs an open custody or payable stock in the same currency.

For a 2,500.00 payment, 2,475.00 personal and 25.00 payable leave the bank line unchanged. Only the personal part counts as personal spending. Saving the parts and their matching stock entries is one transaction. Several parts for one stock become one entry.

To undo a split, reverse the stock entries it created, then choose **Remove split**. Reversing an entry does not remove the bank line or its parts. A line with a split or a stock entry cannot change its amount, date, currency, meaning or ledger, and its ledger cannot be deleted while the line remains; the app names the lines that need attention.

## Settlements and reserves

Open a stock and choose **Settle**, or **Consume reserve** for a reserve. Pick an existing bank movement. The dialog shows the balance after the payment and asks you to confirm.

- An outgoing custody or payable payment belongs to the other person, so it does not count as your spending.
- A receivable is settled by an incoming repayment.
- A reserve is used by a real personal expense or fee. That expense still counts once, in the month it happened.
- Both sides need the same known currency. The app does not convert.
- One movement cannot settle or consume the same stock twice. Overpayment is refused; add a stock increase first.

Manual stock changes are dated entries of their own, never bank movements. Every running balance must stay nonnegative and never become an unsafe integer, including after a correction or reversal.

## Closing, archiving and recovery

Closing a stock with a nonzero balance needs a write-off note. The note and the write-off stay in the history. Settled and archived stocks leave the working list but remain under **Settled and archived**; reopen one to use it again.

Deleting a stock with history archives it. Permanent deletion is only available from the archived view, needs a separate confirmation, and is refused while bank evidence is linked. An assistant can reverse an entry only with the `destructive` grant; you can use **Put it back** in Settings → Integrations. Reversing an entry does not remove its split, so unsplit separately if the split was also wrong.

## Assistants and account moves

Read tools: `commitments`, `commitment_entries` (`statements:read`).

Write tools: `add_commitment`, `change_commitment`, `archive_commitment`, `close_commitment`, `record_commitment_entry`, `delete_commitment_entry`, `settle_commitment`, `consume_reserve`, `split_movement`, `unsplit_movement` (`statements:write`; deleting an entry also needs `destructive`). Amounts are signed integer minor units in the stock's own currency. Notebook-confined assistants cannot reach stocks.

Account export and import carry stocks, history and splits and remap their links. Deleting the account deletes them. The migration is `0125_green_cobalt_man.sql`; it creates no financial records and changes no existing amount. Back up before migrating. If you roll back the code after using these tables, keep the database and export first.

Budgets, reminders, interest, sharing and the combined money overview come later.
