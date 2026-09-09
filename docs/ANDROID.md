# The Android app

The Android app is a **Trusted Web Activity**: Chrome renders the deployed site
inside our own APK. The app _is_ the PWA rather than a second implementation of
it, which means shipping a change is a deploy, not a store review, and offline
behaviour comes from the service worker the web app already has.

The trade is that native APIs are limited to what the web platform offers —
which turned out to be most of what was wanted: push notifications work, and so
does the home-screen widget (both below). Biometric lock is the remaining
native gap. If it becomes a requirement, that is the point to revisit
Capacitor, which would also need a JSON API first, since a static bundle has no
server to run the current form actions against.

## Getting it onto a phone

```sh
make android-install     # over USB or wireless debugging, needs adb
make android-share       # serve it on the wifi and scan a QR code, needs nothing
```

`android-share` is the one that works everywhere: it serves the APK on this
machine's LAN address and prints a QR code to scan. Android will ask permission
to install from the browser the first time.

It serves out of `android-twa/dist/`, holding nothing but a copy of the APK —
`android-twa/` itself contains the signing keystore, and pointing an open HTTP
server at that directory would publish the key to everyone on the network.

Neither target needs a JDK or the Android SDK. The APK is just a file in the
repo; only building one needs the toolchain.

```sh
make android-fingerprint # the SHA-256 for ANDROID_CERT_FINGERPRINTS
make android-clean       # throw away the generated project
```

## Building

```sh
make android          # defaults to http://<LAN_IP>:1493 — this machine
make android ONTOPLANO_ORIGIN=https://plan.example.com
make android-gapp     # the same app for Google Play
```

`LAN_IP` is read from the network interface, so the default builds an app that
opens the instance running on this machine. That is the right answer for a
self-hosted setup and the wrong one for anything published, hence the override.

### Two builds, and the plain one is the free one

`make android` produces an APK with no proprietary dependencies — the build
F-Droid compiles, and the one you can hand to anybody. `make android-gapp`
produces the Play build, which is the same app with `androidbrowserhelper:billing`
linked so it can take a payment through the store. That library pulls
`com.android.billingclient`, which is not free software, so it is the marked
case: you ask for it by name.

|                 | `make android` | `make android-gapp`                     |
| --------------- | -------------- | --------------------------------------- |
| Output          | `android-twa/` | `android-twa-gapp/`                     |
| Artefacts       | signed APK     | signed APK and `app-release-bundle.aab` |
| Play Billing    | no             | yes                                     |
| Redistributable | yes            | no                                      |

Both are signed with the same key, which lives outside the repository — see
**Signing keys**. Everything in `android-twa/` and `android-twa-gapp/` is
generated and gitignored, including `twa-manifest.json`. The script is the
source of truth.

`android/` is a third thing and not a build directory: it is the Gradle project
committed to the repository so F-Droid can build a tag on a machine with no
network. `make android-project` regenerates it, and `make lint` fails if it
falls behind the app's version or grows a proprietary dependency.

### Environment

| Variable                         | Meaning                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `ONTOPLANO_ORIGIN`               | **Required.** The origin the app opens. A TWA is bound to one. |
| `ONTOPLANO_ASSET_ORIGIN`         | Where icons are read while building. Defaults to the origin.   |
| `ANDROID_PACKAGE_NAME`           | Defaults to `app.ontoplano.twa`. Permanent once published.     |
| `ANDROID_VERSION_NAME` / `_CODE` | The code must increase on every upload and never repeat.       |
| `ANDROID_KEYSTORE`               | Signing key path. Defaults to `android-twa/android.keystore`.  |
| `ANDROID_KEY_ALIAS`              | Defaults to `ontoplano`.                                       |

`ONTOPLANO_ASSET_ORIGIN` exists so a machine that cannot reach the public domain
— CI, or a laptop before the first deploy — can point at a locally running
server. It changes only where bytes are fetched from while generating the
project; the app is still bound to `ONTOPLANO_ORIGIN`.

### Prerequisites

Bubblewrap, a JDK and the Android SDK, all installed by you. The build fetches
nothing: with no config file Bubblewrap offers to download its own JDK on
_every_ invocation, including `--version`, so the script writes that config from
what is already installed and refuses if something is missing. Set `ANDROID_HOME`
and it will find the rest.

