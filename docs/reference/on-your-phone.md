<!-- Written by hand in docs/prose/on-your-phone.md — edit that file, then run `yarn docs`.
     The tables below marked "generated" come from the code itself. -->

# On your phone

Ontoplano is a **progressive web app**, which means the app on your home screen
is this app — the same one, installed. There is nothing to buy and no store to
go through, and it works the same on the hosted instance or on one you run
yourself.

## Two ways in

**From the browser.** Two taps, no download, and it updates itself the moment
the instance does. This is the right answer for almost everybody, and the rest
of this page is about it.

**The Android package.** A signed `.apk` you download once. Same app, plus the
things Android reserves for real apps: the **home-screen widget**, and
**notifications that arrive as Ontoplano** rather than as your browser. It does
not update itself — the app inside is always current, the wrapper you replace
when a release says to. [The package, and how to install
it](#the-android-package-and-what-it-adds) is at the bottom.

Answer the three questions and the steps below narrow to yours. Nothing is
sent anywhere — the answers stay in this page.

<div class="wizard" data-wizard>
  <fieldset>
    <legend>1. What are you holding?</legend>
    <label><input type="radio" name="device" value="android" checked> Android phone or tablet</label>
    <label><input type="radio" name="device" value="ios"> iPhone or iPad</label>
    <label><input type="radio" name="device" value="desktop"> A computer</label>
  </fieldset>

  <fieldset data-only="android desktop">
    <legend>2. Which browser?</legend>
    <label><input type="radio" name="browser" value="chrome" checked> Chrome</label>
    <label><input type="radio" name="browser" value="firefox"> Firefox</label>
    <label><input type="radio" name="browser" value="safari"> Safari</label>
    <label><input type="radio" name="browser" value="other"> Something else</label>
  </fieldset>

  <fieldset>
    <legend>3. Whose instance?</legend>
    <label><input type="radio" name="where" value="hosted" checked> app.ontoplano.com</label>
    <label><input type="radio" name="where" value="self"> One I run myself</label>
  </fieldset>
</div>

<p class="wizard-note" data-wizard-note hidden>
  Showing the steps for your answers. Everything else on this page is still
  here — scroll on if you want to read the rest.
</p>

## Where you are installing from

<div data-step data-where="hosted">

Open **<https://app.ontoplano.com>** and sign in. The rest of the steps assume
you are looking at the app, signed in, in the browser you chose.

</div>

<div data-step data-where="self">

Open your own instance and sign in.

If the browser never offers to install, the address is why: browsers only
install web apps from **HTTPS** (or `http://localhost`), and a self-signed
certificate does not count. Everything still works in a tab either way.

No HTTPS and you still want an icon and a full screen? Build the Android
package against your own instance — `make android` in a checkout, with
`ONTOPLANO_ORIGIN` pointed at your box. It installs and works over plain HTTP
too; the one cost is an address bar across the top until your instance serves
HTTPS and the app's signing fingerprint (`ANDROID_CERT_FINGERPRINTS` — [Running
it yourself](running-it.md) has it).

</div>

## The steps

<div data-step data-device="android" data-browser="chrome other">

### Android, Chrome

Brave, Edge, Samsung Internet, Vivaldi and Opera are all Chrome underneath and
the steps are the same; the menu button may be at the bottom rather than the
top.

1. Tap the **⋮** menu, at the top right.
2. Choose **Add to Home screen** — some versions say **Install app**, which is
   the same thing.
3. Confirm the name, and tap **Install**.

