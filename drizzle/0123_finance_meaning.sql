ALTER TABLE `finance_transactions` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `parent_id` integer;--> statement-breakpoint
CREATE INDEX `finance_transactions_group_idx` ON `finance_transactions` (`group_id`);--> statement-breakpoint
CREATE INDEX `finance_transactions_parent_idx` ON `finance_transactions` (`parent_id`);