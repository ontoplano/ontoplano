ALTER TABLE `todo_tasks` ADD `notebook_seq` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `todo_tasks_notebook_seq_unique` ON `todo_tasks` (`notebook_id`,`notebook_seq`);