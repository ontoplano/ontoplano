<div align="center">

<img src="static/icons/icon-192.png" alt="" width="112" height="112">

# Ontoplano

**One life, one app.**

[![checks](https://github.com/ontoplano/ontoplano/actions/workflows/ci.yml/badge.svg)](https://github.com/ontoplano/ontoplano/actions/workflows/ci.yml)
[![release](.github/badges/release.svg)](https://github.com/ontoplano/ontoplano/releases/latest)
[![licence AGPL-3.0](.github/badges/licence.svg)](LICENSE)
[![host it yourself](.github/badges/host-it.svg)](#running-it)

[ontoplano.com](https://ontoplano.com) · [official instance](https://app.ontoplano.com) · [documentation](https://docs.ontoplano.com)

`.deb` · `.rpm` · Arch · Docker · Android

</div>

> [!NOTE]
> This software was released on September 5th, 2026. It's still maturing, and
> it may contain bugs. LLMs are used extensively during development; their
> output is reviewed and tested before it lands.
>
> Help improve it by creating issues and pull requests.

[![Try the demo](.github/badges/try-the-demo.svg)](https://demo.ontoplano.com)

---

## Running it

### systemd

A service that starts on boot, upgraded by the package manager you use:

```sh
# Debian, Ubuntu, Mint, Pop!_OS
sudo apt install ./ontoplano_*_amd64.deb

# Fedora, RHEL, openSUSE
sudo dnf install ./ontoplano-*.x86_64.rpm

# Arch, Manjaro (not on the AUR yet — it has suspended new accounts)
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
There is no Windows installer yet — [help build one](CONTRIBUTING.md). Windows
runs it from source; see below.

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
