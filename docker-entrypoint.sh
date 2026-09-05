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

# The companion jobs, run by the container itself. On a bare install these are
# systemd timers asking the app's job endpoints; a container has no systemd, so
# an image that shipped without this was an instance that never reminded anyone
# of anything and never sent the Monday mail — and nothing anywhere said so.
#
# The endpoints are gated by the health token. When the operator has not set
# one, a random token is minted here and exported before the app starts, so
# the loop and the app agree on it and nothing outside the container learns it.
# Both jobs are safe to ask twice, so an operator who also runs their own
# timers loses nothing.
if [ -z "${ONTOPLANO_HEALTH_TOKEN}" ]; then
	ONTOPLANO_HEALTH_TOKEN="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
	export ONTOPLANO_HEALTH_TOKEN
fi

ask_job() {
	# Quiet when it works: the instance page's companions card reads the stamp
	# these calls leave, so silence in the log is distinguishable from broken.
	node -e '
		const [port, job] = process.argv.slice(1);
		fetch(`http://127.0.0.1:${port}/api/jobs/${job}`, {
			method: "POST",
			headers: { "x-health-token": process.env.ONTOPLANO_HEALTH_TOKEN }
		}).then(async (res) => {
			if (!res.ok) console.error(`ontoplano: jobs/${job} answered ${res.status}`);
			else {
				const body = await res.json();
				if (body.pushed || body.sent) console.log(`ontoplano: jobs/${job}`, JSON.stringify(body));
			}
		}).catch((error) => console.error(`ontoplano: jobs/${job}: ${error}`));
	' "${PORT:-1493}" "$1"
}

(
	sleep 15
	tick=0
	while :; do
		ask_job reminders
		# Hourly, on the loop's own clock — sendWeeklyReviews stores the week it
		# last wrote about per account, so an extra ask costs one cheap read.
		[ $((tick % 60)) -eq 0 ] && ask_job weekly-reviews
		tick=$((tick + 1))
		sleep 60
	done
) &

exec "$@"
