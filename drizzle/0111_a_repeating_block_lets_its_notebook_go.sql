-- A repeating task block's notebook, with the action the schema promises.
--
-- 0110 added `recurring_tasks.notebook_id` with ALTER TABLE, and drizzle-kit
-- writes that without the ON DELETE the schema declares — the same gap 0065
-- closed for four other tables. Deleting a notebook would then refuse while a
-- block pointed at it, where the schema says the block is let go. SQLite
-- cannot change a foreign key's action in place, so the table is rebuilt
-- around it. The column is new, so nothing it holds is lost either way.

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_recurring_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`recurrence` text DEFAULT 'weekly' NOT NULL,
	`start_time` text NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`mode` text NOT NULL,
	`category_id` integer,
	`activity_id` integer,
	`label` text DEFAULT '',
	`active` integer DEFAULT true NOT NULL,
	`remind_lead_minutes` integer,
	`urgency` integer,
	`interest` integer,
	`ease` integer,
	`attributes` text DEFAULT '{}' NOT NULL,
	`notebook_id` integer,
	`recipe_id` integer,
	`workout_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "slots_urgency_range" CHECK("__new_recurring_tasks"."urgency" IS NULL OR "__new_recurring_tasks"."urgency" BETWEEN 0 AND 5),
	CONSTRAINT "slots_interest_range" CHECK("__new_recurring_tasks"."interest" IS NULL OR "__new_recurring_tasks"."interest" BETWEEN 0 AND 5),
	CONSTRAINT "slots_ease_range" CHECK("__new_recurring_tasks"."ease" IS NULL OR "__new_recurring_tasks"."ease" BETWEEN 0 AND 5),
	CONSTRAINT "slots_weekday_range" CHECK("__new_recurring_tasks"."weekday" >= 0 AND "__new_recurring_tasks"."weekday" <= 6),
	CONSTRAINT "slots_mode_category" CHECK("__new_recurring_tasks"."mode" != 'category' OR "__new_recurring_tasks"."category_id" IS NOT NULL),
	CONSTRAINT "slots_mode_activity" CHECK("__new_recurring_tasks"."mode" != 'activity' OR "__new_recurring_tasks"."activity_id" IS NOT NULL),
	CONSTRAINT "slots_mode_workout" CHECK("__new_recurring_tasks"."mode" != 'workout' OR "__new_recurring_tasks"."workout_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_recurring_tasks`("id", "user_id", "weekday", "recurrence", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "remind_lead_minutes", "urgency", "interest", "ease", "attributes", "notebook_id", "recipe_id", "workout_id", "created_at", "updated_at") SELECT "id", "user_id", "weekday", "recurrence", "start_time", "duration_minutes", "mode", "category_id", "activity_id", "label", "active", "remind_lead_minutes", "urgency", "interest", "ease", "attributes", "notebook_id", "recipe_id", "workout_id", "created_at", "updated_at" FROM `recurring_tasks`;--> statement-breakpoint
DROP TABLE `recurring_tasks`;--> statement-breakpoint
ALTER TABLE `__new_recurring_tasks` RENAME TO `recurring_tasks`;--> statement-breakpoint
CREATE INDEX `slots_user_idx` ON `recurring_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `recurring_tasks_notebook_idx` ON `recurring_tasks` (`notebook_id`);--> statement-breakpoint
CREATE INDEX `slots_weekday_idx` ON `recurring_tasks` (`weekday`);--> statement-breakpoint
CREATE INDEX `slots_weekday_time_idx` ON `recurring_tasks` (`weekday`,`start_time`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
