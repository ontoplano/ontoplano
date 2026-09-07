-- A workout's kind becomes a row in a table the account owns.
--
-- Hand-corrected: as generated this added the column and dropped `kind`,
-- which throws away what every existing workout said it was. The five that
-- were hard-coded are seeded for every account that has anything in Health,
-- and each workout is pointed at the one matching the word it held.
--
-- Every account gets the five, not only accounts with workouts: the form has
-- to offer something the first time it is opened, and a new account gets them
-- from the same list in `services/workouts.ts`.

CREATE TABLE `workout_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workout_categories_user_idx` ON `workout_categories` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workout_categories_user_name_unique` ON `workout_categories` (`user_id`,`name`);--> statement-breakpoint
ALTER TABLE `workouts` ADD `category_id` integer REFERENCES workout_categories(id);--> statement-breakpoint
-- The five, for every account there is.
INSERT INTO `workout_categories` (`user_id`, `name`, `sort_order`)
	SELECT `id`, 'Strength', 0 FROM `user`;--> statement-breakpoint
INSERT INTO `workout_categories` (`user_id`, `name`, `sort_order`)
	SELECT `id`, 'Cardio', 1 FROM `user`;--> statement-breakpoint
INSERT INTO `workout_categories` (`user_id`, `name`, `sort_order`)
	SELECT `id`, 'Mobility', 2 FROM `user`;--> statement-breakpoint
INSERT INTO `workout_categories` (`user_id`, `name`, `sort_order`)
	SELECT `id`, 'Sport', 3 FROM `user`;--> statement-breakpoint
INSERT INTO `workout_categories` (`user_id`, `name`, `sort_order`)
	SELECT `id`, 'Other', 4 FROM `user`;--> statement-breakpoint
-- And each workout keeps what it was, by name.
UPDATE `workouts` SET `category_id` = (
	SELECT `c`.`id` FROM `workout_categories` `c`
	WHERE `c`.`user_id` = `workouts`.`user_id`
	  AND lower(`c`.`name`) = lower(`workouts`.`kind`)
);--> statement-breakpoint
ALTER TABLE `workouts` DROP COLUMN `kind`;