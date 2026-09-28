<!-- title: On your phone -->
<!-- blurb: the Android app, the isolated instance, and the ways in for iPhone and desktop -->

# On your phone

Ontoplano on a phone is the Android app. It carries the whole thing: install
it, and the first screen asks where your Ontoplano lives —
**app.ontoplano.com**, an instance you run yourself, or **this phone and
nothing else**. The answer can be changed later, so trying one and moving to
another is a choice, not a reinstall.

## Getting the app

The app is not in Google Play, F-Droid or the App Store yet. Until it is, there
are three ways onto an Android phone.

### The APK from a release

Releases are at **<https://github.com/ontoplano/ontoplano/releases>**. One
that carries the app lists `ontoplano-v<version>.apk` among its files, beside
`SHA256SUMS`.

1. Open that page on the phone and download the newest `.apk`.
2. Open the downloaded file. Android asks once whether to allow installs from
   this browser; say yes.
3. Install, open it, and answer the one question it asks.

To check a download on a computer, put it beside that release's `SHA256SUMS`
and run `sha256sum -c SHA256SUMS --ignore-missing`.

The APK is signed with the project's release key, so each one updates the last
in place. A build from a store is signed with a different key: switching
between the two means uninstalling first.

### Building it from source

You need Node and yarn, JDK 21 and an Android SDK.

```sh
git clone https://github.com/ontoplano/ontoplano
cd ontoplano
yarn install
make android            # the isolated build, then the APK
make android-install    # onto a phone with USB debugging on, over adb
```

The APK is written to
`capacitor/android/app/build/outputs/apk/official/debug/app-official-debug.apk`.
The SDK is looked for in `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `~/android-sdk`,
`~/Android/Sdk` and beside `adb`; pass `ANDROID_HOME=/path/to/sdk` otherwise.
The rest is in
[docs/ANDROID.md](https://github.com/ontoplano/ontoplano/blob/master/docs/ANDROID.md).

### From the browser

The web app installs as a PWA. Open your instance in Chrome, sign in, and pick
**Install app** (or **Add to Home screen**) from the menu. Browsers only
install from HTTPS.

That is the web app, not the Android app: it needs an instance to point at and
cannot be isolated.

### What the app adds

- **Reminders that arrive as Ontoplano**, through Android's own alarms, with
  the app closed.
- **It can be its own instance** — the next section.

## The isolated instance

Choose **On device** on the first screen and the app is the instance,
isolated: the same rooms and the same data, against a database in the phone's
own storage.
Nothing is signed into because there is nothing to sign into.

What it costs, in the app's own words on that screen:

- **Fully offline.** No network, ever, for anything.
- **Cannot be reached from another device.** This copy is this phone's.
- **No AI assistants.** The MCP server is a server; there is not one.
- **No backups.** A lost phone is lost data — export from
  **Settings → Account** and keep the file somewhere.

The way out is the way in: export, point the app at an instance, import there.
Your data is one JSON file wherever it lives.

## The widget

1. Long-press an empty part of the home screen → **Widgets**.
2. Drag ontoplano's **Today** onto the screen.
3. Check the address on its setup screen and tap **Connect** — your browser
   mints a key for the widget and hands it back.

If the browser does not come back, the page shows the key: copy it and paste
it into **Or paste the key** on the setup screen. The key can read today's
plan and nothing else; revoke it under **Settings → AI & Integrations**.

## On an iPhone

There is no iOS app yet. Safari installs the web app — and on iOS it has to be
Safari; Apple lets no other browser do this:

1. Open your instance in Safari and sign in.
2. Tap **Share**, then **Add to Home Screen**.

You get the icon, the whole screen, and it opens offline. What an installed
web app cannot do is be its own instance — it needs an instance to point at.

## On a computer

Nothing to install: the app is the site, and <kbd>⌘</kbd>/<kbd>Ctrl</kbd>
plus <kbd>K</kbd> gets you anywhere in it. Chrome and Edge offer an install
icon at the right of the address bar if you want a window of its own; Firefox
and Safari work in a tab.

A self-hosted instance on plain HTTP works in any tab, but browsers only
_install_ from HTTPS — that is their rule. The Android app has no such rule:
point it at your box and it works over HTTP too.
