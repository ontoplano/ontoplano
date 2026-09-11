CREATE TABLE `ledgers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'bank' NOT NULL,
	`default_parser` text,
	`currency` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ledgers_user_idx` ON `ledgers` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledgers_user_name_unique` ON `ledgers` (`user_id`,`name`);--> statement-breakpoint
ALTER TABLE `finance_rules` ADD `color` text DEFAULT '#475569' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `ledger_id` integer REFERENCES ledgers(id);--> statement-breakpoint
-- Lines imported before ledgers existed belong to one all the same: an
-- account per person who has any, so nothing is left unfiled.
INSERT INTO `ledgers` (`user_id`, `name`, `kind`, `sort_order`)
  SELECT DISTINCT `user_id`, 'Imported', 'bank', 0 FROM `finance_transactions`;--> statement-breakpoint
UPDATE `finance_transactions` SET `ledger_id` = (
  SELECT `id` FROM `ledgers`
   WHERE `ledgers`.`user_id` = `finance_transactions`.`user_id` AND `ledgers`.`name` = 'Imported'
) WHERE `ledger_id` IS NULL;
