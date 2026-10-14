<div align="center">

<img src="static/icons/icon-192.png" alt="" width="112" height="112">

# Ontoplano

**One life, one app.**

[![checks](https://github.com/ontoplano/ontoplano/actions/workflows/ci.yml/badge.svg)](https://github.com/ontoplano/ontoplano/actions/workflows/ci.yml)
[![release](.github/badges/release.svg)](https://github.com/ontoplano/ontoplano/releases/latest)
[![licence AGPL-3.0](.github/badges/licence.svg)](LICENSE)
[![host it yourself](.github/badges/host-it.svg)](#running-it)

[demo](https://demo.ontoplano.com) · [ontoplano.com](https://ontoplano.com) · [official instance](https://app.ontoplano.com) · [documentation](https://docs.ontoplano.com)

`.deb` · `.rpm` · Arch · Docker · Android

<a href="https://play.google.com/store/apps/details?id=app.ontoplano"><img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" height="80"></a>

[Screenshots](docs/SCREENSHOTS.md)

</div>

## Why Ontoplano?

Most people run their life across a stack of separate apps: a calendar, a
to-do list, a notes app, a habit tracker, a budget spreadsheet, a shopping
list, a recipe box, a journal. Each one is fine on its own, but none of them
knows about the others — the task is in one, the notes for it in another, the
money for it in a third — and keeping them in step is work nobody signed up
for.

Ontoplano puts them in one app, with one way of doing things across all of
them. A subject you are working through — a renovation, a trip, a book — is a
notebook that holds its own tasks, notes, shopping, bills and goals, so
everything about it is in one place. Adding something takes one gesture on
your phone; the rest is there when you want the detail. It runs on the web,
on Android and offline, on the official instance or on your own machine, and
it is open source. It is meant for people who want one consistent place for
their life without handing it over to someone else.

To understand the values guiding it, read [the ethos](https://docs.ontoplano.com/ethos).

## What it includes

- **Planning** — a week calendar of repeating and one-off blocks, a board for
  the day, tasks without a date until you give them one, reminders that ring
  with the app shut, a weekly review, and goals whose progress counts itself
  from the tasks linked to them.
- **Notebooks** — notes per subject, in folders, as a list or as cards; a
  diary, weekly notes, ideas, and the people in your life with their
  birthdays and every mention of them; one tag vocabulary across everything.
- **Home and health** — an inventory with places, quantities and restocking,
  the shopping list it feeds, recipes made of the things you keep, habits,
  and workouts with a register per exercise.
- **Money** — ledgers, statement import with sorting rules, bills paid
  straight from a movement, and insights.
- **Getting things in** — a one-gesture capture wheel, keyboard shortcuts on
  every screen, search across everything, data streams posted by other apps,
  a calendar feed, webhooks, and an Android app.
- **AI, if you want it** — an MCP server with scoped keys, including keys
  tied to a single notebook, so an assistant works on exactly what you hand it
  ([how](https://docs.ontoplano.com/ai-agents)).
- **Yours** — export and import with pictures, delete everything, host it
  yourself or keep it on your phone alone, six languages, AGPL-3.0.

<div align="center">

[![Try the demo](.github/badges/try-the-demo.svg)](https://demo.ontoplano.com)

</div>


## Running it

A local instance keeps its settings in
`~/.config/ontoplano/` and its database in `~/.local/share/ontoplano/`.

```sh
git clone https://github.com/ontoplano/ontoplano && \
cd ontoplano && \
yarn && \
yarn dev             # dev server at http://localhost:1493
```

Optionally:

```sh
make db-seed    # synthetic data for the dev account
```

### Systemd

```sh
make install-service
```

### Docker

```sh
docker run -d --name ontoplano -p 1493:1493 \
  -v ontoplano-data:/data \
  -e ORIGIN=http://localhost:1493 \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  ontoplano/ontoplano:latest
```

Register at `/login` — **the first account owns the instance**, and after it
registration is closed until changed at `/settings/instance`.

The reminders timer comes installed.

### Binaries

```sh
# Debian, Ubuntu, Mint, Pop!_OS
sudo apt install ./ontoplano_*_amd64.deb

# Fedora, RHEL, openSUSE
sudo dnf install ./ontoplano-*.x86_64.rpm

# Arch, Manjaro (not on the AUR yet)
mkdir ontoplano && cd ontoplano
curl -LO https://github.com/ontoplano/ontoplano/releases/latest/download/PKGBUILD
curl -LO https://github.com/ontoplano/ontoplano/releases/latest/download/ontoplano.install
makepkg -si
```

then `sudo ontoplano config` to set the origin and
`sudo systemctl enable --now ontoplano`. The `.deb` and the `.rpm` are on the
[releases page](https://github.com/ontoplano/ontoplano/releases); they carry
their own Node, so there is nothing else to install. A packaged install keeps
its settings in `/etc/ontoplano/` and its database in `/var/lib/ontoplano/`.
There is no Windows installer yet — [help build one](CONTRIBUTING.md).

### On Windows

In PowerShell, once:

```powershell
wsl --install -d Ubuntu
```

Reboot if it asks, then open **Ubuntu** from the Start menu and run everything
there:

```sh
sudo apt update && sudo apt install -y nodejs npm git
sudo npm install -g yarn
git clone https://github.com/ontoplano/ontoplano.git && cd ontoplano
yarn
yarn dev
```

Then open `http://localhost:1493` in Windows — WSL forwards the port, so the
browser is the one you already use.

**There is no systemd on this path**, and that is the whole difference: nothing
starts on boot, `make dev` and the `ontoplano` service commands do not apply,
and `yarn dev` holds the terminal for as long as you want the app up. Close the
terminal and the app stops. Everything else — the data, the settings, the
upgrades — works the way it does anywhere else, under your Linux home inside
WSL (`\\wsl$\Ubuntu\home\<you>` from Explorer).

See `CONTRIBUTING.md` for details on helping with the code.

## Deploying it

The same from-source install, kept running as a service:

```sh
# ~/.config/ontoplano/env
ORIGIN=https://ontoplano.example.com   # must be the public origin, or CSRF rejects every form
BETTER_AUTH_SECRET=…                   # openssl rand -base64 32

make install-service        # build, migrate, install the service + reminders
make deploy-local           # after changes: rebuild, redeploy, restart
make install-mail-service   # the weekly mail, if you run SMTP
```

Keep it on `127.0.0.1` behind a reverse proxy that terminates TLS, and point
something at `/healthz`.
[`docs/reference/configuration.md`](docs/reference/configuration.md) is the
full list of settings, `docs/BACKUP.md` covers backups, `docs/ANDROID.md` the
phone.

Signing in is an address and a password.
Email is optional — without SMTP settings, confirmation and reset links are
written to the server log instead of sent.

## Sponsors

Sponsor me at https://github.com/sponsors/chedieck
