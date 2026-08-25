CREATE TABLE `invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`note` text DEFAULT '',
	`created_by` text NOT NULL,
	`expires_at` text,
	`used_at` text,
	`used_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_code_unique` ON `invites` (`code`);