<svg viewBox="0 0 260 190" role="img" aria-label="The Chrome menu open, with Add to Home screen highlighted" class="shot">
  <rect x="0.5" y="0.5" width="259" height="189" rx="6" fill="var(--soft)" stroke="var(--line)"/>
  <rect x="10" y="10" width="240" height="22" rx="4" fill="var(--bg)" stroke="var(--line)"/>
  <text x="20" y="25" font-size="9" fill="var(--muted)">app.ontoplano.com</text>
  <circle cx="236" cy="17" r="1.4" fill="var(--ink)"/><circle cx="236" cy="21" r="1.4" fill="var(--ink)"/><circle cx="236" cy="25" r="1.4" fill="var(--ink)"/>
  <rect x="120" y="38" width="130" height="140" rx="6" fill="var(--bg)" stroke="var(--line)"/>
  <text x="132" y="56" font-size="9" fill="var(--muted)">New tab</text>
  <text x="132" y="76" font-size="9" fill="var(--muted)">History</text>
  <text x="132" y="96" font-size="9" fill="var(--muted)">Downloads</text>
  <rect x="124" y="104" width="122" height="20" rx="3" fill="var(--link)" opacity="0.16"/>
  <rect x="124" y="104" width="2.5" height="20" fill="var(--link)"/>
  <text x="132" y="118" font-size="9" font-weight="600" fill="var(--ink)">Add to Home screen</text>
  <text x="132" y="140" font-size="9" fill="var(--muted)">Desktop site</text>
  <text x="132" y="160" font-size="9" fill="var(--muted)">Settings</text>
</svg>

</div>

<div data-step data-device="android" data-browser="firefox">

### Android, Firefox

1. Tap the **⋮** menu.
2. Choose **Add to Home screen**.
3. Confirm.

Firefox on Android installs web apps properly, but it has historically been
less consistent about offline behaviour than Chrome. If the app refuses to open
without a network, that is the difference, and Chrome is the workaround.

<svg viewBox="0 0 260 190" role="img" aria-label="The Firefox menu open, with Install highlighted" class="shot">
  <rect x="0.5" y="0.5" width="259" height="189" rx="6" fill="var(--soft)" stroke="var(--line)"/>
  <rect x="10" y="158" width="240" height="22" rx="4" fill="var(--bg)" stroke="var(--line)"/>
  <text x="20" y="173" font-size="9" fill="var(--muted)">app.ontoplano.com</text>
  <circle cx="236" cy="165" r="1.4" fill="var(--ink)"/><circle cx="236" cy="169" r="1.4" fill="var(--ink)"/><circle cx="236" cy="173" r="1.4" fill="var(--ink)"/>
  <rect x="120" y="16" width="130" height="134" rx="6" fill="var(--bg)" stroke="var(--line)"/>
  <text x="132" y="34" font-size="9" fill="var(--muted)">Bookmarks</text>
  <text x="132" y="54" font-size="9" fill="var(--muted)">History</text>
  <rect x="124" y="62" width="122" height="20" rx="3" fill="var(--link)" opacity="0.16"/>
  <rect x="124" y="62" width="2.5" height="20" fill="var(--link)"/>
  <text x="132" y="76" font-size="9" font-weight="600" fill="var(--ink)">Install</text>
  <text x="132" y="98" font-size="9" fill="var(--muted)">Add to Home screen</text>
  <text x="132" y="118" font-size="9" fill="var(--muted)">Desktop site</text>
  <text x="132" y="138" font-size="9" fill="var(--muted)">Settings</text>
</svg>

</div>

<div data-step data-device="android" data-browser="safari">

### Android, Safari

There is no Safari on Android. Use Chrome or Firefox — pick one above and the
steps will change.

</div>

<div data-step data-device="ios">

### iPhone and iPad

**It has to be Safari.** On iOS every browser is Safari underneath, but only
Safari itself may install a web app — Chrome and Firefox on an iPhone cannot,
and will not offer to. This is Apple's rule, not ours.

1. Open your instance in **Safari** and sign in.
2. Tap **Share** — the square with an arrow coming out of the top, in the bar
   at the bottom.
3. Scroll the list down and tap **Add to Home Screen**.
4. Confirm the name, and tap **Add**.

