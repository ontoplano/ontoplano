CREATE TABLE `client_errors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`message` text NOT NULL,
	`url` text,
	`stack` text,
	`user_agent` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `client_errors_created_idx` ON `client_errors` (`created_at`);