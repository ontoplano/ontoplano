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
CREATE TABLE `finance_budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`month` text NOT NULL,
	`category` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "finance_budgets_amount_check" CHECK(typeof("finance_budgets"."amount_minor") = 'integer' and "finance_budgets"."amount_minor" between 0 and 9007199254740991),
	CONSTRAINT "finance_budgets_month_check" CHECK("finance_budgets"."month" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and substr("finance_budgets"."month", 6, 2) between '01' and '12')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_budgets_bucket_unique` ON `finance_budgets` (`user_id`,`month`,`category`,`currency`);--> statement-breakpoint
CREATE TABLE `finance_commitment_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`commitment_id` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`transaction_id` integer,
	`note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`commitment_id`) REFERENCES `finance_commitments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `finance_transactions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "finance_commitment_entries_amount_check" CHECK(typeof("finance_commitment_entries"."amount_minor") = 'integer' and "finance_commitment_entries"."amount_minor" between -9007199254740991 and 9007199254740991 and "finance_commitment_entries"."amount_minor" != 0)
);
--> statement-breakpoint
CREATE INDEX `finance_commitment_entries_user_stock_idx` ON `finance_commitment_entries` (`user_id`,`commitment_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `finance_commitment_entries_transaction_idx` ON `finance_commitment_entries` (`user_id`,`transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_commitment_entries_stock_transaction_unique` ON `finance_commitment_entries` (`user_id`,`commitment_id`,`transaction_id`);--> statement-breakpoint
CREATE TABLE `finance_commitments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`person_id` integer,
	`currency` text NOT NULL,
	`opening_minor` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "finance_commitments_kind_check" CHECK("finance_commitments"."kind" in ('custody','payable','receivable','reserve')),
	CONSTRAINT "finance_commitments_status_check" CHECK("finance_commitments"."status" in ('open','settled','archived')),
	CONSTRAINT "finance_commitments_opening_check" CHECK(typeof("finance_commitments"."opening_minor") = 'integer' and "finance_commitments"."opening_minor" between 0 and 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX `finance_commitments_user_idx` ON `finance_commitments` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `finance_transaction_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`transaction_id` integer NOT NULL,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`category` text,
	`commitment_id` integer,
	`note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `finance_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`commitment_id`) REFERENCES `finance_commitments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_allocations_kind_check" CHECK(("finance_transaction_allocations"."kind" = 'personal' and "finance_transaction_allocations"."commitment_id" is null) or ("finance_transaction_allocations"."kind" = 'custody' and "finance_transaction_allocations"."commitment_id" is not null)),
	CONSTRAINT "finance_allocations_amount_check" CHECK(typeof("finance_transaction_allocations"."amount_minor") = 'integer' and "finance_transaction_allocations"."amount_minor" between -9007199254740991 and 9007199254740991 and "finance_transaction_allocations"."amount_minor" != 0)
);
--> statement-breakpoint
CREATE INDEX `finance_allocations_user_transaction_idx` ON `finance_transaction_allocations` (`user_id`,`transaction_id`);--> statement-breakpoint
CREATE INDEX `finance_allocations_commitment_idx` ON `finance_transaction_allocations` (`user_id`,`commitment_id`);--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `parent_id` integer;--> statement-breakpoint
CREATE INDEX `finance_transactions_group_idx` ON `finance_transactions` (`group_id`);--> statement-breakpoint
CREATE INDEX `finance_transactions_parent_idx` ON `finance_transactions` (`parent_id`);--> statement-breakpoint
ALTER TABLE `ledgers` ADD `opening_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledgers` ADD `opening_on` text;