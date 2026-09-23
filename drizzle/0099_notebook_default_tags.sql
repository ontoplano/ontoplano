-- The labels a new note in a notebook starts with.
--
-- Text rather than rows in `diary_tags`: this is not a tagging of anything, it
-- is what the next tagging starts from, so it holds the words somebody typed
-- and a tag renamed elsewhere leaves it alone.
ALTER TABLE `notebooks` ADD `default_tags` text DEFAULT '' NOT NULL;
