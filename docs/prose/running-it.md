<!-- title: Running it yourself -->
<!-- blurb: what it needs, four ways to start it, and where your data lives -->

# Running it yourself

Ontoplano is a Node process and a SQLite file. There is no database server, no
queue and no cache to run beside it.

It reaches the network in three places, and you decide on all three: SMTP, if
you want confirmation and password-reset mail; the browser vendor's push
service, which is how a reminder arrives on a phone with the app closed; and
whatever calendar feed or webhook address you type into it yourself. There is
no telemetry, no licence check and no update ping.

## What it needs

| Route          | What has to be there                                              |
| -------------- | ----------------------------------------------------------------- |
| `.deb`, `.rpm` | Linux with systemd. The Node runtime is inside the package.       |
| AUR            | Linux with systemd, and the distribution's `nodejs`, 20 or newer. |
| Docker         | Docker. Nothing else — no systemd, no Node on the host.           |
| From source    | Node 22 and yarn.                                                 |

Optional on any of them: a reverse proxy, which is where TLS belongs, and an
SMTP account. Without SMTP, confirmation and password-reset links are written
to the log instead.

Building it yourself wants memory — `make build` gives Node a 2GB heap, and
`vite build` uses most of it. On a VPS with less, build on another machine and
copy `build/` across.

## The quickest start: a package

One command, a service that starts on boot, and upgrades through the package
manager you already use.

<!-- generated: downloads -->

Then, on any of them:

```sh
sudo ontoplano config                        # set ORIGIN to the address you will type
sudo systemctl enable --now ontoplano
```

That is the whole installation. It listens on `127.0.0.1:1493`, so nothing off
the machine reaches it until you put a reverse proxy in front, which is where
TLS belongs.

### What the package sets up

| What                              | Where                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| `ontoplano`                       | a system account with no shell and no password, which the service runs as |
| `/etc/ontoplano/ontoplano.env`    | your settings — the origin, mail, who may register                        |
| `/etc/ontoplano/secret.env`       | the session secret, generated once on install                             |
| `/var/lib/ontoplano/ontoplano.db` | the database. **This file is your data.**                                 |
| `ontoplano.service`               | a system unit, enabled by you, restarted on failure                       |

It is a system service rather than a user one because a user service stops at
logout unless lingering is enabled, and a package cannot enable one on
anybody's behalf. The service account reaches `/var/lib/ontoplano` and nothing
else on the machine; `systemctl cat ontoplano` shows the restrictions. On a
machine you develop on, a user unit is the right answer, and that is what
`make install-service` sets up.

Upgrading is `apt install ./ontoplano_amd64.deb` again, or `yay -Syu`. The
database is migrated before the new version starts, your settings file is left
as you edited it, and the session secret is not regenerated, so everybody stays
signed in.

Removing the package leaves `/var/lib/ontoplano` behind, because it is your
data rather than the package's. `apt purge ontoplano` takes it too.

### The commands it installs

```sh
ontoplano status                # is it running, and since when
ontoplano start|stop|restart
ontoplano logs                  # follow the journal
sudo ontoplano config           # open the settings file
sudo ontoplano migrate          # bring the database up to the installed version
ontoplano version
```

### Why the .deb and the .rpm are large

They carry their own Node, which is most of their size. The database driver is
a native module compiled against one Node ABI, and these distributions ship
several Node versions between them — a package built against one of them would
install cleanly everywhere and start nowhere. The Arch package bundles nothing,
because it is built on the machine that will run it.

## Or with Docker

One container, one volume. Migrations run at startup, so there is no first-run
step.

```sh
docker run -d --name ontoplano -p 1493:1493 \
  -v ontoplano-data:/data \
  -e ORIGIN=http://localhost:1493 \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  ontoplano/ontoplano:latest
```

Or with compose:

```sh
curl -O https://raw.githubusercontent.com/ontoplano/ontoplano/master/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/ontoplano/ontoplano/master/.env.example
# set ORIGIN and BETTER_AUTH_SECRET in .env
docker compose up -d
```

[docs/DOCKER.md](https://github.com/ontoplano/ontoplano/blob/master/docs/DOCKER.md)
has the reverse proxy, upgrading and backups.

## On Windows

There is no Windows installer yet: no MSI, no winget package, no service
wrapper. Docker Desktop works, and so does WSL2 — inside WSL the `.deb` above
installs as it does on Ubuntu, which is the shortest route from Windows today.

An installer is a self-contained piece of work if you want to write one: the
app is a Node process and a SQLite file, so what is missing is the packaging
around it.
[CONTRIBUTING.md](https://github.com/ontoplano/ontoplano/blob/master/CONTRIBUTING.md)
says how the repository works.

## From the source

```sh
git clone https://github.com/ontoplano/ontoplano.git
cd ontoplano
yarn
cp .env.example .env      # set ORIGIN and BETTER_AUTH_SECRET
yarn db:migrate           # create the database
yarn dev                  # http://localhost:1493
```

For a box you keep, without Docker:

```sh
make install-service      # build, migrate, install and start a systemd user unit
make deploy-local         # after changes: rebuild, migrate, redeploy, restart
```

That unit runs as your own user, keeps running after logout, and snapshots the
database before every migration.

## The first account

Register at `/login`. The first account is allowed whatever the registration
setting says, and it owns the instance. The first screen asks for your timezone
and which day your week starts on, and offers a starter week.

## Who may register

**Closed by default.** After the first account, `/settings/instance` decides:
closed, by invitation, or open. An invitation is a code that works once, and
that page makes and revokes them. Keep it closed or on invitation for an
instance reachable from the internet.

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

Back up the first one and you have backed up everything. `sqlite3 … .backup`
works on a running instance, a file copy works while it is stopped, and
`docs/BACKUP.md` has a Litestream setup for continuous replication.

## The two jobs

Settings → Instance lists both and when each last ran.

**Reminders.** The app keeps its own timer, so a reminder fires on the second
with nothing else installed. The packages and `make install-service` also
install a minute timer that asks `/api/jobs/reminders`; it covers the case
where the app was restarted across the moment a reminder fell due. The Docker
image makes the same request from inside the container.

**The weekly review mail.** On Monday, one message saying how much of last week
you planned and did, linking to `/tasks/review`. It goes to accounts with a
confirmed address, and every message carries a link that turns it off without
signing in. It needs SMTP, so it is not installed by default: from source,
`make install-mail-service`; on a packaged install, your own timer or cron
line, with `systemd/ontoplano-weekly-review.service` as the template. The
Docker image asks for it already.

Anything that can make an hourly HTTP request will do — the timers only ask the
app's own endpoint:

```
5 * * * * curl -fsS -m 30 -X POST -H "x-health-token: $ONTOPLANO_HEALTH_TOKEN" http://127.0.0.1:1493/api/jobs/weekly-reviews
```

Hourly rather than daily because each account is checked against its own
timezone, and seven in the morning is a different instant for each of them.
Asking twice in an hour is safe.
