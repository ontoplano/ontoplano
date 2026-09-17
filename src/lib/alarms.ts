/**
 * "A reminder changed" — said once, heard by whatever books the alarms.
 *
 * The thing that books alarms with the phone lives in the shell, and the
 * things that change reminders are pages: the reminders room, the capture
 * wheel, an assistant writing over the API and the page finding out. None of
 * them can reach into the shell, and the shell cannot watch a table it does
 * not load.
 *
 * So they say it out loud. A window event rather than a store, because the
 * listener and the callers are in different parts of the tree and this is
 * exactly what an event is for — and because missing one is survivable: the
 * shell re-checks on a beat anyway, so this is the difference between ringing
 * a second from now and ringing within the minute.
 */
export const ALARMS_CHANGED = 'ontoplano:alarms-changed';

/** Say that something about the coming reminders has moved. */
export function alarmsChanged(): void {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new CustomEvent(ALARMS_CHANGED));
}
