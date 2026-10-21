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
CREATE UNIQUE INDEX `finance_budgets_bucket_unique` ON `finance_budgets` (`user_id`,`month`,`category`,`currency`);