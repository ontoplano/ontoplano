# The Android app

The Android app is a **Trusted Web Activity**: Chrome renders the deployed site
inside our own APK. The app _is_ the PWA rather than a second implementation of
it, which means shipping a change is a deploy, not a store review, and offline
behaviour comes from the service worker the web app already has.

The trade is that native APIs are limited to what the web platform offers. If
push notifications, biometric lock or home-screen widgets become requirements,
that is the point to revisit Capacitor —
which also notes that a bundled Capacitor build needs a JSON API first, since a
static bundle has no server to run the current form actions against.

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
```

`LAN_IP` is read from the network interface, so the default builds an app that
opens the instance running on this machine. That is the right answer for a
self-hosted setup and the wrong one for anything published, hence the override.

Outputs land in `android-twa/`:

- `app-release-signed.apk` — sideload, or hand to someone directly
- `app-release-bundle.aab` — what Play wants

Everything in `android-twa/` is generated and gitignored, including
`twa-manifest.json`. The script is the source of truth.

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

Both go away with HTTPS and no change to the app. For a LAN address the two
cheap routes are Tailscale Serve, which issues a real certificate for a
`*.ts.net` name, and Caddy with a DNS challenge against a domain you own.

## Getting rid of the URL bar

If the app opens with an address bar, a share icon and a browser menu, it has
fallen back to a Custom Tab: it could not prove it owns the site, so the browser
is showing you whose site it is. That is the intended behaviour, not a bug.

Verification is **only checked over HTTPS**. On `http://192.168.x.x:1493` there
is no way to hide the bar, no matter what fingerprints are configured — and no
service worker either, so no offline. One change fixes both.

For a machine with no public address, Tailscale is the least painful route: it
issues a real certificate for a name it controls, and nothing is exposed or
port-forwarded.

```sh
make https-tailscale
```

That prints the origin and the environment to set. Then:

```sh
make android ONTOPLANO_ORIGIN=https://<your-machine>.ts.net
make android-uninstall && make android-install
```

The uninstall is needed whenever the signing key changed; if it has not, the
install goes over the top.

`make https-tailscale` points at the app directly rather than through a reverse
proxy in front of it. If you run one, note that it will not see this traffic —
and that a proxy bound to `127.0.0.1` is unreachable from a phone anyway, which
is why the app is usually reached on the LAN address instead.

If you already own a domain, Caddy with a DNS-01 challenge gets the same result
without Tailscale — point it at `127.0.0.1:1493` and set the same three
variables.

`mkcert` and other private CAs are not a shortcut here: the certificate has to
be trusted by the browser doing the verification, and a locally-issued one
generally is not. Untested, so treat it as unlikely rather than merely fiddly.

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

The widget lives in `android/widget/`, outside the generated project, because
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
