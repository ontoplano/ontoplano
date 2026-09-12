/**
 * Numbers an instance starts with when nobody has said otherwise.
 *
 * One source for two readers: the server's config parser uses these as the
 * fallback for a config.toml that does not name them, and an isolated instance —
 * which has no config.toml at all — serves them directly. A default that
 * lived in both places would drift the day one of them is edited.
 */

/** Seconds a delete waits, undoably, before it happens. */
export const DEFAULT_UNDO_SECONDS = 5;

/** The biggest single picture an instance accepts, in kilobytes. */
export const DEFAULT_PICTURE_KILOBYTES = 500;
