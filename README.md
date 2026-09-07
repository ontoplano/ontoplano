<div align="center">

<img src="static/icons/icon-192.png" alt="" width="112" height="112">

# Ontoplano

**Managing life, one week at a time.**

[![checks](https://github.com/ontoplano/ontoplano/actions/workflows/ci.yml/badge.svg)](https://github.com/ontoplano/ontoplano/actions/workflows/ci.yml)
[![latest release](https://img.shields.io/github/v/release/ontoplano/ontoplano?label=release&color=1f6feb)](https://github.com/ontoplano/ontoplano/releases/latest)
[![licence AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-1f6feb)](LICENSE)
[![self-hosted](https://img.shields.io/badge/host%20it-yourself-1f6feb)](#running-it)

<a href="https://demo.ontoplano.com"><img alt="Try the demo — no sign-up necessary" src="https://img.shields.io/badge/%E2%96%B6%20try%20the%20demo-no%20sign--up%2C%20a%20week%20already%20in%20it-1f6feb?style=for-the-badge&labelColor=0b1220"></a>

[ontoplano.com](https://ontoplano.com) · [official instance](https://app.ontoplano.com) · [documentation](https://docs.ontoplano.com)

`.deb` · `.rpm` · AUR · Docker · Android

</div>

> [!NOTE]
> This software was released on September 5th, 2026. It's still maturing, and
> it may contain bugs. Please be patient, and help me improve it by creating issues
> and pull requests.

---

Ontoplano is a life management app built around planning your week. Besides planning
recurring tasks, exceptional stuff you will have to do on a date or random stuff to do
someday, you can also write notebooks, register goals with measured progress, habits,
ideas, the people in your life, recipes and the shopping list.
[Check the demo to get the idea.](https://demo.ontoplano.com).

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

# Arch, Manjaro (not on the AUR yet, they have supended new accounts for the time being)
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

Or with Docker:

```sh
docker run -d --name ontoplano -p 1493:1493 \
  -v ontoplano-data:/data \
  -e ORIGIN=http://localhost:1493 \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  ontoplano/ontoplano:latest
```

Register at `/login` — **the first account owns the instance**, and after it
registration is closed until changed at `/settings/instance`.

Reminders service come installed. The optional Monday review mail does not — it needs
SMTP; [the docs](https://docs.ontoplano.com/running-it) set it up.

## Developing it

```sh
yarn
make dev        # dev server at http://localhost:1493, as a systemd user service
make dev-logs   # follow it; make dev-stop stops it; make dev-fg holds the terminal
make db-seed    # synthetic data for the dev account
```

`make dev` wants Linux with systemd — on anything else, `yarn dev` runs
the same server in the foreground. A from-source instance keeps its settings in
`~/.config/ontoplano/` and its database in `~/.local/share/ontoplano/`.

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