<svg viewBox="0 0 260 190" role="img" aria-label="The iOS share sheet, with Add to Home Screen highlighted" class="shot">
  <rect x="0.5" y="0.5" width="259" height="189" rx="6" fill="var(--soft)" stroke="var(--line)"/>
  <rect x="30" y="10" width="200" height="120" rx="8" fill="var(--bg)" stroke="var(--line)"/>
  <text x="42" y="30" font-size="9" fill="var(--muted)">Copy</text>
  <text x="42" y="50" font-size="9" fill="var(--muted)">Add to Reading List</text>
  <text x="42" y="70" font-size="9" fill="var(--muted)">Add Bookmark</text>
  <rect x="34" y="78" width="192" height="20" rx="3" fill="var(--link)" opacity="0.16"/>
  <rect x="34" y="78" width="2.5" height="20" fill="var(--link)"/>
  <text x="42" y="92" font-size="9" font-weight="600" fill="var(--ink)">Add to Home Screen</text>
  <text x="42" y="114" font-size="9" fill="var(--muted)">Markup</text>
  <rect x="10" y="158" width="240" height="22" rx="4" fill="var(--bg)" stroke="var(--line)"/>
  <path d="M126 174 l4 -6 l4 6 M130 168 v12" stroke="var(--ink)" fill="none" stroke-width="1.2"/>
  <rect x="124" y="166" width="12" height="10" rx="1.5" fill="none" stroke="var(--ink)" stroke-width="1.2"/>
</svg>

</div>

<div data-step data-device="desktop" data-browser="chrome other">

### A computer, Chrome or Edge

An install icon — a monitor with an arrow — appears at the right-hand end of
the address bar once the page has loaded. Click it, then **Install**. You get
ontoplano in its own window, with no browser chrome and its own entry in the
task switcher.

If the icon is not there, it is one of the two reasons under **Whose instance**
above.

<svg viewBox="0 0 260 90" role="img" aria-label="The install icon at the right of the address bar" class="shot">
  <rect x="0.5" y="0.5" width="259" height="89" rx="6" fill="var(--soft)" stroke="var(--line)"/>
  <rect x="10" y="14" width="240" height="24" rx="12" fill="var(--bg)" stroke="var(--line)"/>
  <text x="24" y="30" font-size="9" fill="var(--muted)">app.ontoplano.com</text>
  <circle cx="222" cy="26" r="11" fill="var(--link)" opacity="0.16"/>
  <rect x="216" y="21" width="12" height="9" rx="1.5" fill="none" stroke="var(--ink)" stroke-width="1.2"/>
  <path d="M222 23 v4 M220 25.5 l2 2 l2 -2" stroke="var(--ink)" fill="none" stroke-width="1.2"/>
  <text x="14" y="62" font-size="9" fill="var(--muted)">The icon appears once the page has loaded.</text>
</svg>

</div>

<div data-step data-device="desktop" data-browser="firefox safari">

### A computer, Firefox or Safari

Neither installs web apps on the desktop. Firefox removed the feature and
Safari on macOS has never had it. The site works normally in a tab, and
<kbd>⌘</kbd>/<kbd>Ctrl</kbd> plus <kbd>K</kbd> gets you anywhere in it.

macOS Sonoma and later have **File → Add to Dock** in Safari, which is close:
its own window and its own icon, without the offline behaviour.

</div>

## What you get once it is installed

- **No address bar**, so the app has the whole screen.
- **Your own icon** in the launcher, and its own window in the switcher.
- **It opens offline.** The shell is cached, so a dead network gives you the app
  rather than a browser error.
- **Ticking the shopping list works with no signal.** The ticks are kept on the
  phone, survive closing the tab, and go up the moment you are back on a
  network. That is the one write anybody makes in a supermarket basement, so it
  is the one that queues.

## The gesture

Press and hold the round button in the middle of the bottom bar and a wheel
opens under your thumb, one wedge per room. Slide onto the one you want and let
go — one thumb, without looking, which is the only way anything gets captured
while you are doing something else. Tapping it instead leaves the wheel open.

[Which way round the wheel goes](the-wheel.md), and how to rearrange it.

## If the browser never offers to install

It only offers over **HTTPS**, and only once it has fetched the manifest and the
service worker. A self-hosted instance on plain HTTP will not be installable —
that is the browser's rule, not this app's.

