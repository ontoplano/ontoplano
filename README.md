<div align="center">

<img src="static/icons/icon-192.png" alt="" width="112" height="112">

# Ontoplano

**Managing life, one week at a time.**

[![checks](https://github.com/ontoplano/ontoplano/actions/workflows/ci.yml/badge.svg)](https://github.com/ontoplano/ontoplano/actions/workflows/ci.yml)
[![latest release](https://img.shields.io/github/v/release/ontoplano/ontoplano?label=release&color=1f6feb)](https://github.com/ontoplano/ontoplano/releases/latest)
[![licence AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-1f6feb)](LICENSE)
[![self-hosted](https://img.shields.io/badge/host%20it-yourself-1f6feb)](#running-it)

**[ontoplano.com](https://ontoplano.com) · [make an account](https://app.ontoplano.com) · [try the demo](https://demo.ontoplano.com) · [documentation](https://docs.ontoplano.com)**

`.deb` · `.rpm` · AUR · Docker · Android

</div>

> [!WARNING]
> This product was released on September 4th, 2026. It's still experimental, and
> it may contain bugs. Please be patient, and help me improve it by making pull
> requests.

---

Everything you are keeping track of, in one place, on one week. It started as a
weekly planner and the week is still the shape — what goes on it is the rest of
a life.

You describe the week you intend to have; Ontoplano turns it into the days as
they arrive and records what actually happened. Around that sit the other
rooms: **Tasks** (the plan, today's board, the weekly review), **Notebooks**
(your notebooks, and a diary), goals with real progress, the people in your life,
habits, ideas, recipes and the shopping that follows from them. Use the parts
you want — every section can be switched off, reordered and recoloured. The
full tour is at [docs.ontoplano.com](https://docs.ontoplano.com).

**Ask it in words.** `/api/mcp` is a Model Context Protocol server, so Claude —
or anything else that speaks MCP — can read your day and change it, with your
token and your scopes. Nothing in the app calls a model; the assistant is yours
and it comes to the app, not the other way round.

**Two ways to have it.** Run your own copy — one SQLite file, one process, no
account anywhere but your own, and no payment provider in this repository
(`docs/PLANS.md` explains the seam). Or make an account on
[app.ontoplano.com](https://app.ontoplano.com), which is the same software on a
box I keep, if you would rather not keep one.

## Running it

On a machine you keep — a service that starts on boot, upgraded by the package
manager you already use:

```sh
# Debian, Ubuntu, Mint, Pop!_OS
sudo apt install ./ontoplano_amd64.deb

# Fedora, RHEL, openSUSE
sudo dnf install ./ontoplano.x86_64.rpm

# Arch, Manjaro
yay -S ontoplano
```

then `sudo ontoplano config` to set the origin and
`sudo systemctl enable --now ontoplano`. The `.deb` and the `.rpm` are on the
[releases page](https://github.com/ontoplano/ontoplano/releases); they carry
their own Node, so there is nothing else to install. A packaged install keeps
its settings in `/etc/ontoplano/` and its database in `/var/lib/ontoplano/`.
There is no Windows installer yet — [help build one](CONTRIBUTING.md).

Or with Docker, which needs nothing but Docker:

```sh
docker run -d --name ontoplano -p 1493:1493 \
  -v ontoplano-data:/data \
  -e ORIGIN=http://localhost:1493 \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  ontoplano/ontoplano:latest
```

One container, one volume, no database server — migrations run when it starts,
and the container runs its own scheduled jobs. `docs/DOCKER.md` has the reverse
proxy, the upgrade and the backup.

Register at `/login` — **the first account owns the instance**, and after it
registration is closed until `/settings/instance` says otherwise: closed, by
invitation, or open.

**The app is not the whole deployment.** Reminders and the Monday review mail
are asked of the app by two small timers. The packages install them, the Docker
image runs them itself, and `make install-service` sets them up for a
from-source install; Settings → Instance shows whether they are running and
how to fix them when not.

## Developing it

```sh
yarn
make dev        # dev server at http://localhost:1493, as a systemd user service
make dev-logs   # follow it; make dev-stop stops it; make dev-fg holds the terminal
make db-seed    # synthetic data for the dev account
```

Bare `make` prints every target; `make vars` every variable a command line can
carry. `make dev` wants Linux with systemd — on anything else, `yarn dev` runs
the same server in the foreground. A from-source instance keeps its settings in
`~/.config/ontoplano/` and its database in `~/.local/share/ontoplano/`.

Before a pull request: `make lint`, `yarn test:unit`, `make test` (the
Playwright suite). `CONTRIBUTING.md` has the conventions that are not obvious
from the code, and the reasons for them.

**[`docs/reference/`](docs/reference/) is how the app works, generated from
the app** — every table, endpoint, service and keyboard shortcut, rebuilt by
`yarn docs` and checked by `make lint` so it cannot quietly stop being true.
Press `?` on any page of the running app for that page's shortcuts.

## Deploying it

From source on the machine you are sitting at:

```sh
# ~/.config/ontoplano/env
ORIGIN=https://ontoplano.example.com   # must be the public origin, or CSRF rejects every form
BETTER_AUTH_SECRET=…                   # openssl rand -base64 32

make install-service   # build, migrate, install the service and its timers
make update            # after a git pull: rebuild, redeploy, restart
make deploy-local      # the build-and-copy step alone, no service touched
```

Keep it on `127.0.0.1` behind a reverse proxy that terminates TLS, and point
something at `/healthz`. Every shipped install says `ONTOPLANO_SELF_HOST=true`
for itself, which means no trials, no ceilings and no billing anywhere — the
hosted instance is the one that declares otherwise.
[`docs/reference/configuration.md`](docs/reference/configuration.md) is the
full list of settings, `docs/BACKUP.md` the backup story, `docs/ANDROID.md`
the phone.

Signing in is an address and a password; there is no "continue with Google".
Email is optional — without SMTP settings, confirmation and reset links are
written to the server log instead of sent.

## Stack

SvelteKit · Svelte 5 (runes) · SQLite via Drizzle · better-auth · Tailwind CSS v4
· adapter-node

## Licence

[AGPL-3.0-or-later](LICENSE). Run it, change it, host it — if you host a
modified version for other people, they get the source too.

The licence covers the code. It does not hand over the project's name: call
your fork something of your own, and say plainly what it is built on.
