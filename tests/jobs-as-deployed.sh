#!/usr/bin/env bash
#
# The scheduled jobs, run the way the server runs them.
#
#   ./tests/jobs-as-deployed.sh
#
# Three times in one evening a timer failed on the box and worked here, and each
# time the difference was something this checkout has and the deployed directory
# does not: node_modules at all, then a devDependency, then `.svelte-kit`, which
# is what tells `tsx` that `$lib` means `src/lib`. Reading the code cannot find
# these. Running it in the wrong directory can.
#
# So this builds the deployed directory — exactly the files `_ship-app` sends,
# and nothing else — and runs every job in it against a throwaway database.
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT=$PWD
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

blue=$'\033[34m'; red=$'\033[31m'; dim=$'\033[2m'; off=$'\033[0m'
[ -t 1 ] || { blue=; red=; dim=; off=; }
fails=0
ok()  { echo "  ${blue}✓${off} $1"; }
bad() { echo "  ${red}✗${off} $1"; fails=$((fails + 1)); }

# What the deploy puts there. Keep this list in step with `_ship-app` in
# ontoplano-server/deploy.mk — that is the point of the file, not a copy of it.
mkdir -p "$WORK/app/scripts"
cp -r "$ROOT/src" "$WORK/app/src"
find "$WORK/app/src" -name '*.test.ts' -delete
cp -r "$ROOT/drizzle" "$WORK/app/drizzle"
cp "$ROOT/package.json" "$ROOT/yarn.lock" "$WORK/app/"
cp "$ROOT/packaging/jobs.tsconfig.json" "$WORK/app/tsconfig.json"
JOBS=$(sed -n 's|.*npx tsx \(scripts/[a-z-]*\.ts\).*|\1|p' "$ROOT"/../ontoplano-server/systemd/*.service 2>/dev/null | sort -u)
[ -n "$JOBS" ] || JOBS="scripts/deliver-reminders.ts scripts/weekly-reviews.ts scripts/reconcile-billing.ts"
for job in $JOBS; do cp "$ROOT/$job" "$WORK/app/scripts/"; done

# The one thing not copied: a production install takes minutes, and what this
# test is about is the SHAPE of the directory rather than the contents of
# node_modules. `scripts/check-job-deps.mjs` is the half that reads the
# manifest; between them, both halves of "will it run there" are covered.
ln -s "$ROOT/node_modules" "$WORK/app/node_modules"

# A database of its own, pushed from the schema, so a job that reads one finds
# the tables it expects and nothing of anybody's.
export DATABASE_URL="$WORK/jobs.db"
export ONTOPLANO_CONFIG_DIR="$WORK/config"
mkdir -p "$ONTOPLANO_CONFIG_DIR"
(cd "$ROOT" && npx drizzle-kit push --force >/dev/null 2>&1) || {
	echo "${red}could not make the test database${off}"; exit 1; }

echo "The jobs, from a copy of what the deploy sends"
cd "$WORK/app" || exit 1
for job in $JOBS; do
	name=$(basename "$job")
	if out=$(npx tsx "$job" 2>&1); then
		ok "$name"
	else
		bad "$name"
		echo "$out" | grep -E 'Error|Cannot find' | head -3 | sed 's/^/      /'
	fi
done

echo
if [ "$fails" = 0 ]; then echo "${blue}all good${off}"; else echo "${red}$fails would fail on the box${off}"; exit 1; fi
