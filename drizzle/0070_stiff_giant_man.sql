ALTER TABLE `goal_targets` ADD `whole` integer DEFAULT true NOT NULL;
--> statement-breakpoint
-- Everything already recorded is counted unless it is visibly not: a goal
-- standing at 14.6 of 21.1 kilometres was never a thing anybody counts, and
-- waking up to a plus and a minus on it would be nonsense. Whole numbers on
-- both sides is the test, which is the same test somebody would apply by eye.
UPDATE `goal_targets`
SET `whole` = 0
WHERE `target_value` <> CAST(`target_value` AS INTEGER)
   OR `current_value` <> CAST(`current_value` AS INTEGER);
