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

Everything else is optional. `docs/wiki/configuration.md` is the full list, and
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

---

## Publishing it — for whoever maintains this

Only the project does this; skip it if you are running an instance.

**The first time.** Make a [Docker Hub](https://hub.docker.com) account, then an
organisation or a repository named `ontoplano/ontoplano`. Under **Account
settings → Personal access tokens**, make a token with _Read, Write, Delete_ and
keep it — the password itself should never be typed into a terminal. Then, once
per machine:

```sh
docker login -u <username>
# paste the ACCESS TOKEN, not the password
```

The login is stored in `~/.docker/config.json`, base64-encoded rather than
encrypted, so on a shared machine use a credential helper.

**Every release:**

```sh
make docker-publish
```

That builds for `linux/amd64` and `linux/arm64` and pushes two tags: the version
in `package.json`, and `latest`. arm64 is not decoration — the cheap boxes people
self-host on are increasingly Ampere, and a Raspberry Pi is the commonest single
thing this runs on. Building it on an x86 machine goes through emulation, so it
is slow the first time and cached after.

It needs `docker buildx`, which ships with Docker Desktop and comes from the
`docker-buildx-plugin` package on Linux. To publish somewhere else — a fork, or
a private registry — override the name:

```sh
make docker-publish IMAGE=ghcr.io/you/ontoplano
```

**Two things to check before the first push:**

- **`.dockerignore` is an allowlist**, and it has to stay one. The first rule is
  `*` — everything excluded — and the build's inputs are named back in. A list
  of exclusions fails open: anything added to the checkout later ships until
  somebody remembers to exclude it, and a published image is a permanent,
  public, layer-by-layer copy of whatever the build could see. `make
docker-image` refuses to build if that first rule changes, and then opens the
  image it built and refuses to publish if anything unexpected is inside it.
- The version in `package.json` is the tag. Bump it in the same commit as the
  work, as always — a second push of the same version overwrites a tag people
  may already be pinning.
