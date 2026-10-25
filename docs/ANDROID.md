# The Android app

The app is a **Capacitor shell** around the same build a browser gets. There is
no second implementation of anything: the shell is a WebView, the pages inside
it are the app's own pages, and shipping a change to a hosted instance is a
deploy rather than a store review.

What the shell adds over a browser is the part a tab cannot do. It can hold the
instance **on the device itself** — SQLite compiled to WebAssembly over the
phone's own storage, no server anywhere — and it can carry a home-screen
widget. Both are below.

## The apps, and which is which

One project, four flavours. They differ in an application id, a name, an icon
and the address their first screen suggests, and the same code runs in all of
them.

| Flavour    | Application id          | Suggests                | Goes to                  |
| ---------- | ----------------------- | ----------------------- | ------------------------ |
| `official` | `app.ontoplano`         | `app.ontoplano.com`     | F-Droid, GitHub releases |
| `play`     | `app.ontoplano`         | `app.ontoplano.com`     | Google Play              |
| `dev`      | `app.ontoplano.dev`     | `$ONTOPLANO_DEV_ORIGIN` | a developer's phone      |
| `staging`  | `app.ontoplano.staging` | `staging.ontoplano.com` | a developer's phone      |

`play` is `official` plus Google Play's purchase sheet. The Billing Library
behind it is not free software, so it is linked only as `playImplementation`
and its plugin (`PlayBilling.java`) lives in the flavour's own sources;
`scripts/check-android-version.mjs` fails if it leaks into any other build.
Play will not let a listing sell a subscription until it has received a bundle
carrying the library — `make android-gapp` builds that bundle.

A purchase crosses two origins. The page on the instance cannot reach the
shell, so it sends the person to `/play` on the copy the phone carries, which
opens the sheet with the account id stamped on the purchase and sends the token
back to `/buy` to be claimed. Pages learn they are in the Play copy from the
extra `OntoplanoPlay` token in the user agent. See `src/lib/play-billing.ts`.

Every one of them carries the whole app and boots on the copy it carries. No
flavour is pointed at a server by the native layer, which is what lets any
install be an instance of its own: the first screen asks, "Connect to an
instance" is selected with that flavour's address already typed, and "This
phone only" keeps everything on the device. The answer is remembered, so the
question is asked once.

Leaving an instance — signing out, or the instance screen from a connected
one — comes back to the same question. Choosing the phone from a page served
by an instance navigates to the copy on the device, because a different origin
has its own storage and only an address reaches it.

There is no separate build for the phone-only case. There was, and it was the
same app under a fourth application id, which meant two icons called Ontoplano
and a choice made at build time that belongs to whoever is holding the phone.

## Building

```sh
make android              # build the app
make android-install      # and put it on the phone over adb
make android-install-all  # the same app three times, one per instance
make android-store        # the store artifact: official, release, unsigned
make android-project      # regenerate the committed Gradle project
```

`make android-install-all` takes the DEV app's address from the environment,
because a laptop's place on the wifi changes:

```sh
ONTOPLANO_DEV_ORIGIN=http://192.168.1.10:1493 make android-install-all
```

Everything needs an Android SDK. It is looked for in `ANDROID_HOME`,
`ANDROID_SDK_ROOT`, `~/android-sdk`,
`~/Android/Sdk` and beside whatever `adb` is on the path; pass
`ANDROID_HOME=/path/to/sdk` if it lives somewhere else.

## What is committed, and why

`capacitor/android/` is in the repository, icons and all. F-Droid builds from a
git tag on a machine with no network and none of our tooling, so what is
committed has to be buildable exactly as it stands. The icon scripts write the
same bytes from the same source every time, which is what makes committing
generated files sane rather than a diff after every build.

`make android-store` leaves the release APK **unsigned** on purpose: F-Droid
signs what it builds, and a signing key in that path is only a key to lose.

## Signing keys

There are none in this repository and there should never be. A debug key is
whatever your SDK generated; anything a store distributes is signed by the
store or by a key kept outside the tree.

The APK attached to a GitHub release is that same unsigned build, signed with
the project's release key — kept outside the tree, and neither the Play key nor
F-Droid's. Android only updates an app with one signed by the same key, so an
APK from a release updates only an APK from a release; switching to a store's
build means uninstalling first.

## Obtainium

[Obtainium](https://github.com/ImranR98/Obtainium) is how somebody tracks the
GitHub release APK without watching the releases page: it reads the release,
installs the APK and offers the next one. Nothing in the build is for it. A
release carries exactly one `.apk`, signed each time with the key above, which
is already everything it needs — the only thing that had to be written is the
link, and that is generated:

```sh
node scripts/obtainium-config.mjs          # the configuration and both links
node scripts/obtainium-config.mjs --link   # the one the docs carry
```

The configuration is `id`, `url`, `author`, `name` and `additionalSettings`, and
every value comes from somewhere else in the repository — the application id and
the name from the `official` flavour in the committed Gradle project, the
address from `SOURCE_URL` in `$lib/links` — so a fork's link is its own. The
link is `obtainium://app/<url-encoded JSON>` wrapped in Obtainium's redirect
page, because Markdown renderers drop a custom scheme.

It is written into `README.md`, `docs/ANDROID.md` and
`docs/prose/on-your-phone.md` rather than generated into them, so
`--check` runs in `make lint` and fails when they come apart. Nobody can proof-read
400 characters of percent-encoding.

**[Add Ontoplano to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%257B%2522id%2522%253A%2522app.ontoplano%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fgithub.com%252Fontoplano%252Fontoplano%2522%252C%2522author%2522%253A%2522ontoplano%2522%252C%2522name%2522%253A%2522Ontoplano%2522%252C%2522additionalSettings%2522%253A%2522%257B%255C%2522includePrereleases%255C%2522%253Afalse%257D%2522%257D)**

There is deliberately no `apkFilterRegEx` in it. The press bakes the
configuration into that person's copy, so a filter would be a promise about
asset names made to everybody who ever added the app — rename the asset and
they get an app with no APK to be found. One `.apk` per release is the thing
that keeps this simple, so a second one is a decision, not a build detail.

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

The app carries one native component a web page cannot be: a home-screen
widget, drawn by the launcher out of process from a `RemoteViews` tree.

### The notebook widget

**Ontoplano — notebook** shows one tab of one notebook: its tasks, notes,
goals, ideas or things to buy, filtered and ordered the way that tab's own
list can be
(`capacitor/android/app/src/main/java/app/ontoplano/isolated/NotebookWidget*.java`).

1. Long-press the home screen, pick **Ontoplano — notebook**, and drop it.
2. The app opens on the instance at **Settings → AI & Integrations → Widgets**
   with the form already open: choose the notebook, the tab, what to show,
   a tag, and the order. Saving mints the widget a key and hands it to the
   phone through the app's own copy at `/widget` — the same trip the reminders
   key makes through `/ring` — and the app comes back to the list.

Pressing the header opens the notebook on that tab
(`/notebooks/<id>?tab=<tab>`); pressing a line opens that note, task or goal
(`&item=<id>`). The press reaches the app as `MainActivity.EXTRA_OPEN`, which
the launch on the device's copy turns into the page on the chosen instance —
the shell does not know which instance that is; the web view does.

The widget's choices are kept on the instance, in `phone_widgets`, so they are
edited or deleted from that same list and the phone picks the change up on its
next refresh. Its key is confined to the notebook and holds only the tab's
read scope; deleting the widget there revokes it, and the widget says so.

It needs an instance with a server: the phone-only instance has no API for a
launcher to call, and Settings → Integrations is not on a device build.
