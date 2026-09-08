-- Reminders that can make a noise, and a place to keep the noises.
--
-- A notification you have to be looking at is not a reminder, and one that
-- always makes a sound is one you turn off. So sound is a choice: every
-- reminder shows, and only the ones you asked to hear play anything.
--
-- Ringtones are stored as rows rather than files on disk: this app is one
-- process and one sqlite file, and a backup that restores the database and not
-- somebody's uploads is a backup that lies. Ten of them, 300 KB each, is 3 MB
-- an account at the very worst.

CREATE TABLE ringtones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX ringtones_user_idx ON ringtones (user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX ringtones_user_name_unique ON ringtones (user_id, name);
--> statement-breakpoint

-- What each kind of reminder sounds like. A row per kind per account; no row
-- means silent, which is what every account starts as.
CREATE TABLE reminder_sounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id),
  kind TEXT NOT NULL,
  -- Null with audible=1 is the ringtone that ships with the app.
  ringtone_id INTEGER REFERENCES ringtones(id) ON DELETE SET NULL,
  audible INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX reminder_sounds_user_kind_unique ON reminder_sounds (user_id, kind);
--> statement-breakpoint

-- A single reminder can override its kind: an alarm for one morning is audible
-- whatever the rest of that kind does.
ALTER TABLE reminders ADD COLUMN audible INTEGER;
--> statement-breakpoint
ALTER TABLE reminders ADD COLUMN ringtone_id INTEGER REFERENCES ringtones(id) ON DELETE SET NULL;
--> statement-breakpoint

-- The index the clock reads: the earliest thing not yet sent, per account.
CREATE INDEX reminders_pending_idx ON reminders (user_id, pushed_at, remind_at);
