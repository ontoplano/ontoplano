/**
 * A reminder that arrives with the app shut, on an instance that is a phone.
 *
 * An instance with a server behind it wakes a phone over web push: the job
 * that notices a reminder is due sends one, and the phone rings whether or not
 * ontoplano is open. A phone that *is* the instance has no such job and nothing
 * to be woken by — the only thing that knows the reminder exists is the
 * database sitting in this device's own storage, and nothing reads it while the
 * app is closed.
 *
 * So the app books the alarms with Android before it goes away. Every time it
 * opens it hands the next few weeks of reminders to the system, which fires
 * them on its own clock. That is what makes "reminders still arrive" true of
 * the isolated instance, and it is the honest version of it: something has to
 * have opened the app since the reminder was made.
 *
 * Rescheduled from scratch each time rather than diffed. A reminder that was
 * dismissed, moved or deleted has to stop ringing, and working out which of
 * Android's pending alarms corresponds to a row that no longer exists is a
 * bookkeeping problem with no upside — cancelling everything this app booked
 * and booking it again is one call each and cannot drift.
 */
import { isIsolatedBuild } from './mode';

/** How a reminder comes back from `/api/reminders?upcoming`. */
type Upcoming = {
	id: number;
	remindAt: string;
	message: string;
	audible: boolean;
};

/**
 * The slice of Android's notification plugin this uses.
 *
 * Reached through the bridge the native layer injects rather than imported
 * from npm, because the plugin is a dependency of the shell in `capacitor/`
 * and not of the app: the shell is what installs the native half of it, and
 * adding the same package to the app's own `package.json` so that an import
 * resolves would be one version number in two files with nothing checking
 * they agree. The types are here because they are the contract this file
 * uses, not the plugin's whole surface.
 */
type Notifications = {
	checkPermissions(): Promise<{ display: string }>;
	requestPermissions(): Promise<{ display: string }>;
	getPending(): Promise<{ notifications: { id: number }[] }>;
	cancel(what: { notifications: { id: number }[] }): Promise<void>;
	schedule(what: { notifications: unknown[] }): Promise<unknown>;
};

/**
 * Android's notification ids are 32-bit signed, and ours are row ids that
 * start at 1 — so they map straight across, and the id is what lets a
 * reminder's alarm be found and cancelled later.
 */
const MAX_ID = 2 ** 31 - 1;

/** The plugin, if this is running inside the shell that carries it. */
function plugin(): Notifications | null {
	if (!isIsolatedBuild()) return null;
	const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
	const found = capacitor?.Plugins?.LocalNotifications;
	return found ? (found as Notifications) : null;
}

/**
 * Hand the next few weeks of reminders to the system.
 *
 * Quiet about every failure: a phone that refuses the permission, a browser
 * with no such plugin, a device that will not take any more alarms. The app
 * still shows the reminder when it is next opened — that path is the same one
 * every instance uses — so nothing here is the only thing standing between
 * somebody and their reminder.
 */
export async function scheduleDeviceReminders(): Promise<number> {
	const notifications = plugin();
	if (!notifications) return 0;

	try {
		const allowed = await notifications.checkPermissions();
		if (allowed.display !== 'granted') {
			const asked = await notifications.requestPermissions();
			if (asked.display !== 'granted') return 0;
		}

		// Everything this app booked before, so a reminder that has since been
		// dismissed or moved does not ring at its old time.
		const pending = await notifications.getPending();
		if (pending.notifications.length > 0) await notifications.cancel(pending);

		const answer = await fetch('/api/reminders?upcoming=1');
		if (!answer.ok) return 0;
		const { upcoming } = (await answer.json()) as { upcoming: Upcoming[] };

		const wanted = upcoming.filter(
			(r) => r.id > 0 && r.id <= MAX_ID && Date.parse(r.remindAt) > Date.now()
		);
		if (wanted.length === 0) return 0;

		await notifications.schedule({
			notifications: wanted.map((reminder) => ({
				id: reminder.id,
				title: 'ontoplano',
				body: reminder.message,
				schedule: { at: new Date(reminder.remindAt), allowWhileIdle: true },
				// Silent ones are still worth showing; what `audible` decides is
				// whether the phone makes a noise about it.
				sound: reminder.audible ? undefined : null,
				smallIcon: 'ic_launcher_foreground'
			}))
		});
		return wanted.length;
	} catch {
		return 0;
	}
}
