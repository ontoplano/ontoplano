-- Every repeating block starts on a day.
--
-- `weekly` and `monthly` carried no anchor, which made them rules about every
-- Saturday, or every 1st, that has ever been. Walking the plan back a month
-- generated a routine invented in September onto days in August — a past that
-- never happened, sitting in the record beside one that did.
--
-- The rule now refuses any date before its anchor, so existing blocks need one
-- or they keep backfilling. The honest answer is the day the block was written
-- down: nothing was planned by it before it existed. Occurrences already
-- generated are left exactly where they are — this stops new ones being
-- invented, it does not rewrite anybody's history.

UPDATE recurring_tasks
SET recurrence = 'weekly:' || substr(created_at, 1, 10)
WHERE recurrence = 'weekly'
  AND substr(created_at, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
--> statement-breakpoint
UPDATE recurring_tasks
SET recurrence = recurrence || ':' || substr(created_at, 1, 10)
WHERE recurrence GLOB 'monthly:[0-9]'
  AND substr(created_at, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
--> statement-breakpoint
UPDATE recurring_tasks
SET recurrence = recurrence || ':' || substr(created_at, 1, 10)
WHERE recurrence GLOB 'monthly:[0-9][0-9]'
  AND substr(created_at, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
