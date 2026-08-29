CREATE TABLE `mail_failures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`to_email` text NOT NULL,
	`subject` text NOT NULL,
	`error` text NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`body_text` text,
	`body_html` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_attempt_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `mail_failures_open_idx` ON `mail_failures` (`resolved_at`);