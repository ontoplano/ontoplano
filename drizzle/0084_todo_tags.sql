CREATE TABLE `todo_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`todo_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`todo_id`) REFERENCES `todo_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `todo_tags_user_idx` ON `todo_tags` (`user_id`);--> statement-breakpoint
CREATE INDEX `todo_tags_todo_idx` ON `todo_tags` (`todo_id`);--> statement-breakpoint
CREATE INDEX `todo_tags_tag_idx` ON `todo_tags` (`tag_id`);