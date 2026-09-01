#!/bin/sh
# What has to be true before the app starts.
#
# The migration runs here rather than in a step somebody has to remember: an
# image that needs `docker exec … migrate` after every pull is an image that
# will one day be pulled by somebody who does not, and a schema behind its code
# fails at the first request rather than at start. A fresh volume gets the
# schema the same way, so there is no separate "first run".
set -e

# A named volume is created root-owned, and only root can fix that — so the
# container starts as root, this repairs the volume, and everything after the
# `gosu` runs as `node`. The second pass takes the branch below.
if [ "$(id -u)" = '0' ]; then
	mkdir -p /data /data/config
	chown -R node:node /data
	exec gosu node "$0" "$@"
fi

# The secret is the one value with no safe default: without it, sessions are
# signed with something guessable and every account on the instance is open.
# Checked before the migration, so a missing one costs nothing.
if [ -z "${BETTER_AUTH_SECRET}" ]; then
	echo "ontoplano: BETTER_AUTH_SECRET is not set." >&2
	echo "  Generate one and keep it — changing it signs everybody out:" >&2
	echo "    openssl rand -base64 32" >&2
	exit 1
fi

echo "ontoplano: applying migrations to ${DATABASE_URL}"
node scripts/migrate.mjs

exec "$@"
