/**
 * How far ahead a reminder has to be set, and why that is a number at all.
 *
 * A reminder made on a phone is booked with Android the moment it is saved. A
 * reminder made in a browser is delivered by the server's own sweep, which
 * runs every minute. Both of those honour any time you give them.
 *
 * The case that cannot is the app pointed at a server: the page it is showing
 * belongs to that server, and the shell's bridge reaches only the copy the
 * phone carries — so nothing on that page can hand the alarm to Android. The
 * phone finds out by asking, on its own clock, and this is that clock. Until
 * it asks, a reminder made there does not exist as far as the phone is
 * concerned.
 *
 * The alternative to a floor was a push channel, and each costs somebody
 * something: Firebase costs the build its independence from Play services,
 * which is what lets F-Droid ship it; UnifiedPush costs the person a second
 * app to install before their reminders work properly. Refusing to promise
 * what cannot be kept is the cheaper honesty.
 *
 * **This is the same fact as the phone's polling interval**, not a number that
 * happens to match it — `REFRESH_MS` in `Ringer.java`. Change one and the
 * other has to move, which is why `scripts/check-reminder-window.mjs` fails
 * the lint when they disagree: nothing type-checks across the gap between
 * TypeScript and Java, and a floor that no longer matches the poll is a
 * promise the phone cannot keep.
 */
export const REMINDER_LEAD_MINUTES = 15;

/** The same, in the units a clock deals in. */
export const REMINDER_LEAD_MS = REMINDER_LEAD_MINUTES * 60 * 1000;
