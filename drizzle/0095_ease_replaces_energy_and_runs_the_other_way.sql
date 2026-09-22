-- Energy becomes ease, and the numbers turn round with it.
--
-- `energy` asked how much a task would take out of you, so five was the worst
-- answer and it was the one rating where a bigger number was worse. Everything
-- that ordered by ratings had to know that, and an unrated task had to sit on
-- a different side of the middle depending on which question it was. `ease`
-- asks the opposite and runs the same way as the other two: five is easiest.
--
-- So every value it already holds is mirrored — 5 becomes 1, 4 becomes 2, 3
-- stays — which is `6 - value`, the two ends of the scale added together. A
-- null stays null: nobody answered, and that is not a three.
--
-- Hand-written. `drizzle-kit generate` cannot tell a renamed column from a new
-- one beside a dropped one without being asked, and asking needs a terminal it
-- does not get here — left to itself it would have dropped every rating in the
-- database. `ALTER TABLE ... RENAME COLUMN` carries the data by definition and
-- SQLite rewrites the CHECK expressions that mention the column with it.
--
-- What it cannot rewrite is the *name* of a check constraint, so a database
-- built by these migrations keeps `todos_energy_range` while one built by
-- `drizzle-kit push` calls the same rule `todos_ease_range`. Renaming a
-- constraint in SQLite means rebuilding the table, which is the operation this
-- repository has been bitten by every time; the names are cosmetic and the
-- rules they hold are identical, so they are left alone deliberately.

ALTER TABLE `todo_tasks` RENAME COLUMN `energy` TO `ease`;--> statement-breakpoint
ALTER TABLE `exceptional_tasks` RENAME COLUMN `energy` TO `ease`;--> statement-breakpoint
ALTER TABLE `recurring_tasks` RENAME COLUMN `energy` TO `ease`;--> statement-breakpoint
ALTER TABLE `task_records` RENAME COLUMN `energy_override` TO `ease_override`;--> statement-breakpoint

UPDATE `todo_tasks` SET `ease` = 6 - `ease` WHERE `ease` IS NOT NULL;--> statement-breakpoint
UPDATE `exceptional_tasks` SET `ease` = 6 - `ease` WHERE `ease` IS NOT NULL;--> statement-breakpoint
UPDATE `recurring_tasks` SET `ease` = 6 - `ease` WHERE `ease` IS NOT NULL;--> statement-breakpoint
UPDATE `task_records` SET `ease_override` = 6 - `ease_override` WHERE `ease_override` IS NOT NULL;
