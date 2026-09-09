-- What an assistant did, kept where the person can read it.
--
-- Every MCP write already answers with the state it replaced, but that answer
-- goes to whoever holds the transcript — and the person whose data it is has
-- no transcript. This is their copy: one row per write, with the `before` the
-- protocol layer read, so a bad call can be seen and, when it deleted
-- something, put back.
--
-- token_id names the api_tokens row without a foreign key on purpose: tokens
-- are revoked rather than deleted today, and the log must outlive whatever
-- happens to the credential that wrote it.

CREATE TABLE assistant_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token_id INTEGER,
  tool TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '{}',
  before TEXT,
  destroyed INTEGER NOT NULL DEFAULT 0,
  restored_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX assistant_calls_user_idx ON assistant_calls(user_id, id);
