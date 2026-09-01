<!-- title: On your phone -->
<!-- blurb: installing it as an app, what works offline, and the gesture that captures things -->

# On your phone

Ontoplano is a **progressive web app**. There is nothing to buy and no store to
go through: you install it from the browser, on any instance, and it behaves
like an app afterwards — its own icon, full screen, no address bar.

This works the same whether you use the hosted instance or one you run
yourself. The phone app is not a separate product and never has been; it is
this app, installed.

## Installing it

**Android (Chrome, Edge, Samsung Internet, Brave)**

1. Open your instance in the browser and sign in.
2. Menu (⋮) → **Add to Home screen** — or take the **Install** prompt if the
   browser offers one by itself.
3. Confirm. It appears in your launcher like anything else.

**iPhone and iPad (Safari)**

1. Open your instance in Safari. It has to be Safari — on iOS no other browser
   may install a web app.
2. Share (□↑) → **Add to Home Screen**.
3. Confirm.

**Desktop (Chrome, Edge)**

An install icon appears at the right-hand end of the address bar, which gives
you a window without browser chrome. Firefox and Safari on macOS have no
equivalent; the site works normally in a tab.

## What you get once it is installed

- **No address bar**, so the app has the whole screen.
- **Your own icon** in the launcher, and its own window in the switcher.
- **It opens offline.** The shell is cached, so a dead network gives you the
  app rather than a dinosaur.
- **The shopping list works with no signal at all** — tick things in the aisle
  and they settle when you are back on a network. That is the one that has to
  work in a supermarket basement.

## The gesture

Press and hold the **+** in the bottom bar and a wheel opens under your thumb,
one wedge per room: an idea, a todo, a note, something to buy. Slide onto the
one you want and let go. It is one thumb, without looking, which is the only
way anything gets captured while you are doing something else.

Tapping **+** instead opens the same wheel and leaves it open.

## If the install prompt never appears

Browsers only offer it over **HTTPS**, and only once they have fetched the
manifest and the service worker. A self-hosted instance on plain HTTP will not
be installable — that is the browser's rule, not this app's. Put a certificate
in front of it and the option appears.

On iOS, check you are in Safari: the Share menu in Chrome for iOS has no _Add
to Home Screen_.

## Is there an Android app in the Play Store?

Not at the moment, and it would be the same thing if there were: the store
build is this app in a thin wrapper. Installing from the browser costs nothing
and updates itself the moment the instance does.
