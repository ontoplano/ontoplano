/**
 * The one place the brand's fixed values live.
 *
 * `mark.png` beside this file is the logo itself, and it is the only copy —
 * `yarn icons` redraws the favicon, the PWA icons and the apple-touch icon from
 * it, and `Logo.svelte` draws it in the app. Replace that file, run `yarn
 * icons`, and everything follows.
 *
 * It is a raster because that is what the artwork is. The one rule for whatever
 * replaces it: square, transparent, at least 1024px, and with the mark drawn
 * roughly edge to edge — the margins below are added here so that each icon
 * gets the one it needs rather than a single margin baked in and then counted
 * twice.
 */

/*
 * There is no separate ground colour for an icon.
 *
 * The masked shapes need one — a launcher crops a maskable icon to whatever
 * outline it likes, and iOS puts the apple-touch icon on an opaque tile
 * regardless — and it is the mark's own field, `MARK_FIELD`, measured off the
 * artwork by `yarn icons`. It used to be a cream of its own, which put the
 * ring's colours on nothing and made the app's tile the one white thing on a
 * home screen. `build-icons.mjs` and `brand-android.mjs` both read the measured
 * value; nothing here declares a second answer to "what is the dark behind the
 * mark".
 */

/**
 * The app's own chrome, and the colour a phone paints around the PWA.
 *
 * Deliberately not the mark's field: one is the dark inside the drawing, the
 * other is the colour of the app's bar, and they are two decisions that happen
 * to look alike. `manifest.webmanifest` and the `<meta name="theme-color">` in
 * `app.html` carry this by hand, because a JSON file and an HTML file cannot
 * import it. If you change it, change those.
 */
export const CHROME_GROUND = '#111827';

/**
 * How much of a plain icon the mark fills.
 *
 * One. `make icon` normalises the artwork so the mark reaches the edges of its
 * own file, which means a plain icon — never cropped, never masked — is the
 * mark and nothing else. Every scale below is a fraction of a mark that fills
 * its square, so they are the whole story about margin; there is none hiding in
 * the file any more.
 */
export const ICON_SCALE = 1;

/**
 * A maskable icon is cropped to whatever shape the launcher likes, so the mark
 * shrinks into the middle and the ring around it is ground the launcher is
 * welcome to eat.
 *
 * How much ring, in one number — raise it and the mark grows, lower it and the
 * ring does. What the numbers mean:
 *
 * The safe zone is the middle 80% of the width, as a circle. A mark with
 * corners has to fit inside that circle, not inside the square around it: the
 * octagon's corners sit at 1/cos(22.5°) — about 1.082 — of half its width from
 * the centre. So **0.74** is the largest scale whose corners are still inside
 * the circle, landing them on it exactly, and any launcher shape at all leaves
 * the mark whole.
 *
 * It sat at 0.9 for a while, which is past that on purpose: the squircle is
 * the shape Android actually draws, and a thinner ring looked better than one
 * sized for a circle nobody was cutting. What it actually looked like was an
 * octagon with its flat edges a few pixels off the edge of the file — so this
 * is back on the arithmetic, where every launcher shape leaves the mark whole
 * and the ring is wide enough to read as a ring.
 *
 * There is no second icon for the cropped case to reach for: an adaptive icon
 * is one foreground and the launcher masks it however it likes, so the choice
 * here is a single number for every shape.
 *
 * Android's legacy launcher icon uses this number too. Nothing masks that one
 * — a launcher older than adaptive icons draws it whole — so it needs a margin
 * of its own rather than one borrowed from a mask, which is the same job this
 * does. It was handed the plain icon instead, which by `ICON_SCALE` reaches
 * the edges of its own file, so the mark went to the very edge of the tile
 * with nothing around it. See `scripts/brand-android.mjs`.
 */
export const MASKABLE_SCALE = 0.74;

/**
 * iOS ignores the manifest and the safe zone both: it takes the apple-touch
 * icon whole and rounds its corners. So barely any margin, on the ground —
 * enough that the rounding does not clip the mark's own corners.
 */
export const APPLE_SCALE = 0.86;

/**
 * The opaque icon a store wants, with room around the mark.
 *
 * Nothing crops this one — a listing draws it as given, sometimes rounded,
 * sometimes square — so the margin has to be in the picture rather than
 * borrowed from a mask. At `ICON_SCALE` the ring ran off all four edges, which
 * reads as a crop of a bigger drawing rather than as a mark on a tile. This is
 * a little tighter than the apple-touch icon, because that one is rounded by
 * iOS and this one may not be rounded at all.
 */
