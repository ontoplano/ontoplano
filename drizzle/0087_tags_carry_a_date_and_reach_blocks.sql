CREATE TABLE `exceptional_task_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`task_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	`tagged_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `exceptional_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exceptional_task_tags_user_idx` ON `exceptional_task_tags` (`user_id`);--> statement-breakpoint
CREATE INDEX `exceptional_task_tags_task_idx` ON `exceptional_task_tags` (`task_id`);--> statement-breakpoint
CREATE INDEX `exceptional_task_tags_tag_idx` ON `exceptional_task_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `recurring_task_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`task_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	`tagged_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `recurring_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recurring_task_tags_user_idx` ON `recurring_task_tags` (`user_id`);--> statement-breakpoint
CREATE INDEX `recurring_task_tags_task_idx` ON `recurring_task_tags` (`task_id`);--> statement-breakpoint
CREATE INDEX `recurring_task_tags_tag_idx` ON `recurring_task_tags` (`tag_id`);--> statement-breakpoint
ALTER TABLE `todo_tags` ADD `tagged_at` text;