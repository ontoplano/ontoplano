-- A notebook that already existed keeps the three tabs it had.
--
-- `notebooks.modules` arrived null, and null reads back as the new default:
-- notes and tasks. Every notebook in the app until now also had Goals, so
-- leaving them null would take a tab off screens people are using — a column
-- being added is not a reason for somebody's goals to stop being listed
-- against the subject they belong to.
--
-- So the old three are written onto everything that exists at this moment, and
-- only notebooks made after it get the shorter default. Writing the list out
-- rather than leaving it null is also what makes the difference durable: these
-- rows now say what they hold, instead of inheriting whatever the default
-- happens to be next year.
--
-- The ids are the ones in `$lib/notebook-modules`, in that file's own order.

UPDATE `notebooks` SET `modules` = 'notes,tasks,goals' WHERE `modules` IS NULL;
