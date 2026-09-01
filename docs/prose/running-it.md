<!-- title: Running it yourself -->
<!-- blurb: what it needs, three ways to start it, and where your data lives -->

# Running it yourself

Ontoplano is one Node process and one SQLite file. There is no database server
to run, no queue, no cache, and nothing that phones anywhere. A $5 VPS is
oversized for one person.

**Self-hosting is the whole app.** Every feature, no ceilings, no licence key,
permanently. What the hosted instance sells is somebody else doing the
upgrades and the backups.

## What it needs

- **Node 20 or newer**, and `yarn`.
- A machine that can build it once. `vite build` wants more than a gigabyte of
  memory — on a small VPS, build somewhere else and copy the output over.
- Optionally: a reverse proxy for TLS, and an SMTP account if you want
  confirmation and password-reset mail. Without one those links are written to
  the log instead, which is fine for one person.

## The quickest start: Docker

One container, one volume, no database server. Migrations run when it starts,
so there is no first-run step.

```sh
docker run -d --name ontoplano -p 1493:1493 \
  -v ontoplano-data:/data \
  -e ORIGIN=http://localhost:1493 \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  ontoplano/ontoplano:latest
```

Or with compose, which is the same thing written down:

```sh
curl -O https://raw.githubusercontent.com/ontoplano/ontoplano/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/ontoplano/ontoplano/main/.env.example
# set ORIGIN and BETTER_AUTH_SECRET in .env
docker compose up -d
```

Register at `/login`. The first account is always allowed and owns the
instance; the first screen asks for your timezone and which day your week
starts, and offers a starter week to argue with.

[docs/DOCKER.md](https://github.com/ontoplano/ontoplano/blob/main/docs/DOCKER.md)
has the reverse proxy, upgrading and backups.

## From the source

```sh
git clone https://github.com/ontoplano/ontoplano.git
cd ontoplano
yarn
cp .env.example .env      # set ORIGIN and BETTER_AUTH_SECRET
yarn db:migrate           # create the database
yarn dev                  # http://localhost:1493
```

## As a service

For a box you keep, without Docker:

```sh
make install-service      # build, migrate, install and start a systemd user unit
make update               # after a git pull: rebuild, migrate, restart
```

The unit runs as your own user, keeps running after logout, and snapshots the
database before every migration.

## Where your data lives

Nothing is inside the repository, and everything is created on first run.

| Path                                    | What                                                |
| --------------------------------------- | --------------------------------------------------- |
| `~/.local/share/ontoplano/ontoplano.db` | the database — this one file is your data           |
| `~/.config/ontoplano/config.toml`       | bind address, port, database path, who may register |
| `~/.config/ontoplano/env`               | `ORIGIN`, `BETTER_AUTH_SECRET`, SMTP, backups       |

Back up the first one and you have backed up everything. `sqlite3 … .backup` or
a file copy while the process is stopped both work; there is a Litestream setup
in `docs/BACKUP.md` for continuous replication.

## Who may register

**Closed by default.** The first account is always allowed — it is the one that
owns the instance — and after that `/settings/instance` decides: closed, by
invitation, or open. An invitation is a code that works once, and that page
makes and revokes them.

An instance on the open internet with sign-up left open is one that somebody
else will use.
