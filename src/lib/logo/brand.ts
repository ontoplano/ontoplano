/**
 * The one place the brand's fixed values live.
 *
 * `mark.svg` beside this file is the logo itself. These are the values that
 * are about the logo but cannot live inside it: the ground the icon files are
 * drawn on, and how much of a maskable icon Android is allowed to crop.
 *
 * The manifest's `background_color` and `theme_color`, and the `<meta
 * name="theme-color">` in `app.html`, are the same colour by hand — a JSON
 * file and an HTML file cannot import this. If you change it, change those.
 */

/** The ground under the mark on every generated icon. */
export const BRAND_GROUND = '#111827';

/**
 * How much of a generated icon the mark fills.
 *
 * `mark.svg` carries no margin of its own, so that the app can draw it at the
 * size it asks for rather than at half of it. An icon needs the margin, so it
 * is added here — one number rather than a border baked into the artwork.
 */
export const ICON_SCALE = 0.5;

/**
 * A maskable icon is cropped to whatever shape the launcher likes, so the mark
 * shrinks further into the middle and the ring around it is background the
 * launcher is welcome to eat. On top of ICON_SCALE, not instead of it.
 */
export const MASKABLE_SCALE = 0.72;
