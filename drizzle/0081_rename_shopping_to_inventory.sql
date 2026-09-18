-- The shopping tables become the inventory tables.
--
-- There is no shopping list in the database and there never was: the list is
-- the reading of these rows where you keep more than you have. So the tables
-- take the name of the thing they hold, and "shopping list" survives only
-- where it means that reading — the room's button, the API's list endpoint.
--
-- Written by hand for the reason 0054 and 0055 were: drizzle-kit reads a
-- renamed table as a new one beside a dropped one, which is every item gone.
-- ALTER TABLE ... RENAME TO is not used either, because SQLite only rewrites
-- the REFERENCES clauses in other tables when foreign keys are ON, and the
-- migrator runs with them OFF — `recipe_items` and `price_points` would be
-- left pointing at a table that no longer exists. Both are rebuilt here
-- instead, which is the only way to be sure. The CREATE statements are
-- drizzle's, so the next diff sees no drift.

CREATE TABLE `inventory_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`shared_with_family` integer DEFAULT false NOT NULL,
	`is_food` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `inventory_categories`("id", "user_id", "name", "shared_with_family", "is_food", "sort_order", "created_at") SELECT "id", "user_id", "name", "shared_with_family", "is_food", "sort_order", "created_at" FROM `shopping_categories`;--> statement-breakpoint
DROP TABLE `shopping_categories`;--> statement-breakpoint
CREATE INDEX `inventory_categories_user_idx` ON `inventory_categories` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_categories_user_name_unique` ON `inventory_categories` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`inventory_category_id` integer,
	`notes` text DEFAULT '',
	`qty` integer DEFAULT 0 NOT NULL,
	`ideal_qty` integer DEFAULT 1 NOT NULL,
	`bought` integer DEFAULT false NOT NULL,
	`bought_at` text,
	`price_cents` integer,
	`location_id` integer,
	`attributes` text DEFAULT '{}' NOT NULL,
	`snoozed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_category_id`) REFERENCES `inventory_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "inventory_items_qty_positive" CHECK("inventory_items"."qty" >= 0 AND "inventory_items"."ideal_qty" >= 0)
);
--> statement-breakpoint
INSERT INTO `inventory_items`("id", "user_id", "name", "type", "inventory_category_id", "notes", "qty", "ideal_qty", "bought", "bought_at", "price_cents", "location_id", "attributes", "snoozed", "created_at", "updated_at") SELECT "id", "user_id", "name", "type", "shopping_category_id", "notes", "qty", "ideal_qty", "bought", "bought_at", "price_cents", "location_id", "attributes", "snoozed", "created_at", "updated_at" FROM `shopping_items`;--> statement-breakpoint
DROP TABLE `shopping_items`;--> statement-breakpoint
CREATE INDEX `inventory_items_user_idx` ON `inventory_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `inventory_items_type_idx` ON `inventory_items` (`type`);--> statement-breakpoint
CREATE INDEX `inventory_items_bought_idx` ON `inventory_items` (`bought`);--> statement-breakpoint
CREATE INDEX `inventory_items_snoozed_idx` ON `inventory_items` (`snoozed`);--> statement-breakpoint
CREATE INDEX `inventory_items_category_idx` ON `inventory_items` (`inventory_category_id`);--> statement-breakpoint
CREATE TABLE `__new_recipe_items` (
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
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recipe_items_quantity_positive" CHECK("__new_recipe_items"."quantity" IS NULL OR "__new_recipe_items"."quantity" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_recipe_items`("id", "user_id", "recipe_id", "item_id", "quantity", "unit", "note", "sort_order") SELECT "id", "user_id", "recipe_id", "item_id", "quantity", "unit", "note", "sort_order" FROM `recipe_items`;--> statement-breakpoint
DROP TABLE `recipe_items`;--> statement-breakpoint
ALTER TABLE `__new_recipe_items` RENAME TO `recipe_items`;--> statement-breakpoint
CREATE INDEX `recipe_items_user_idx` ON `recipe_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `recipe_items_recipe_idx` ON `recipe_items` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `recipe_items_item_idx` ON `recipe_items` (`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_items_unique` ON `recipe_items` (`recipe_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `__new_price_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`item_id` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`for_date` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_price_points`("id", "user_id", "item_id", "price_cents", "for_date", "created_at") SELECT "id", "user_id", "item_id", "price_cents", "for_date", "created_at" FROM `price_points`;--> statement-breakpoint
DROP TABLE `price_points`;--> statement-breakpoint
ALTER TABLE `__new_price_points` RENAME TO `price_points`;--> statement-breakpoint
CREATE INDEX `price_points_user_item_idx` ON `price_points` (`user_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `price_points_date_idx` ON `price_points` (`for_date`);--> statement-breakpoint
-- The scopes move with the tables, and they have to move in this order.
-- `inventory:*` was the locations half and is now `locations:*`; `shopping:*`
-- was these tables and is now `inventory:*`. A token already handed out keeps
-- exactly what it could reach, under the names those things answer to now.
UPDATE `api_tokens` SET `scopes` = replace(`scopes`, 'inventory:', 'locations:') WHERE `scopes` LIKE '%inventory:%';--> statement-breakpoint
UPDATE `api_tokens` SET `scopes` = replace(`scopes`, 'shopping:', 'inventory:') WHERE `scopes` LIKE '%shopping:%';--> statement-breakpoint
-- Same for a webhook somebody is already listening on: the event is named
-- after the thing that changed, and the thing is an inventory item.
UPDATE `webhook_subscriptions` SET `events` = replace(`events`, 'shopping.', 'inventory.') WHERE `events` LIKE '%shopping.%';
