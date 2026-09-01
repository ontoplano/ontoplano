CREATE TABLE `billing_checkouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_transaction_id` text NOT NULL,
	`settled_at` text,
	`settled_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `billing_checkouts_user_idx` ON `billing_checkouts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkouts_transaction_unique` ON `billing_checkouts` (`provider_transaction_id`);