-- The record of a deletion outlives the account.
--
-- `audit_events.user_id` demanded an account to point at, which meant the note
-- an account writes about its own deletion went down with it: the very next
-- statement emptied the account's audit rows, note included. An instance never
-- learned that somebody left on their own.
--
-- Nullable, the row can be disowned instead of deleted — the same arrangement
-- `client_errors` already has — with the deleted address kept in `detail`.
-- SQLite cannot drop NOT NULL in place, so the table is rebuilt around it.

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`actor_id` text,
	`event` text NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`ip` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_audit_events`("id", "user_id", "actor_id", "event", "detail", "ip", "created_at") SELECT "id", "user_id", "actor_id", "event", "detail", "ip", "created_at" FROM `audit_events`;--> statement-breakpoint
DROP TABLE `audit_events`;--> statement-breakpoint
ALTER TABLE `__new_audit_events` RENAME TO `audit_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audit_events_user_idx` ON `audit_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);
