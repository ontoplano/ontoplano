-- Places become locations, and the Shopping room becomes Inventory.
--
-- Hand-corrected for the same two reasons 0054 was: drizzle-kit reads a
-- renamed table as a new one beside a dropped one (every location gone), and
-- writes the rebuilt items' INSERT ... SELECT reading `location_id` from the
-- table that still calls it `place_id`. The CREATE statements are drizzle's,
-- so the constraint names are the ones the next diff expects; the data
-- movement below is not.
--
-- Nothing is defaulted into a location. `location_id` is nullable and always
-- was: a row with none is a pure shopping-list line, which is what every row
-- on an existing account is. They show under "Not filed anywhere" until
-- somebody says where they live, and the list behaves exactly as before.

CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer,
	`notes` text DEFAULT '',
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `locations_user_idx` ON `locations` (`user_id`);--> statement-breakpoint
CREATE INDEX `locations_parent_idx` ON `locations` (`parent_id`);--> statement-breakpoint
INSERT INTO `locations` ("id", "user_id", "name", "parent_id", "notes", "sort_order", "created_at", "updated_at") SELECT "id", "user_id", "name", "parent_id", "notes", "sort_order", "created_at", "updated_at" FROM `places`;--> statement-breakpoint
DROP TABLE `places`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shopping_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`shopping_category_id` integer,
	`notes` text DEFAULT '',
	`bought` integer DEFAULT false NOT NULL,
	`bought_at` text,
	`price_cents` integer,
	`location_id` integer,
	`attributes` text DEFAULT '{}' NOT NULL,
	`snoozed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shopping_category_id`) REFERENCES `shopping_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_shopping_items`("id", "user_id", "name", "type", "shopping_category_id", "notes", "bought", "bought_at", "price_cents", "location_id", "attributes", "snoozed", "created_at", "updated_at") SELECT "id", "user_id", "name", "type", "shopping_category_id", "notes", "bought", "bought_at", "price_cents", "place_id", "attributes", "snoozed", "created_at", "updated_at" FROM `shopping_items`;--> statement-breakpoint
DROP TABLE `shopping_items`;--> statement-breakpoint
ALTER TABLE `__new_shopping_items` RENAME TO `shopping_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `shopping_items_user_idx` ON `shopping_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `shopping_items_type_idx` ON `shopping_items` (`type`);--> statement-breakpoint
CREATE INDEX `shopping_items_bought_idx` ON `shopping_items` (`bought`);--> statement-breakpoint
CREATE INDEX `shopping_items_snoozed_idx` ON `shopping_items` (`snoozed`);--> statement-breakpoint
CREATE INDEX `shopping_items_category_idx` ON `shopping_items` (`shopping_category_id`);
--> statement-breakpoint
-- The room the shopping list lives in is called Inventory now, and its key
-- travels with it. A stored order naming a room that no longer exists is
-- dropped silently (see `applyOrder`), which would quietly move somebody's
-- Shopping room to the end of their own menu; a stored "put away" would be
-- forgotten outright and the room would reappear.
UPDATE `user_settings` SET `value` = replace(`value`, '"shopping"', '"inventory"')
	WHERE `key` IN ('ui.navOrder', 'ui.hiddenSections') AND `value` LIKE '%"shopping"%';--> statement-breakpoint
-- Section colours are one JSON object keyed by section, so it is the key
-- inside the value that moves, not the row's own key.
UPDATE `user_settings` SET `value` = replace(`value`, '"shopping":', '"inventory":')
	WHERE `key` = 'ui.sectionColors' AND `value` LIKE '%"shopping":%';--> statement-breakpoint
-- Locations are their own permission now: `shopping:*` is the list, and the
-- inventory half has `inventory:*`. A token already handed out asked for
-- everything the room could do, so it keeps that rather than silently losing
-- the tools it had.
UPDATE `api_tokens` SET `scopes` = `scopes` || ',inventory:read'
	WHERE `scopes` LIKE '%shopping:read%' AND `scopes` NOT LIKE '%inventory:read%';--> statement-breakpoint
UPDATE `api_tokens` SET `scopes` = `scopes` || ',inventory:write'
	WHERE `scopes` LIKE '%shopping:write%' AND `scopes` NOT LIKE '%inventory:write%';
