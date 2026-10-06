CREATE TABLE `goal_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` integer NOT NULL,
	`kind` text NOT NULL,
	`target_id` integer,
	`value` real,
	`status` text,
	`note` text DEFAULT '' NOT NULL,
	`at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `goal_targets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `goal_events_user_idx` ON `goal_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `goal_events_goal_idx` ON `goal_events` (`goal_id`,`at`);--> statement-breakpoint
-- A goal closed before this table existed still has a closing to show: one
-- `status` row at the day it was closed, carrying what was said about it.
INSERT INTO `goal_events` (`user_id`, `goal_id`, `kind`, `status`, `note`, `at`)
SELECT `user_id`, `id`, 'status', `status`, COALESCE(`outcome`, ''), `closed_at`
FROM `goals`
WHERE `status` != 'open' AND `closed_at` IS NOT NULL;--> statement-breakpoint
-- And a typed measure starts its line where it stands, on the goal's last change.
INSERT INTO `goal_events` (`user_id`, `goal_id`, `kind`, `target_id`, `value`, `at`)
SELECT t.`user_id`, t.`goal_id`, 'progress', t.`id`, t.`current_value`, g.`updated_at`
FROM `goal_targets` t
JOIN `goals` g ON g.`id` = t.`goal_id`
WHERE t.`measure_activity` IS NULL AND t.`current_value` > 0;
