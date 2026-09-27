-- A delegated task's block, with the action the schema promises.
--
-- 0112 added `todo_tasks.delegated_slot_id` with ALTER TABLE, and drizzle-kit
-- writes that without the ON DELETE the schema declares — the gap 0111 closed
-- for `recurring_tasks.notebook_id`. Deleting a delegated block would then
-- refuse while the task pointed at it, where the schema says the task lets it
-- go. SQLite cannot change a foreign key's action in place, so the table is
-- rebuilt around it. The column is new, so nothing it holds is lost either way.

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_todo_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '',
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` text,
	`category_id` integer,
	`notebook_id` integer,
	`notebook_seq` integer,
	`scheduled_date` text,
	`delegated_slot_id` integer,
	`status` text DEFAULT 'todo' NOT NULL,
	`archived_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`urgency` integer,
	`interest` integer,
	`ease` integer,
	`attributes` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`delegated_slot_id`) REFERENCES `exceptional_tasks`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "todos_urgency_range" CHECK("__new_todo_tasks"."urgency" IS NULL OR "__new_todo_tasks"."urgency" BETWEEN 0 AND 5),
	CONSTRAINT "todos_interest_range" CHECK("__new_todo_tasks"."interest" IS NULL OR "__new_todo_tasks"."interest" BETWEEN 0 AND 5),
	CONSTRAINT "todos_ease_range" CHECK("__new_todo_tasks"."ease" IS NULL OR "__new_todo_tasks"."ease" BETWEEN 0 AND 5)
);
--> statement-breakpoint
INSERT INTO `__new_todo_tasks`("id", "user_id", "title", "notes", "completed", "completed_at", "category_id", "notebook_id", "notebook_seq", "scheduled_date", "delegated_slot_id", "status", "archived_at", "sort_order", "urgency", "interest", "ease", "attributes", "created_at", "updated_at") SELECT "id", "user_id", "title", "notes", "completed", "completed_at", "category_id", "notebook_id", "notebook_seq", "scheduled_date", "delegated_slot_id", "status", "archived_at", "sort_order", "urgency", "interest", "ease", "attributes", "created_at", "updated_at" FROM `todo_tasks`;--> statement-breakpoint
DROP TABLE `todo_tasks`;--> statement-breakpoint
ALTER TABLE `__new_todo_tasks` RENAME TO `todo_tasks`;--> statement-breakpoint
CREATE INDEX `todo_tasks_user_idx` ON `todo_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `todo_tasks_scheduled_idx` ON `todo_tasks` (`user_id`,`scheduled_date`);--> statement-breakpoint
CREATE INDEX `todo_tasks_notebook_idx` ON `todo_tasks` (`notebook_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `todo_tasks_notebook_seq_unique` ON `todo_tasks` (`notebook_id`,`notebook_seq`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
