# The Android app

The Android app is a **Trusted Web Activity**: Chrome renders the deployed site
inside our own APK. The app _is_ the PWA rather than a second implementation of
it, which means shipping a change is a deploy, not a store review, and offline
behaviour comes from the service worker the web app already has.

The trade is that native APIs are limited to what the web platform offers. If
push notifications, biometric lock or home-screen widgets become requirements,
that is the point to revisit Capacitor — see `the planning notes/05-mobile-strategy.md`,
which also notes that a bundled Capacitor build needs a JSON API first, since a
static bundle has no server to run the current form actions against.

## Building

```sh
ONTOPLANO_DOMAIN=plan.example.com \
ANDROID_VERSION_NAME=0.1.0 \
ANDROID_VERSION_CODE=1 \
BUBBLEWRAP_KEYSTORE_PASSWORD=... \
BUBBLEWRAP_KEY_PASSWORD=... \
node scripts/build-twa.mjs
```

Outputs land in `android-twa/`:

- `app-release-signed.apk` — sideload, or hand to someone directly
- `app-release-bundle.aab` — what Play wants

Everything in `android-twa/` is generated and gitignored, including
`twa-manifest.json`. The script is the source of truth.

### Environment

| Variable                         | Meaning                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `ONTOPLANO_DOMAIN`               | **Required.** The domain the app opens. A TWA is bound to one. |
| `ONTOPLANO_ASSET_ORIGIN`         | Where icons are read while building. Defaults to the domain.   |
| `ANDROID_PACKAGE_NAME`           | Defaults to `app.ontoplano.twa`. Permanent once published.     |
| `ANDROID_VERSION_NAME` / `_CODE` | The code must increase on every upload and never repeat.       |
| `ANDROID_KEYSTORE`               | Signing key path. Defaults to `android-twa/android.keystore`.  |
| `ANDROID_KEY_ALIAS`              | Defaults to `ontoplano`.                                       |

`ONTOPLANO_ASSET_ORIGIN` exists so a machine that cannot reach the public domain
— CI, or a laptop before the first deploy — can point at a locally running
server. It changes only where bytes are fetched from while generating the
project; the app is still bound to `ONTOPLANO_DOMAIN`.

### Prerequisites

A JDK and the Android SDK, with Bubblewrap told where they are:

```jsonc
// ~/.bubblewrap/config.json
{ "jdkPath": "/usr/lib/jvm/java-21-openjdk-amd64", "androidSdkPath": "/path/to/android-sdk" }
```

Bubblewrap still expects the pre-2020 SDK layout and looks for `tools/` or
`bin/` at the SDK root. Modern command-line tools unpack to
`cmdline-tools/latest/`, so copy that to `<sdk>/tools` — a symlink is not
enough, because the `sdkmanager` script resolves its own classpath relative to
where it sits.

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