On iOS, check you are in Safari. The Share menu in Chrome for iOS has no _Add to
Home Screen_, because on iOS no browser but Safari may install a web app.

## Is it in the Play Store?

No, and it would be the same thing if it were: the store build is this app in a
thin wrapper. Installing from the browser costs nothing and stays current by
itself.

## The Android package, and what it adds

A signed `.apk`, on the releases page:
**<https://github.com/ontoplano/ontoplano/releases/latest>**. It is built for
app.ontoplano.com; running your own instance, build your own with
`make android`.

Same app, plus what Android reserves for installed apps:

- **The home-screen widget** — today's blocks, habits and tasks without opening
  anything.
- **Notifications arrive as Ontoplano** — its icon and its name, instead of a
  reminder dressed as your browser.

The app inside is the live one, so its features are always current; you only
download a new `.apk` when a release says the wrapper itself changed.

### Installing it

Android calls this "installing an unknown app", and it will ask you to allow it
once — for the browser you downloaded it with, not for Ontoplano.

1. Open the releases page above **on the phone** and download the `.apk`.
2. Open the downloaded file. Android asks whether to allow installs from this
   browser; say yes, and it returns you to the install screen.
3. Install, and open it once so it can sign you in.

If you already have the browser-installed version on your home screen, remove
that shortcut. Two icons for the same app, one of which has the widget, is
confusing in exactly the way a widget is meant to prevent.

### Adding the widget

1. Long-press an empty part of the home screen → **Widgets**.
2. Find **ontoplano** and drag **Today** onto the screen.
3. Its setup screen opens. Check the address — it is filled in with the instance
   the app was built for — and tap **Connect**.
4. Your browser opens, mints a key for this widget and hands it back. The widget
   appears with today on it.

**If step 4 does not come back** — the page sits there, or Android asks "Continue
to Ontoplano?" and lands you on the same page again — the link has been answered
by the app instead of by the widget. The page also shows the key: copy it, go
back to the widget's setup screen, paste it into **Or paste the key**, and tap
**Use this key**. That path needs no link and cannot be intercepted.

The key can read today's plan and nothing else. Revoke it any time under
**Settings → Integrations**; the widget goes blank rather than showing anything
stale.

<script>
/*
 * The wizard, as an enhancement.
 *
 * Without JavaScript every branch is on the page under its own heading, which
 * is a perfectly good document and the one GitHub renders. With it, the
 * branches that do not apply are hidden. Nothing is fetched and nothing is
 * stored: the answers live in the radio buttons and nowhere else.
 */
(function () {
  var form = document.querySelector('[data-wizard]');
  if (!form) return;

  var steps = Array.prototype.slice.call(document.querySelectorAll('[data-step]'));
  var note = document.querySelector('[data-wizard-note]');
  if (note) note.hidden = false;

  function answers() {
    var out = {};
    Array.prototype.forEach.call(form.querySelectorAll('input:checked'), function (input) {
      out[input.name] = input.value;
    });
    return out;
  }

  /* A step with no attribute for a question is shown whatever the answer is. */
  function matches(step, chosen) {
    return ['device', 'browser', 'where'].every(function (name) {
      var want = step.getAttribute('data-' + name);
      if (!want) return true;
      return want.split(' ').indexOf(chosen[name]) !== -1;
    });
  }

  function apply() {
    var chosen = answers();

    /* The browser question is meaningless on iOS, where there is one answer. */
    Array.prototype.forEach.call(form.querySelectorAll('[data-only]'), function (set) {
      set.hidden = set.getAttribute('data-only').split(' ').indexOf(chosen.device) === -1;
    });

    steps.forEach(function (step) {
      var show = matches(step, chosen);
      step.hidden = !show;
      /* The heading above a hidden block belongs to it. */
      var heading = step.querySelector('h3');
      if (heading) heading.hidden = !show;
    });
  }

  form.addEventListener('change', apply);
  apply();
})();
</script>
