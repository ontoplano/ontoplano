/*
 * The reminder channel's name, on its own and importing nothing.
 *
 * Three things need this string and they are in three worlds: this app, the
 * shell's `Ringer.java`, and the Playwright suite that watches what the app
 * books. The suite runs outside SvelteKit, so it cannot resolve `$app` or
 * `$lib` — reaching the constant through `phone-notifications.ts` pulled in
 * the whole isolated-mode module behind it and stopped the entire run from
 * loading, not just the one test.
 *
 * A file with no imports can be read from anywhere by a relative path, which
 * is what makes one source of truth possible here at all.
 */
/**
 * The channel a reminder arrives on, and why it is named here as well as in
 * the shell.
 *
 * Android decides whether a notification makes a noise from its *channel*, not
 * from the notification: a channel made at the default importance posts
 * silently however loudly the notification asks. The shell's own ringer — the
 * half that fires for an instance with a server — makes this one at
 * `IMPORTANCE_HIGH`, so those ring. The half that books the alarms for an
 * instance on the phone said nothing about a channel at all, so it landed on
 * the plugin's default one and arrived in silence: the notification appeared,
 * and the sound only played later, out of the page, when the app was opened.
 *
 * One channel for both halves, so it rings either way and so somebody
 * silencing reminders silences reminders rather than half of them.
 * `Ringer.java` holds the same string; `tests/reminder-channel.test.ts` is
 * what stops the two drifting.
 */
export const REMINDER_CHANNEL = 'ontoplano-reminders-audible';

/**
 * Channels this app has used before, to be deleted rather than left behind.
 *
 * A channel's importance is fixed when it is made. Android ignores every field
 * you pass after the first time, deliberately — the sound and whether it may
 * interrupt are the person's settings from then on, not the app's. So the
 * first `ontoplano-reminders` a phone ever made is the one it keeps, and the
 * phones that made theirs before the importance was set right have been
 * posting reminders silently ever since with no way for this code to raise
 * them. The reminder arrived; it just never made a sound unless the app
 * happened to be open, which is the half that plays its own.
 *
 * A new id is the only way to hand those phones a channel at the right
 * importance, and the old one is deleted so nobody is left with two rows
 * called Reminders in their notification settings, one of them dead.
 */
export const RETIRED_CHANNELS = ['ontoplano-reminders'];
