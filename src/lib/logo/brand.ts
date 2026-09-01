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

/**
 * The ground under the mark on an icon that needs one.
 *
 * Only the masked shapes do: a launcher crops a maskable icon to whatever
 * outline it likes, and iOS puts the apple-touch icon on an opaque tile
 * regardless. Everywhere else the mark is drawn on whatever is behind it, which
 * it is designed for — it carries its own dark field inside a bright rim, so it
 * holds up on a light page and on the app's dark bar without help.
 */
export const BRAND_GROUND = '#f7f5f1';

/**
 * The app's own chrome, and the colour a phone paints around the PWA.
 *
 * Deliberately NOT `BRAND_GROUND`: they were one value when the mark was a flat
 * shape on a dark tile, and they are two things — one is the ground under a
 * launcher icon, the other is the colour of the app's bar. `manifest.webmanifest`
 * and the `<meta name="theme-color">` in `app.html` carry this by hand, because
 * a JSON file and an HTML file cannot import it. If you change it, change those.
 */
export const CHROME_GROUND = '#111827';

/**
 * How much of a plain icon the mark fills.
 *
 * One: `mark.png` already carries about a tenth of itself as margin, which is
 * the right amount for an icon that is not going to be cropped.
 */
export const ICON_SCALE = 1;

/**
 * A maskable icon is cropped to whatever shape the launcher likes, so the mark
 * shrinks into the middle and the ring around it is ground the launcher is
 * welcome to eat. Android's safe zone is the middle 80% of the circle; this is
 * inside it.
 */
export const MASKABLE_SCALE = 0.81;

/**
 * iOS ignores the manifest and the safe zone both: it takes the apple-touch
 * icon whole and rounds its corners. So barely any margin, on the ground.
 */
export const APPLE_SCALE = 0.94;
