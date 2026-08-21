/*
 Split "one occurrence" out of exceptional_slots.

 A one-off used to carry its own status, so it never produced a task_instance
 and every "what is on this date" query needed a union. Each existing one-off
 now hands its execution state to a real instance, and task_instances gains a
 nullable exceptional_slot_id alongside the (now nullable) slot_id, with a
 check that exactly one is set.

 Order matters: the instances are created while exceptional_slots still has the
 columns being moved, and only then is that table rebuilt without them.
*/
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`slot_id` integer,
	`exceptional_slot_id` integer,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
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
INSERT INTO `__new_task_instances`("id", "user_id", "slot_id", "exceptional_slot_id", "scheduled_at", "status", "completed_at", "notes", "resolved_activity_id", "duration_override", "created_at")
SELECT "id", "user_id", "slot_id", NULL, "scheduled_at", "status", "completed_at", "notes", "resolved_activity_id", "duration_override", "created_at" FROM `task_instances`;--> statement-breakpoint
INSERT INTO `__new_task_instances`("user_id", "slot_id", "exceptional_slot_id", "scheduled_at", "status", "completed_at", "notes", "resolved_activity_id", "duration_override", "created_at")
SELECT "user_id", NULL, "id", "date" || 'T' || "start_time" || ':00', "status", "completed_at", "notes", "resolved_activity_id", "duration_override", "created_at" FROM `exceptional_slots`;--> statement-breakpoint
DROP TABLE `task_instances`;--> statement-breakpoint
ALTER TABLE `__new_task_instances` RENAME TO `task_instances`;--> statement-breakpoint
CREATE INDEX `instances_user_idx` ON `task_instances` (`user_id`);--> statement-breakpoint
CREATE INDEX `instances_slot_idx` ON `task_instances` (`slot_id`);--> statement-breakpoint
CREATE INDEX `instances_exceptional_idx` ON `task_instances` (`exceptional_slot_id`);--> statement-breakpoint
CREATE INDEX `instances_scheduled_idx` ON `task_instances` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `instances_status_idx` ON `task_instances` (`status`);--> statement-breakpoint
CREATE INDEX `instances_slot_scheduled_idx` ON `task_instances` (`slot_id`,`scheduled_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `instances_exceptional_unique` ON `task_instances` (`exceptional_slot_id`);--> statement-breakpoint
CREATE TABLE `__new_exceptional_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`mode` text NOT NULL,
	`category_id` integer,
	`activity_id` integer,
	`label` text DEFAULT '',
	`active` integer DEFAULT true NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "exceptional_mode_category" CHECK("__new_exceptional_slots"."mode" != 'category' OR "__new_exceptional_slots"."category_id" IS NOT NULL),
	CONSTRAINT "exceptional_mode_activity" CHECK("__new_exceptional_slots"."mode" != 'activity' OR "__new_exceptional_slots"."activity_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_exceptional_slots`("id", "user_id", "date", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "meta", "created_at") SELECT "id", "user_id", "date", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "meta", "created_at" FROM `exceptional_slots`;--> statement-breakpoint
DROP TABLE `exceptional_slots`;--> statement-breakpoint
ALTER TABLE `__new_exceptional_slots` RENAME TO `exceptional_slots`;--> statement-breakpoint
CREATE INDEX `exceptional_slots_user_date_idx` ON `exceptional_slots` (`user_id`,`date`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
