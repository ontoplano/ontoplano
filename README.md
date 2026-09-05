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
> This product was released on September 5th, 2026. It's still experimental, and
> it may contain bugs. Please be patient, and help me improve it by making pull
> requests.

---

Ontoplano is a life management app built around planning your week. Besides planning
recurring or one-off tasks,  stuff on a to-do backlog, you can also write
**Notebooks** (notebooks and a diary), register goals with measured progress, habits,
ideas, the people in your life, recipes and the shopping list they feed. Every
section can be turned off, reordered and recoloured. Full tour:
[docs.ontoplano.com](https://docs.ontoplano.com).

**MCP built in.** `/api/mcp` is a Model Context Protocol server: any AI with MCP
capabilities can read your day and change it, with a scoped token you can revoke.
Nothing in the app calls a model; you bring your own assistant.

**Two ways to run it.** Self-host it or on [app.ontoplano.com](https://app.ontoplano.com), the same software on a box I
keep.

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


Register at `/login` — **the first account owns the instance**, and after it
registration is closed until changed at `/settings/instance`.

>>> explain here that no weekly mails included. No more than 150 chars for that.

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
`yarn docs`.

## Deploying it

From source on the machine you are sitting at:

```sh
# ~/.config/ontoplano/env
ORIGIN=https://ontoplano.example.com   # must be the public origin, or CSRF rejects every form
BETTER_AUTH_SECRET=…                   # openssl rand -base64 32

make install-service   # build, migrate, install the service and its timers
make deploy-local      # the build-and-copy step alone, no service touched
make update            # after a git pull: rebuild, redeploy, restart
>>> This is confusing, does it git pull? If no, why would it expect it? If yes, just name it as the other shit: git pull, rebuild, redeploy. Anyways, delete this command enitrely, deploy-local simply should restart the process too
```

Keep it on `127.0.0.1` behind a reverse proxy that terminates TLS, and point
something at `/healthz`.
[`docs/reference/configuration.md`](docs/reference/configuration.md) is the
full list of settings, `docs/BACKUP.md` covers backups, `docs/ANDROID.md` the
phone.

Signing in is an address and a password; there is no "continue with Google".
Email is optional — without SMTP settings, confirmation and reset links are
written to the server log instead of sent.
