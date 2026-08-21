PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`slot_id` integer,
	`exceptional_slot_id` integer,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`timing` text,
	`completed_at` text,
	`notes` text DEFAULT '',
	`resolved_activity_id` integer,
	`duration_override` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `weekly_slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exceptional_slot_id`) REFERENCES `exceptional_slots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "instance_has_exactly_one_source" CHECK(("__new_task_instances"."slot_id" IS NULL) != ("__new_task_instances"."exceptional_slot_id" IS NULL))
);
--> statement-breakpoint
/*
 `delayed` and `early` were never states, only ways of being done, so they fold
 into status='done' and carry the distinction over to `timing` instead.
*/
INSERT INTO `__new_task_instances`("id", "user_id", "slot_id", "exceptional_slot_id", "scheduled_at", "status", "timing", "completed_at", "notes", "resolved_activity_id", "duration_override", "created_at")
SELECT
	"id", "user_id", "slot_id", "exceptional_slot_id", "scheduled_at",
	CASE "status"
		WHEN 'pending' THEN 'todo'
		WHEN 'completed' THEN 'done'
		WHEN 'delayed' THEN 'done'
		WHEN 'early' THEN 'done'
		WHEN 'skipped' THEN 'skipped'
		ELSE "status"
	END,
	CASE "status"
		WHEN 'completed' THEN 'on_time'
		WHEN 'delayed' THEN 'late'
		WHEN 'early' THEN 'early'
		ELSE NULL
	END,
	"completed_at", "notes", "resolved_activity_id", "duration_override", "created_at"
FROM `task_instances`;--> statement-breakpoint
DROP TABLE `task_instances`;--> statement-breakpoint
ALTER TABLE `__new_task_instances` RENAME TO `task_instances`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `instances_user_idx` ON `task_instances` (`user_id`);--> statement-breakpoint
CREATE INDEX `instances_slot_idx` ON `task_instances` (`slot_id`);--> statement-breakpoint
CREATE INDEX `instances_exceptional_idx` ON `task_instances` (`exceptional_slot_id`);--> statement-breakpoint
CREATE INDEX `instances_scheduled_idx` ON `task_instances` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `instances_status_idx` ON `task_instances` (`status`);--> statement-breakpoint
CREATE INDEX `instances_slot_scheduled_idx` ON `task_instances` (`slot_id`,`scheduled_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `instances_exceptional_unique` ON `task_instances` (`exceptional_slot_id`);