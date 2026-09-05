-- A seat somebody was put on becomes a seat somebody said yes to.
--
-- Rows that already exist are accepted, and have to be: they are the plans
-- people are on today, and leaving them pending would take entitlement away
-- from accounts that have it. `created_at` is when it happened, which is as
-- close to when it was agreed as anything now knows.
ALTER TABLE `plan_members` ADD `accepted_at` text;--> statement-breakpoint
UPDATE `plan_members` SET `accepted_at` = `created_at` WHERE `accepted_at` IS NULL;