Only `ANDROID_HOME`. `ANDROID_SDK_ROOT` is deprecated, and Gradle stops with
"Several environment variables and/or system properties contain different paths
to the SDK" the moment the two disagree — which happens without anyone changing
anything, because Bubblewrap sets `ANDROID_HOME` to the SDK recorded in
`~/.bubblewrap/config.json` for the Gradle it runs. So the build drops
`ANDROID_SDK_ROOT` from its own environment, always, and prints which SDK
Bubblewrap has recorded when that is not the one you set. Edit that file to
change it.

```sh
npm install -g @bubblewrap/cli     # or: yarn add -D @bubblewrap/cli
apt install openjdk-21-jdk-headless
```

On first run the script creates a signing key and generates its own password,
saved beside it as `android.keystore.pass` with owner-only permissions. You are
never asked for one.

That is deliberate rather than lazy: the key file _is_ the secret, and anyone
who can read the password file can already read the key next to it. A passphrase
would only matter if the two travelled separately, which is not what happens on
a machine building its own app. Set `ANDROID_KEYSTORE_PASSWORD` to override, for
a key from elsewhere or a CI secret.

Back up **both files together** — the key and its password. Losing them means
republishing under a new listing.

For a JDK and SDK you already have, tell Bubblewrap where they are:

```jsonc
// ~/.bubblewrap/config.json
{ "jdkPath": "/usr/lib/jvm/java-21-openjdk-amd64", "androidSdkPath": "/path/to/android-sdk" }
```

Bubblewrap still expects the pre-2020 SDK layout and looks for `tools/` or
`bin/` at the SDK root. Modern command-line tools unpack to
`cmdline-tools/latest/`, so copy that to `<sdk>/tools` — a symlink is not
enough, because the `sdkmanager` script resolves its own classpath relative to
where it sits.

## Plain HTTP, and what it costs

Pointed at an `http://` origin — a box on your LAN — the build still works, and
patches the two things Bubblewrap assumes are HTTPS: the hardcoded scheme in its
Gradle template, and `usesCleartextTraffic`, which Android has required since
API 28 and whose absence shows up as a blank page with no explanation.

Two things cannot be patched, and the build warns about both:

- **The URL bar stays.** Verification below needs HTTPS, so the app cannot prove
  it owns the origin and Chrome keeps the address bar visible.
- **No offline.** Service workers only run in a secure context, so the one this
  app ships never registers over `http://`. The APK is then a launcher icon
  around the live site.

Both go away with HTTPS and no change to the app. What that takes is below.

## Getting rid of the URL bar

If the app opens with an address bar, a share icon and a browser menu, it has
fallen back to a Custom Tab: it could not prove it owns the site, so the browser
is showing you whose site it is. That is the intended behaviour, not a bug.

Verification is **only checked over HTTPS**. On `http://192.168.x.x:1493` there
is no way to hide the bar, no matter what fingerprints are configured — and no
service worker either, so no offline. One change fixes both.

It needs a certificate a browser already trusts, on a name the phone can reach.
There is no way around that and no shortcut worth writing down. Two shapes it
takes:

- **A domain you own**, with Caddy or nginx in front of the app and a
  DNS-01 challenge. Point it at `127.0.0.1:1493`.
- **A tunnel from a machine that has one** — a small VPS with a real address,
  reverse-proxying to your machine. This is also the answer for a home
  connection behind CGNAT, where nothing can be port-forwarded at all.

Either way, once the app answers on `https://something.you.own`:

```sh
make android ONTOPLANO_ORIGIN=https://something.you.own
make android-uninstall && make android-install
```

The uninstall is needed whenever the signing key changed; if it has not, the
install goes over the top.

Note that a proxy bound to `127.0.0.1` is unreachable from a phone, which is
why a LAN address gets used instead — and why the LAN address is exactly the
case that has no certificate.

`mkcert`, `make https-local` and other private authorities are **not** a
shortcut for this. Digital Asset Links is checked by the browser's own network
stack rather than by the page, and a privately-issued certificate does not
satisfy it — installing the CA on the phone is enough to make pages load and
service workers run, and is not enough to hide the URL bar.

## The other question: reminders and offline on a phone, in development

