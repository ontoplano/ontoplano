/**
 * A reminder that arrives with the app shut, on a phone.
 *
 * On the web, an instance with a server wakes a phone over web push. Android's
 * web view has no Push API at all — no `PushManager`, whatever the instance
 * behind it can do — so inside this app that road is closed both ways: on a
 * phone-only instance there is no server to send one, and on a connected
 * instance there is nothing here to receive one. The app said so, and told
 * somebody already holding the app to "install it as an app".
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
import { inPhoneApp } from './instance-choice';

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
 * The mark, drawn as the one flat shape a status bar can show.
 *
 * Android takes the alpha channel of a small icon and throws the colours away,
 * so the launcher icon arrived in the status bar as a white blob. This is the
 * silhouette version — one octagon inside another — written into the project
 * by `scripts/brand-android.mjs` from the same outline everything else is
 * derived from.
 */
const NOTIFICATION_ICON = 'ic_stat_ontoplano';

/**
 * Android's notification ids are 32-bit signed, and ours are row ids that
 * start at 1 — so they map straight across, and the id is what lets a
 * reminder's alarm be found and cancelled later.
 */
const MAX_ID = 2 ** 31 - 1;

/** The plugin, if this is running inside the shell that carries it. */
export function phoneNotifications(): Notifications | null {
	if (!inPhoneApp()) return null;
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
	const notifications = phoneNotifications();
	if (!notifications) return 0;

	try {
		// Asked for, not demanded: a phone that has said no keeps saying no, and
		// the reminder still appears the next time the app is opened.
		const allowed = await notifications.checkPermissions();
		if (allowed.display !== 'granted') return 0;

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
				smallIcon: NOTIFICATION_ICON
			}))
		});
		return wanted.length;
	} catch {
		return 0;
	}
}

/**
 * What Android has already answered about notifications — or that we cannot ask.
 *
 * Four answers, and two of them are the interesting ones.
 *
 * **denied** on Android 13 and up means the dialog will never be shown again,
 * so a button that asks a second time does nothing at all and looks broken.
 * That case needs the settings screen instead, which is what
 * `openPhoneNotificationSettings` is for.
 *
 * **unreachable** is the app showing somebody else's instance. The shell
 * injects its bridge into its own origin and no further — that is why
 * `APP_USER_AGENT` exists at all — so a page served by a server is inside the
 * app and cannot see a single plugin. This used to come back as "denied",
 * which put "Android said no, and will not ask again" in front of somebody
 * whose phone says Allowed, under a button that could not open anything.
 * Nothing about the permission is knowable from here, and nothing about it is
 * the problem.
 */
export type PhonePermission = 'granted' | 'denied' | 'prompt' | 'unreachable';

export async function phonePermission(): Promise<PhonePermission> {
	const notifications = phoneNotifications();
	if (!notifications) return 'unreachable';
	try {
		const { display } = await notifications.checkPermissions();
		if (display === 'granted') return 'granted';
		// Capacitor answers 'prompt' and 'prompt-with-rationale' for "not asked
		// yet"; everything else is a refusal.
		return display.startsWith('prompt') ? 'prompt' : 'denied';
	} catch {
		return 'denied';
	}
}

/** The shell's own plugin — see `OntoplanoSettings.java`. */
type Settings = {
	openNotificationSettings(): Promise<void>;
	ringFor(what: { origin: string; token: string }): Promise<void>;
	stopRinging(): Promise<void>;
	ringingFor(): Promise<{ origin: string }>;
	syncReminders(): Promise<void>;
};

function shell(): Settings | null {
	if (!inPhoneApp()) return null;
	const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
	const found = capacitor?.Plugins?.OntoplanoSettings;
	return found ? (found as Settings) : null;
}

/**
 * Tell the phone to ring for an instance, with a key that instance made.
 *
 * The shell keeps both and does the rest on its own clock — see `Ringer.java`.
 * That is the whole point: a page cannot be relied on to be open, and this
 * arrangement does not need one.
 */
export async function ringFor(origin: string, token: string): Promise<boolean> {
	const settings = shell();
	if (!settings) return false;
	try {
		await settings.ringFor({ origin, token });
		return true;
	} catch {
		return false;
	}
}

/** Stop, and drop the key with it. */
export async function stopRinging(): Promise<boolean> {
	const settings = shell();
	if (!settings) return false;
	try {
		await settings.stopRinging();
		return true;
	} catch {
		return false;
	}
}

/** Which instance this phone rings for, or '' for none. */
export async function ringingFor(): Promise<string> {
	const settings = shell();
	if (!settings) return '';
	try {
		return (await settings.ringingFor()).origin ?? '';
	} catch {
		return '';
	}
}

/**
 * Ask the instance now rather than at the next standing refresh.
 *
 * Called when the app opens: somebody who wrote a reminder minutes ago and
 * closed the app expects that one to ring, and the refresh is hours apart.
 */
export async function syncRinger(): Promise<void> {
	await shell()
		?.syncReminders()
		.catch(() => undefined);
}

/**
 * Open this app's notification settings on the phone.
 *
 * The way back from a permission Android will not ask about again. Answers
 * whether the screen was actually opened, so the page can say something rather
 * than leaving a button that appears to do nothing — which is the failure this
 * whole path exists to undo.
 */
export async function openPhoneNotificationSettings(): Promise<boolean> {
	const settings = shell();
	if (!settings) return false;

	try {
		await settings.openNotificationSettings();
		return true;
	} catch {
		return false;
	}
}

/** How far ahead a test notification is booked: long enough to lock the
 * phone if you want to see it arrive outside the app, short enough to still
 * be about the button you just pressed. */
const TEST_DELAY_MS = 4000;

/** An id no reminder can have, so a test never cancels or shadows a real one. */
const TEST_ID = MAX_ID;

/**
 * Book one notification a few seconds out, so the whole chain can be seen to
 * work — permission, the plugin, Android actually showing it — without
 * setting a reminder and waiting a minute.
 */
export async function testPhoneNotification(): Promise<boolean> {
	const notifications = phoneNotifications();
	if (!notifications) return false;
	try {
		await notifications.schedule({
			notifications: [
				{
					id: TEST_ID,
					title: 'ontoplano',
					body: 'A test — reminders will look like this.',
					schedule: { at: new Date(Date.now() + TEST_DELAY_MS), allowWhileIdle: true },
					smallIcon: NOTIFICATION_ICON
				}
			]
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Ask Android for permission, and book what is already due once it is given.
 *
 * Returns whether it was granted, so the screen that asked can say what
 * happened rather than leaving somebody looking at an unchanged page.
 */
export async function askPhoneToNotify(): Promise<boolean> {
	const notifications = phoneNotifications();
	if (!notifications) return false;
	try {
		const asked = await notifications.requestPermissions();
		if (asked.display !== 'granted') return false;
		await scheduleDeviceReminders();
		return true;
	} catch {
		return false;
	}
}
