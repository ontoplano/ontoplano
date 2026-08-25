#!/usr/bin/env bash
#
# Restore the database from its replica into a scratch directory, and prove the
# copy is a working database rather than a file of the right size.
#
# Run it on the machine that holds the replica. It never touches the live
# database: everything happens under a temporary directory it prints and then
# leaves behind for you to inspect.
#
#   scripts/restore-drill.sh                  # restore from the local replica
#   REPLICA=s3 scripts/restore-drill.sh       # restore from the offsite one
#
set -euo pipefail

CONFIG="${LITESTREAM_CONFIG:-$HOME/.config/litestream.yml}"
DB="${ONTOPLANO_DB_PATH:-$HOME/.local/share/ontoplano/ontoplano.db}"
REPLICA="${REPLICA:-file}"

command -v litestream >/dev/null || {
	echo "litestream is not installed. See docs/BACKUP.md." >&2
	exit 1
}

WORK="$(mktemp -d -t ontoplano-restore-XXXXXX)"
OUT="$WORK/restored.db"

echo "Config:   $CONFIG"
echo "Database: $DB"
echo "Replica:  $REPLICA"
echo "Restoring into $OUT"
echo

litestream restore -config "$CONFIG" -replica "$REPLICA" -o "$OUT" "$DB"

echo
echo "--- integrity"
sqlite3 "$OUT" 'PRAGMA integrity_check;'

echo "--- foreign keys (empty means none broken)"
sqlite3 "$OUT" 'PRAGMA foreign_key_check;'

echo "--- rows per table"
sqlite3 "$OUT" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" |
	while read -r table; do
		printf '%-24s %s\n' "$table" "$(sqlite3 "$OUT" "SELECT count(*) FROM \"$table\";")"
	done

echo
echo "Restored copy: $OUT"
echo "Boot the app against it before trusting it:"
echo "  DATABASE_URL=$OUT node build/index.js"
