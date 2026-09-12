# The Android app

The app is a **Capacitor shell** around the same build a browser gets. There is
no second implementation of anything: the shell is a WebView, the pages inside
it are the app's own pages, and shipping a change to a hosted instance is a
deploy rather than a store review.

What the shell adds over a browser is the part a tab cannot do. It can hold the
instance **on the device itself** — SQLite compiled to WebAssembly over the
phone's own storage, no server anywhere — and it can carry a home-screen
widget. Both are below.

It replaced a Trusted Web Activity, which was Chrome rendering one origin the
build was bound to, with a keystore, a fingerprint and a served
`assetlinks.json` standing between you and a hidden address bar. Everything it
did this does, and it could never have held an instance of its own.

## The four apps, and which is which

One project, four flavours. They differ in an application id, a name, an icon
and the instance they open on — nothing else, and the same code runs in all of
them.

| Flavour    | Application id           | Opens on                |
| ---------- | ------------------------ | ----------------------- |
| `official` | `app.ontoplano`          | `app.ontoplano.com`     |
| `dev`      | `app.ontoplano.dev`      | `$ONTOPLANO_DEV_ORIGIN` |
| `staging`  | `app.ontoplano.staging`  | `staging.ontoplano.com` |
| `device`   | `app.ontoplano.isolated` | the phone itself        |

The instance a flavour opens on is its default, not a cage.

## Building

```sh
make android                 # the store artifact: official, release, unsigned
make android-phones          # official, dev and staging, built and installed over adb
make android-isolated  # the one that is its own instance
make android-project         # regenerate the committed Gradle project
```

`make android-phones` takes the dev app's address from the environment, because
a laptop's place on the wifi changes:

```sh
ONTOPLANO_DEV_ORIGIN=http://192.168.1.23:1493 make android-phones
```

Everything needs an Android SDK; set `ANDROID_HOME` if it is not at
`~/android-sdk`.

## What is committed, and why

`capacitor/android/` is in the repository, icons and all. F-Droid builds from a
git tag on a machine with no network and none of our tooling, so what is
committed has to be buildable exactly as it stands. The icon scripts write the
same bytes from the same source every time, which is what makes committing
generated files sane rather than a diff after every build.

`make android` leaves the release APK **unsigned** on purpose: F-Droid signs
what it builds, and a signing key in that path is only a key to lose.

## Signing keys

There are none in this repository and there should never be. A debug key is
whatever your SDK generated; anything a store distributes is signed by the
store or by a key kept outside the tree.

## HTTPS while developing, so a phone gets a real browser

Different problem, easier answer. Notifications, service workers and installing
the app from the browser all need a **secure context**, which is HTTPS or
`localhost` — and `localhost` counts only on the machine it is running on, so a
phone on the same network reaching `http://192.168.1.4:1493` has none of them.
The browser's way of saying so is to make the APIs not exist, which reads as
the app being broken.

A certificate you issue yourself is enough here:

```sh
make https-local
```

It serves the app over HTTPS with Caddy's own certificate authority and serves
that authority's public certificate on port 1494 so the phone can fetch it.

- **The one thing that wants root** is putting the CA into _this_ machine's
  trust stores, so your own browser stops warning. Caddy asks for it in the
  middle of its own output. `make https-local TRUST_LOCAL=0` skips it and
  nothing prompts.
- **On Android**: open `http://<lan-ip>:1494/root.crt`, then Settings →
  Security → Encryption & credentials → Install a certificate → CA certificate.
- **Chrome trusts what you install there; Firefox for Android does not.** It
  keeps its own list and ignores the system one, so a locally-issued
  certificate will not work in it at all. Use Chrome, or put the app behind a
  real certificate.
- **On iOS** the profile has to be installed _and then_ switched on under
  General → About → Certificate Trust Settings, which is the step everybody
  misses.

If you already have a domain and something in front of it — a proxy on a VPS,
a tunnel out of a home connection — that is strictly better than all of this:
a real certificate needs nothing installed on any device.

## The home-screen widget

The app carries one native component: a home-screen widget showing today's
blocks, habits and tasks. It is the one thing that cannot be a web page — a
widget is drawn by the launcher, out of process, from a `RemoteViews` tree.

It reads a single endpoint, `/api/v1/today`, with a scoped API token. Blocks,
habits and tasks arrive together because a widget refreshes on a timer, often
over mobile data, and three round trips to draw one screen is three chances to
be half-drawn.

### Putting one on the home screen

1. Long-press the home screen, pick **Ontoplano — today**, and drop it.
2. The setup screen opens. Tap **Connect**: it opens your instance in the
   browser — already signed in, since the app is that browser — where one tap
   mints the widget its own key and hands it straight back over
   `ontoplano://widget`. Nobody sees or pastes a token.

The key is scoped to **`today:read`** and nothing else: a widget sits on a
lock screen; it should not carry a key to the diary. It appears under
**Settings → AI & Integrations → Integrations** as "Phone widget", where revoking it disconnects
the widget. The address field on the setup screen is prefilled with the
instance the app was built for; somebody self-hosting can point it elsewhere
before tapping Connect.

Tap the header to open the app, **Refresh** to read again. The launcher also
refreshes it every half hour, which is the shortest period it honours for a
widget that wakes itself.

To reconnect or change the address later: long-press the widget and choose the
launcher's own "reconfigure" (Android 12 and up), or remove it and place it
again.

### How it is built

The widget's sources are in `capacitor/native/` — Java, layouts and drawables
for the provider, the list service and the configuration activity.

**They are not yet wired into the Capacitor shell.** They were built against
the generated TWA project, which copied them in and added the three components
to its manifest; that project is gone and this one has no equivalent step yet.
The code is kept here because the widget is a real feature and rewriting it
from nothing would be silly, but until the shell declares those components a
freshly installed app offers no widget. That is the last piece of the move off
the TWA.

`__PACKAGE__` in those sources is a placeholder replaced at copy time so the
classes sit in the app's own package and `R` resolves; `__ORIGIN__` is the
instance the build opens on, so the widget's Connect button reaches the same
place the app does.

They are Java rather than Kotlin, which was the right call for a generated
project and is worth revisiting now that the project is committed and ours.
