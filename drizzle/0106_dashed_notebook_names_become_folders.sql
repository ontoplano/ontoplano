-- A notebook's place moves out of its name and into its folder.
--
-- Until now `Home — Kitchen — Countertops` was a notebook inside `Home —
-- Kitchen`, the em dash being the relationship. From here a notebook is
-- `Countertops` in the folder `Home/Kitchen`: every segment before the last
-- dash becomes a folder segment, trimmed, and the last one is the name. A name
-- with no dash in it stays where it is, at the top of the shelf.
--
-- A notebook that used to be a parent keeps its own name and stays a notebook;
-- the folder of the same name that its children now sit in is a separate
-- thing, which is the point of the change.
--
-- A name whose last segment is blank (`Trip — `) is left alone rather than
-- becoming a notebook with no name.
CREATE TABLE `__notebook_folders` AS
WITH RECURSIVE cut(id, folder, rest) AS (
	SELECT id, '', title FROM notebooks WHERE instr(title, ' — ') > 0
	UNION ALL
	SELECT
		id,
		folder || CASE WHEN folder = '' THEN '' ELSE '/' END || trim(substr(rest, 1, instr(rest, ' — ') - 1)),
		substr(rest, instr(rest, ' — ') + 3)
	FROM cut
	WHERE instr(rest, ' — ') > 0
)
SELECT id, folder, trim(rest) AS title
FROM cut
WHERE instr(rest, ' — ') = 0 AND trim(rest) <> '';
--> statement-breakpoint
UPDATE `notebooks`
SET
	`folder` = (SELECT f.folder FROM `__notebook_folders` f WHERE f.id = notebooks.id),
	`title` = (SELECT f.title FROM `__notebook_folders` f WHERE f.id = notebooks.id)
WHERE `id` IN (SELECT id FROM `__notebook_folders`);
--> statement-breakpoint
DROP TABLE `__notebook_folders`;
