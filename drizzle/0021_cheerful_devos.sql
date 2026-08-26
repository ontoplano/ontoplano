CREATE TABLE `recipe_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`recipe_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`quantity` real,
	`unit` text DEFAULT '',
	`note` text DEFAULT '',
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `shopping_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recipe_items_quantity_positive" CHECK("recipe_items"."quantity" IS NULL OR "recipe_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `recipe_items_user_idx` ON `recipe_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `recipe_items_recipe_idx` ON `recipe_items` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `recipe_items_item_idx` ON `recipe_items` (`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_items_unique` ON `recipe_items` (`recipe_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`method` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '',
	`servings` integer,
	`minutes` integer,
	`source` text DEFAULT '',
	`last_cooked_at` text,
	`archived_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recipes_servings_positive" CHECK("recipes"."servings" IS NULL OR "recipes"."servings" > 0),
	CONSTRAINT "recipes_minutes_positive" CHECK("recipes"."minutes" IS NULL OR "recipes"."minutes" > 0)
);
--> statement-breakpoint
CREATE INDEX `recipes_user_idx` ON `recipes` (`user_id`);--> statement-breakpoint
ALTER TABLE `exceptional_slots` ADD `recipe_id` integer REFERENCES recipes(id);--> statement-breakpoint
ALTER TABLE `shopping_categories` ADD `is_food` integer DEFAULT false NOT NULL;--> statement-breakpoint

-- A guess, so nobody arrives at recipes with nothing to put in them.
--
-- The categories whose names are obviously food are ticked; everything else is
-- not, and one screen in settings changes any of it. Guessing wrong here costs
-- a click; guessing nothing means the ingredient list is empty on the day the
-- feature ships.
UPDATE `shopping_categories` SET `is_food` = 1 WHERE lower(`name`) IN (
	'pantry', 'fresh', 'produce', 'frozen', 'fridge', 'freezer', 'dairy', 'meat',
	'fish', 'bakery', 'baking', 'spices', 'drinks', 'food', 'groceries', 'veg',
	'vegetables', 'fruit', 'despensa', 'geladeira', 'congelados', 'hortifruti',
	'padaria', 'carnes', 'bebidas', 'mercearia'
);--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `price_cents` integer;--> statement-breakpoint
ALTER TABLE `weekly_slots` ADD `recipe_id` integer REFERENCES recipes(id);