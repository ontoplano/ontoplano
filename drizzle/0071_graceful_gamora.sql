-- `ON DELETE SET NULL` written by hand: drizzle-kit leaves it off an added
-- column, and `tests/migrate-schema-parity.test.ts` catches the difference.
-- Deleting an imported statement line must not silently un-pay a bill, only
-- forget which line it was.
ALTER TABLE `bill_payments` ADD `movement_id` integer REFERENCES finance_transactions(id) ON DELETE SET NULL;