export const SOLID_SCALE = 0.82;

/**
 * How much colour is left in a mark that has been drained of it.
 *
 * The same mark, nearly black and white — recognisably this app and
 * unmistakably not the ordinary copy of it. The dev and staging icons have
 * worn it since there were two builds on one phone, and the instance that runs
 * on the device itself wears it in the app for the same reason: somebody can
 * have both open, and two identical marks is a bad way to find out which week
 * you have been writing into.
 *
 * Not zero. A flat grey mark reads as a disabled one; a trace of colour left in
 * reads as the mark with the lights off.
 *
 * One number, because two worlds have to agree on it: `scripts/build-icons.mjs`
 * bakes it into the icons as an SVG colour matrix, and the app applies it in
 * CSS. They mean the same thing and nothing would catch them drifting.
 */
export const MARK_DRAINED = 0.15;

/**
 * How far the mark's own dark is lifted for that same copy.
 *
 * Draining takes the colour out of the ring and leaves the field exactly as
 * dark as it was, which is fine for a mark whose middle is a bright medallion
 * and poor for one whose middle is mostly field: at the forty-eight pixels a
 * launcher draws, the drained icon reads as a black disc with a grey edge. So
 * the field is lifted towards white by this much wherever the mark is drained
 * — the dev and staging icons, the wheel in the instance that runs on the
 * device, the chooser — and the drawing stays legible instead of closing up.
 *
 * A fraction of the way to white rather than a second hex, so it follows the
 * artwork: `yarn icons` measures the field off `mark.png`, applies this, and
 * writes the answer into `mark-shape.ts` as `MARK_FIELD_LIFTED`. One number to
 * turn, and the icons and the app cannot disagree about it.
 *
 * Slight on purpose. Far enough that the middle stops reading as a hole, near
 * enough that it is still the same mark with the lights off rather than a
 * second colourway.
 */
export const MARK_FIELD_LIFT = 0.12;

/**
 * The colour Android tints a notification with, and the drained version of it.
 *
 * Android throws the colours away from a notification's small icon and keeps
 * only its alpha, so the mark in the status bar is a white silhouette whatever
 * it is drawn in — which means a black-and-white icon for the instance that
 * runs on the device would be identical to the ordinary one. What the system
 * *does* take a colour for is the accent beside the notification, and that is
 * where the two can differ, wearing the same difference they already wear on
 * the home screen: the mark with the lights off.
 *
 * Blue because it is what the app's own controls are; drained by the same
 * `MARK_DRAINED` the icons use, so there is one answer to "how much colour is
 * left" rather than a second hex nobody would think to keep in step.
 */
export const NOTIFICATION_ACCENT = '#1d4ed8';

/**
 * A colour with most of its colour taken out, the way the icons do it.
 *
 * The same arithmetic as an SVG `feColorMatrix type="saturate"`: each channel
 * moves towards the luminance of the whole by `1 - amount`. Done here rather
 * than by the browser because the answer has to be a hex — it is handed to
 * Android, which has no filters.
 */
export function drainedHex(hex: string, amount = MARK_DRAINED): string {
	const channel = (at: number) => parseInt(hex.slice(at, at + 2), 16);
	const [r, g, b] = [channel(1), channel(3), channel(5)];
	const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	const mix = (c: number) => Math.round(grey + (c - grey) * amount);
	return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** The accent an instance running on the device itself wears. */
export const NOTIFICATION_ACCENT_ISOLATED = drainedHex(NOTIFICATION_ACCENT);

/**
 * How much of an Android adaptive icon's foreground layer the mark fills.
 *
 * Stricter than the web's maskable, and a different asset for that reason: the
 * foreground is 108dp of which the launcher shows 72 and guarantees 66.
 *
 * Measured against the 72 it shows, the same 1.082 arithmetic allows 0.616,
 * and 0.6 was just under that — which is why the octagon arrived with its flat
 * edges against the sides of the squircle. Measured against the 66 it
 * *guarantees*, the limit is 0.565.
 *
 * This is below both, and the difference is not arithmetic: an icon drawn to
 * the edge of what it is allowed has no margin, and a launcher icon with no
 * margin reads as a picture of an octagon rather than as an icon. Rendered
 * through the squircle at 0.60, 0.56, 0.52 and 0.48, this is the one where the
 * ring around the mark is even and the mark is still the size of the tile.
 */
export const ADAPTIVE_FOREGROUND_SCALE = 0.52;
