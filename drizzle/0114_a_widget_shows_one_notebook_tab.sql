CREATE TABLE `phone_widgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`token_id` integer NOT NULL,
	`notebook_id` integer NOT NULL,
	`section` text NOT NULL,
	`status` text NOT NULL,
	`sort_by` text NOT NULL,
	`direction` text NOT NULL,
	`tag` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`token_id`) REFERENCES `api_tokens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`) REFERENCES `notebooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `phone_widgets_user_idx` ON `phone_widgets` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `phone_widgets_token_unique` ON `phone_widgets` (`token_id`);