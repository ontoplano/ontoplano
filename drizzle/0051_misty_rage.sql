CREATE TABLE `places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer,
	`notes` text DEFAULT '',
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `places_user_idx` ON `places` (`user_id`);--> statement-breakpoint
CREATE INDEX `places_parent_idx` ON `places` (`parent_id`);--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `place_id` integer REFERENCES places(id);--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `attributes` text DEFAULT '{}' NOT NULL;