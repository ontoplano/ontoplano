CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`mime` text NOT NULL,
	`filename` text DEFAULT '' NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`byte_size` integer NOT NULL,
	`bytes` blob NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "media_size_positive" CHECK("media"."byte_size" > 0)
);
--> statement-breakpoint
CREATE INDEX `media_user_idx` ON `media` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_user_sha_unique` ON `media` (`user_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `recipe_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`recipe_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`is_main` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_images_user_idx` ON `recipe_images` (`user_id`);--> statement-breakpoint
CREATE INDEX `recipe_images_recipe_idx` ON `recipe_images` (`recipe_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_images_once_unique` ON `recipe_images` (`recipe_id`,`media_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_images_one_main_unique` ON `recipe_images` (`recipe_id`) WHERE is_main = 1;