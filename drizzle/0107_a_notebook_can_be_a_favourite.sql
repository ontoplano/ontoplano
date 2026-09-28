CREATE TABLE `notebook_favourites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`notebook_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notebook_favourites_user_idx` ON `notebook_favourites` (`user_id`);--> statement-breakpoint
CREATE INDEX `notebook_favourites_notebook_idx` ON `notebook_favourites` (`notebook_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notebook_favourites_unique` ON `notebook_favourites` (`user_id`,`notebook_id`);