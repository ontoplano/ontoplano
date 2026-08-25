-- Roles, a ban field better-auth's admin plugin expects, and the history log.
--
-- The account that installed the instance becomes its first administrator: it
-- is already the one that owns the deployment settings, and an instance with no
-- administrator has no way to appoint one.
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`actor_id` text,
	`event` text NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`ip` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_events_user_idx` ON `audit_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
ALTER TABLE `session` ADD `impersonated_by` text;--> statement-breakpoint
ALTER TABLE `user` ADD `role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `banned` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` ADD `ban_reason` text;--> statement-breakpoint
ALTER TABLE `user` ADD `ban_expires` integer;--> statement-breakpoint
UPDATE `user` SET `role` = 'admin' WHERE `id` = (SELECT `id` FROM `user` ORDER BY `created_at` LIMIT 1);
