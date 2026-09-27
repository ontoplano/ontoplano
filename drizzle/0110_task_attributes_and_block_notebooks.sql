ALTER TABLE `exceptional_tasks` RENAME COLUMN "meta" TO "attributes";--> statement-breakpoint
ALTER TABLE `recurring_tasks` RENAME COLUMN "meta" TO "attributes";--> statement-breakpoint
ALTER TABLE `recurring_tasks` ADD `notebook_id` integer REFERENCES notebooks(id);--> statement-breakpoint
CREATE INDEX `recurring_tasks_notebook_idx` ON `recurring_tasks` (`notebook_id`);--> statement-breakpoint
ALTER TABLE `todo_tasks` ADD `attributes` text DEFAULT '{}' NOT NULL;