Different problem, easier answer. Notifications, service workers and installing
the app from the browser all need a **secure context**, which is HTTPS or
`localhost` — and `localhost` counts only on the machine it is running on, so a
phone on the same network reaching `http://192.168.1.4:1493` has none of them.
The browser's way of saying so is to make the APIs not exist, which reads as
the app being broken.

Unlike the URL bar, a certificate you issue yourself _is_ enough here:

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
a real certificate needs nothing installed on any device, and it satisfies the
URL-bar case too.

## Removing the URL bar

A TWA shows an address bar until it can prove the app and the site belong
together, and the proof is mutual. The APK names the domain; the site names the
APK's signing certificate at `/.well-known/assetlinks.json`, which this app
serves from `ANDROID_CERT_FINGERPRINTS`.

```sh
keytool -list -v -keystore android-twa/android.keystore -alias ontoplano | grep SHA256
# then on the server:
ANDROID_CERT_FINGERPRINTS="AA:BB:...:FF"
```

**List both keys once you publish.** Play re-signs uploads with its own app
signing key, so an app that trusts only the upload key verifies perfectly on the
developer's phone and shows the URL bar for every user who installs from the
store. Play Console shows both fingerprints under _Setup → App integrity_.

Visiting `/.well-known/assetlinks.json` with nothing configured returns an empty
statement list and says so, rather than failing silently — Chrome treats a
missing file and a malformed one identically, so the note is for whoever is
debugging it.

## Signing keys

Keep the keystore backed up and out of the repository. Play ties an app to its
key permanently: a leaked key lets someone else ship an update to your users,
and a lost one means republishing under a new listing and asking everyone to
reinstall.

## Which instance the app talks to

A TWA names one site at build time, and for a long time that was the end of it:
the app opened `ONTOPLANO_ORIGIN` and nothing could change it. That makes the
app a client for one server rather than for ontoplano, which is the wrong thing
for software whose whole point is that you can run your own.

So the launcher icon starts `InstanceActivity`, which is a fork in the road
rather than a screen: if an instance has been chosen it opens the app there,
and if none has it asks. Every launch after the first passes straight through
and draws nothing.

The question offers two answers — the origin this build was made for, as a
button, and a field for your own address. Whichever is chosen is checked
against `/healthz` before it is kept, so a typo fails here rather than as a
blank page later. It is stored in the same place the widgets read, so choosing
an instance points them at it too.

**The way back** is the launcher icon's long-press menu: **Switch instance**.
The app itself is a web view with no native chrome to hang a settings item on,
and a page cannot start an activity, so a shortcut is the affordance Android
gives an app of this shape. `ontoplano://instance` opens the same screen.
"Use a different one" forgets the origin _and_ the widget key — a key minted by
one instance means nothing to another.

### The address bar, on your own instance

Digital Asset Links verification is per-origin. The app is verified against the
origin it was built for; point it somewhere else and Chrome has no statement
tying the two together, so it opens in a Custom Tab **with an address bar**.

It works, it just does not look like an app. To fix it on your own instance,
serve this app's fingerprint from it — the same `ANDROID_CERT_FINGERPRINTS`
setting described under **Removing the URL bar**, using the fingerprint from
`make android-fingerprint`.

## The home-screen widget

The app carries one native component: a home-screen widget showing today's
blocks, habits and tasks. It is the one thing a TWA cannot do as a web page — a
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
**Settings → Integrations** as "Phone widget", where revoking it disconnects
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

The widget and the instance chooser live in `android/native/`, outside the
generated project, because
Bubblewrap regenerates `android-twa/app/` from `twa-manifest.json` on every run.
`scripts/build-twa.mjs` copies it in afterwards and adds the three components to
the manifest — the provider, the list service and the configuration activity.

`__PACKAGE__` in those sources is replaced with `ANDROID_PACKAGE_NAME` at copy
time: the classes sit in the app's own package so `R` resolves, and the package
is still configurable. `__ORIGIN__` is replaced with the origin the build is
bound to, so the widget's Connect button opens the same instance the app does.

They are Java, not Kotlin. The generated project has no Kotlin plugin, and
adding one to a file that is rewritten on every build is a worse trade than a
few hundred lines of Java for a screen that draws three lists.
