# Running ontoplano in Docker

One container, one volume, no database server. There is nothing else to run:
ontoplano is a Node process and a SQLite file, and everything it keeps lives
under `/data`.

## The short version

```sh
docker run -d --name ontoplano \
  -p 1493:1493 \
  -v ontoplano-data:/data \
  -e ORIGIN=https://plano.example.com \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  ontoplano/ontoplano:latest
```

Then open the address you gave as `ORIGIN`. The first account created is the
instance's administrator; after that, who may register is a setting.

## Or with compose

```sh
curl -O https://raw.githubusercontent.com/ontoplano/ontoplano/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/ontoplano/ontoplano/main/.env.example
# set ORIGIN and BETTER_AUTH_SECRET in .env
docker compose up -d
```

## The two settings that matter

**`ORIGIN`** is the address people type, exactly as it appears in the browser's
bar — scheme and all, no trailing slash. The app compares every form submission
against it, and that comparison is the whole of its CSRF defence. Get it wrong
and every form is refused with no explanation. Behind a reverse proxy this is
the _public_ address, not the container's.

**`BETTER_AUTH_SECRET`** signs sessions. Generate one with `openssl rand -base64
32`, keep it somewhere you will find it again, and know that changing it signs
everybody out. There is deliberately no default: a guessable one is every
account on the instance.

Everything else is optional. `docs/reference/configuration.md` is the full list, and
the settings a person chooses (week start, theme, what the dashboard shows) are
in the app rather than in the environment.

## Behind a reverse proxy

The container speaks plain HTTP on 1493 and expects something in front to
terminate TLS. Whatever that is has to pass the scheme through, or the app will
build `http://` links on an `https://` site:

```nginx
location / {
    proxy_pass http://127.0.0.1:1493;
    include /etc/nginx/proxy_params;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Caddy does this without being asked.

## Upgrading

```sh
docker compose pull && docker compose up -d
```

Migrations run when the container starts, and the container snapshots the
database into `/data` before applying any. There is no separate migration step
and nothing to remember — an image that needs one is an image somebody will
eventually pull without running it.

## Backing it up

Everything is in the one volume. The database is in WAL mode, so **copying
`ontoplano.db` while the container runs is not a backup** — the copy is missing
whatever has not been checkpointed yet. Either stop the container first, or use
SQLite's own backup:

```sh
docker exec ontoplano node -e "
  const db = require('better-sqlite3')(process.env.DATABASE_URL);
  db.backup('/data/backup.db').then(() => process.exit(0));
"
docker cp ontoplano:/data/backup.db ./ontoplano-backup.db
```

`docs/BACKUP.md` covers replication, which is the answer for a dead disk rather
than a bad afternoon.

## What is in the image

Debian slim, Node 22, the built app, `node_modules` without the build
toolchain, and the migrations. It runs as the `node` user, not as root — the
entrypoint starts as root only long enough to hand the volume over, because a
named volume is created root-owned and nothing else can fix that.

The compilers that build `better-sqlite3` are in an earlier build stage and do
not ship. `tini` is PID 1, so the container stops when it is asked to rather
than being killed ten seconds later mid-write.

## The jobs run themselves

The app needs two things asking it on a clock: reminders every minute, and the
weekly review mail every hour. On a bare install those are systemd timers; a
container has no systemd, so the entrypoint runs the clock itself and asks the
app's own job endpoints. Nothing to configure and nothing extra to run —
Settings → Instance shows both jobs and when they last asked.

The endpoints sit behind `ONTOPLANO_HEALTH_TOKEN`. If you set one, the
container's clock uses yours; if you set none, it mints a random one at start
that never leaves the container. Both jobs are safe to trigger twice, so
running your own timers against the container as well costs nothing.

---

## The image and what gets into it — if you fork this

Publishing the official image is the maintainer's job; the machinery for it
lives with the maintainer's private tooling, not in this repository. What is
public is the recipe: `make docker-image` builds exactly the image the project
publishes, for this machine's architecture, and a fork can push the result
under its own name with plain `docker push`.

Two guarantees the build enforces, because a published image is permanent,
public, and readable layer by layer:

- **`.dockerignore` is an allowlist**, and it has to stay one. The first rule
  is `*` — everything excluded — and the build's inputs are named back in. A
  list of exclusions fails open: anything added to the checkout later ships
  until somebody remembers to exclude it. `make docker-image` refuses to build
  if that first rule changes, and then opens the image it built and refuses it
  if anything unexpected is inside.
- The version in `package.json` is the tag. Bump it in the same commit as the
  work, as always — a second push of the same version overwrites a tag people
  may already be pinning.
