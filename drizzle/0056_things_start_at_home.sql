-- Every account's things start somewhere: a root location called Home.
--
-- The inventory shipped with `location_id` nullable and nothing defaulted into
-- it, on the argument that a row with no address is exactly a shopping-list
-- line. True, and it made the locations panel useless on a real account: every
-- item you already had sat under "Not filed anywhere" and the tree was empty
-- until you filed a hundred things by hand.
--
-- So an account with anything in it gets one root, and everything unfiled goes
-- in it. Nothing is lost and nothing changes about the list itself: Home is a
-- location like any other, and a thing can be dragged out of it.

INSERT INTO `locations` (`user_id`, `name`, `parent_id`, `notes`, `sort_order`)
	SELECT DISTINCT `user_id`, 'Home', NULL, '', 0 FROM `shopping_items`
	WHERE `user_id` NOT IN (SELECT `user_id` FROM `locations` WHERE `parent_id` IS NULL);--> statement-breakpoint
-- Into the account's own root: the oldest top-level location it has, which for
-- an account that already built a tree is whatever they called their house.
UPDATE `shopping_items` SET `location_id` = (
	SELECT `id` FROM `locations`
	WHERE `locations`.`user_id` = `shopping_items`.`user_id` AND `parent_id` IS NULL
	ORDER BY `id` LIMIT 1
) WHERE `location_id` IS NULL;
