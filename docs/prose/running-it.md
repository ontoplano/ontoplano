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

- **A machine running systemd**, which every distribution below does. From a
  package, that is all: the runtime comes with it.
- **Node 20 or newer**, and `yarn`, to build it yourself.
- A machine that can build it once. `vite build` wants more than a gigabyte of
  memory — on a small VPS, build somewhere else and copy the output over.
- Optionally: a reverse proxy for TLS, and an SMTP account if you want
  confirmation and password-reset mail. Without one those links are written to
  the log instead, which is fine for one person.

## The quickest start: a package

For a machine you keep, this is the shortest route: one command, a service that
starts on boot, and upgrades through the package manager you already use.

**Debian, Ubuntu, Mint, Pop!\_OS, Raspberry Pi OS**

```sh
curl -LO https://github.com/ontoplano/ontoplano/releases/latest/download/ontoplano_amd64.deb
sudo apt install ./ontoplano_amd64.deb
```

**Fedora, RHEL and its rebuilds, openSUSE**

```sh
curl -LO https://github.com/ontoplano/ontoplano/releases/latest/download/ontoplano.x86_64.rpm
sudo dnf install ./ontoplano.x86_64.rpm     # or: sudo zypper install ./ontoplano.x86_64.rpm
```

**Arch, Manjaro, EndeavourOS** — from the AUR, built on your machine:

```sh
yay -S ontoplano       # or: paru -S ontoplano
```

Then, on any of them:

```sh
sudo ontoplano config                        # set ORIGIN to the address you will type
sudo systemctl enable --now ontoplano
```

That is the whole installation. It listens on `127.0.0.1:1493` and is not
reachable from anywhere else until you put a reverse proxy in front of it —
which is where TLS belongs.

### What the package sets up

| What                              | Where                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| `ontoplano`                       | a system account with no shell and no password, which the service runs as |
| `/etc/ontoplano/ontoplano.env`    | your settings — the origin, mail, who may register                        |
| `/etc/ontoplano/secret.env`       | the session secret, generated once on install                             |
| `/var/lib/ontoplano/ontoplano.db` | the database. **This file is your data.**                                 |
| `ontoplano.service`               | a system unit, enabled by you, restarted on failure                       |

A **system** service rather than a user one, deliberately. A user service only
runs while that user is logged in unless lingering is enabled for them, cannot
be enabled by a package on anybody's behalf, and gives the app the run of your
home directory. The service account here owns exactly one directory and can
reach nothing else on the machine — `systemctl cat ontoplano` shows what it is
allowed to do. A user unit is still the right answer for a machine you develop
on, which is what `make install-service` sets up.

Upgrading is `apt install ./ontoplano_amd64.deb` again, or `yay -Syu`. The
database is migrated before the new version starts, your settings file is left
exactly as you edited it, and the session secret is never regenerated —
everybody stays signed in.

Removing the package leaves `/var/lib/ontoplano` behind. It is your data, not
the package's; `apt purge ontoplano` is the word that means take it too.

### The commands it installs

```sh
ontoplano status        # is it running, and since when
ontoplano logs          # follow the journal
sudo ontoplano config   # open the settings file
sudo ontoplano migrate  # bring the database up to the installed version
ontoplano version
```

### Why the .deb and the .rpm are 45MB

They carry their own Node. The database driver is a native module compiled
against one Node ABI, and these distributions ship four different Node versions
between them — a package built against one of them would install cleanly
everywhere and start nowhere. The Arch package does not bundle anything,
because it is built on the machine that will run it.

## Or with Docker

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
curl -O https://raw.githubusercontent.com/ontoplano/ontoplano/master/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/ontoplano/ontoplano/master/.env.example
# set ORIGIN and BETTER_AUTH_SECRET in .env
docker compose up -d
```

Register at `/login`. The first account is always allowed and owns the
instance; the first screen asks for your timezone and which day your week
starts, and offers a starter week to argue with.

[docs/DOCKER.md](https://github.com/ontoplano/ontoplano/blob/master/docs/DOCKER.md)
has the reverse proxy, upgrading and backups.

## On Windows

**There is no Windows installer yet.** Windows is the one platform here with
nothing to point at: no MSI, no winget package, no service wrapper.

Docker Desktop works today, and so does WSL2 — inside WSL the `.deb` above
installs exactly as it does on Ubuntu, which is the shortest route if you are on
Windows right now.

A proper installer is a good first contribution, and an unusually
self-contained one: the app itself is one Node process and one SQLite file, so
what is missing is the packaging around it — an MSI or a winget manifest, a
service registration, and somewhere sensible to put the database. If you want to
build it, [CONTRIBUTING.md](https://github.com/ontoplano/ontoplano/blob/master/CONTRIBUTING.md)
says how the repository works and how to send it, and opening an issue first is
welcome so nobody does the same work twice.

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

Installed from a package, the same three live under the system paths instead —
`/var/lib/ontoplano/ontoplano.db`, and `/etc/ontoplano/` for both config files.
Docker puts all of them in the volume mounted at `/data`.

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

## The weekly review, by mail

On Monday morning ontoplano can send one message saying what last week was:
how much of what you planned you did, where most of it went, and what is still
sitting there unanswered. It links to `/tasks/review`, which is where you do
something about a week.

It is on for an account whose address has been confirmed, and every message
carries a link that turns it off in one click with nothing to sign in to.
Nobody is written to about a week they did not plan, and nobody is written to
twice — the week last written about is remembered per account.

Nothing is sent unless the instance has SMTP configured, so a self-hosted
install with no mail transport is simply an install with no Monday mail.

**It needs something to run it.** The app has no scheduler of its own — but
every shipped install brings one: the `.deb` and `.rpm` install an
`ontoplano-weekly-review.timer` beside the service, the Docker image runs the
clock itself, and `make install-service` sets the timer up for a from-source
install. The same is true of reminders, which are asked for every minute.
Settings → Instance shows both jobs and when they last ran.

Anything else that can make an hourly HTTP request works too — the timers are
only asking the app's own endpoint:

```
5 * * * * curl -fsS -m 30 -X POST -H "x-health-token: $ONTOPLANO_HEALTH_TOKEN" http://127.0.0.1:1493/api/jobs/weekly-reviews
```

Hourly rather than daily because the hour belongs to the account: seven in the
morning is a different instant for everybody, and each account is checked
against its own timezone. Twenty-three of those runs do nothing, and running it
twice is safe.
