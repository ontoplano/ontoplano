-- Having a thing becomes how many of it you have.
--
-- Hand-corrected for the reason 0054 and 0055 were: the rebuild's
-- INSERT ... SELECT reads the new columns from the table that does not have
-- them yet. They are computed here instead, which is also the migration:
--
--   qty        1 where the box was ticked, 0 where it was not — exactly what
--              "I have this" meant, carried forward with nothing lost.
--   ideal_qty  1 for everything. One of a thing is what a shopping list has
--              always assumed, so every row keeps behaving as it did: still
--              to buy is qty < ideal_qty, which is unticked and only unticked.
--
-- `bought` is kept and stays true: it is what the recipes' "already have", the
-- API, the webhooks and an assistant's tick_bought read, and it is now derived
-- (qty >= max(ideal_qty, 1)) rather than set by hand.

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shopping_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`shopping_category_id` integer,
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
	FOREIGN KEY (`shopping_category_id`) REFERENCES `shopping_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "shopping_items_qty_positive" CHECK("__new_shopping_items"."qty" >= 0 AND "__new_shopping_items"."ideal_qty" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_shopping_items`("id", "user_id", "name", "type", "shopping_category_id", "notes", "qty", "ideal_qty", "bought", "bought_at", "price_cents", "location_id", "attributes", "snoozed", "created_at", "updated_at") SELECT "id", "user_id", "name", "type", "shopping_category_id", "notes", CASE WHEN "bought" THEN 1 ELSE 0 END, 1, "bought", "bought_at", "price_cents", "location_id", "attributes", "snoozed", "created_at", "updated_at" FROM `shopping_items`;--> statement-breakpoint
DROP TABLE `shopping_items`;--> statement-breakpoint
ALTER TABLE `__new_shopping_items` RENAME TO `shopping_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `shopping_items_user_idx` ON `shopping_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `shopping_items_type_idx` ON `shopping_items` (`type`);--> statement-breakpoint
CREATE INDEX `shopping_items_bought_idx` ON `shopping_items` (`bought`);--> statement-breakpoint
CREATE INDEX `shopping_items_snoozed_idx` ON `shopping_items` (`snoozed`);--> statement-breakpoint
CREATE INDEX `shopping_items_category_idx` ON `shopping_items` (`shopping_category_id`);