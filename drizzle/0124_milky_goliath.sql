CREATE TABLE `finance_balance_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`ledger_id` integer NOT NULL,
	`as_of` text NOT NULL,
	`observed_minor` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_balance_checks_user_ledger_date_unique` ON `finance_balance_checks` (`user_id`,`ledger_id`,`as_of`);--> statement-breakpoint
ALTER TABLE `ledgers` ADD `opening_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledgers` ADD `opening_on` text;