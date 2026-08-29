# Changelog

What changed for somebody using the app, newest first. One entry per
user-visible change, written when the change is made — the git log has the
rest. Versions follow `package.json`.

## 0.6.1 — 2026-08-29

- Changing pages no longer flashes dark — the cross-fade is gone; the new page
  takes a small step up instead.
- The phone's bottom bar can no longer scroll away, be pushed off, or vanish
  after a refresh: it is glued to the viewport.

## 0.6.0 — 2026-08-29

- Moving between pages cross-fades instead of blinking; the bars hold still
  while the page changes under them.
- Row hover fades in instead of snapping, and every filter toggle responds to
  the pointer like the buttons beside it.
- Fixed: in the rounded style, the account menu opened invisibly under a
  clipped header.
- The header search backs off a step at laptop widths so the navigation fits.

## 0.5.0 — 2026-08-29

- Hover feedback everywhere: buttons lift, list rows tint under the pointer,
  chips and inputs respond, nav tabs underline.
- Rounded style: filled headers and rows no longer poke square corners past a
  card's curve.
- The header search box uses the space a wide screen gives it.
- Page introductions carry a rule in the section's colour instead of floating
  bare on the background.
- Autofill is now off by default on every field, so the browser stops offering
  passwords and cards over task titles; sign-in fields still opt in.

## 0.4.0 — 2026-08-29

- The Android widget connects through the browser: one tap, no more pasting a
  token.
- Errors, notices and the staging band share one banner format; the staging
  copy is soberer.
- The save button no longer hides behind the phone keyboard on bottom-sheet
  forms.
- Plain text inputs stop inviting password and credit-card autofill.
- The admin page dropped its roles explainer text.

## 0.3.0 and earlier

Untracked — see the git log.
