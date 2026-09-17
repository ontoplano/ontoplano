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
import type { Translate } from './i18n/core.js';
import { REMINDER_CHANNEL, RETIRED_CHANNELS } from './reminder-channel.js';
import { inPhoneApp } from './instance-choice';
import { isIsolated } from './isolated/mode';
import { NOTIFICATION_ACCENT, NOTIFICATION_ACCENT_ISOLATED } from './logo/brand';

/** How a reminder comes back from `/api/reminders?upcoming`. */
type Upcoming = {
	id: number;
	/** A wall clock in the account's zone — for showing, not for booking. */
	remindAt: string;
	/** The moment itself, ISO-8601 in UTC. This is what an alarm is set to. */
	at: string;
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
	createChannel(what: {
		id: string;
		name: string;
		importance: number;
		description?: string;
	}): Promise<void>;
	deleteChannel(what: { id: string }): Promise<void>;
};

/*
 * Re-exported, so that everything already reaching for these through this
 * module still finds them — the shell's half, and the tests.
 */
export { REMINDER_CHANNEL, RETIRED_CHANNELS };

/** Android's `IMPORTANCE_HIGH`: it makes a sound and it can peek. */
const CHANNEL_IMPORTANCE = 5;

/**
 * Make sure the channel exists before anything is booked onto it.
 *
 * A notification posted to a channel that does not exist is one Android drops
 * without a word. Creating one that is already there changes nothing — the
 * system ignores every field after the first time, which is also why the
 * importance cannot be raised later by editing this.
 */
async function ensureChannel(notifications: Notifications, t: Translate): Promise<void> {
	for (const old of RETIRED_CHANNELS) {
		try {
			await notifications.deleteChannel({ id: old });
		} catch {
			// Never made one, or a shell without the call.
		}
	}
	try {
		await notifications.createChannel({
			id: REMINDER_CHANNEL,
			// The same two the shell's own channel is named with, so the one
			// channel reads the same whichever half got there first.
			// `scripts/brand-android.mjs` writes them into `values-*/`.
			name: t('android.remindersChannel'),
			importance: CHANNEL_IMPORTANCE,
			description: t('android.remindersChannelWhat')
		});
	} catch {
		// An older shell without the call, or a platform with no channels.
	}
}

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
 * Which ontoplano this came from, said in the only place Android will hear it.
 *
 * Both instances can be open on one phone, and a notification that does not
 * say which one it is about is a notification you have to open to find out.
 * The obvious answer — a different icon for the copy on the device — is not
 * available: Android keeps only the alpha channel of a small icon and throws
 * the colours away, so the mark is a white silhouette either way and a
 * black-and-white version of it would be the same picture.
 *
 * The accent is the one colour the system does take, so it carries the
 * difference the two already wear on the home screen: the ordinary blue, or
 * the same blue with the lights off. See `MARK_DRAINED`.
 */
const accent = () => (isIsolated() ? NOTIFICATION_ACCENT_ISOLATED : NOTIFICATION_ACCENT);

/**
 * Android's notification ids are 32-bit signed, and ours are row ids that
 * start at 1 — so they map straight across, and the id is what lets a
 * reminder's alarm be found and cancelled later.
 */
const MAX_ID = 2 ** 31 - 1;

/**
 * How many alarms are handed to the system at once.
 *
 * Android takes as many as it is given. iOS does not — sixty-four pending
 * local notifications is a hard cap there, and the sixty-fifth silently
 * replaces one — so the window is bounded here rather than at whichever
 * platform happens to complain first. The list is the soonest ones, and the
 * app tops it up every time it is opened, which is the shape both platforms
 * need anyway.
 */
const BOOKABLE_AT_ONCE = 60;

/**
 * What was last handed to the system, so an unchanged list costs nothing.
 *
 * Not persisted: it describes the alarms *this page* booked, and a fresh page
 * has no idea what the system is holding — so it starts null and the first
 * pass books, which is the safe direction to be wrong in.
 */
let booked: string | null = null;

/**
 * Say that the alarms may have moved, so the next pass really looks.
 *
 * Called by anything that changes a reminder. The pass is cheap when nothing
 * has changed — it compares a fingerprint — and this is what makes the
 * comparison ask the server again rather than trust what it last saw.
 */
export function alarmsMayHaveChanged(): void {
	booked = null;
}

/** The plugin, if this is running inside the shell that carries it. */
export function phoneNotifications(): Notifications | null {
	if (!inPhoneApp()) return null;
	const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
	const found = capacitor?.Plugins?.LocalNotifications;
	return found ? (found as Notifications) : null;
}

/**
 * Book them, exactly if Android allows it and late if it does not.
 *
 * An exact alarm needs `SCHEDULE_EXACT_ALARM` from Android 12 on, and this app
 * deliberately does not ask for it — asking is a promise about what the app is
 * for, and that belongs to whoever ships it. So the request throws, and the
 * shell's own ringer has always caught that and booked an inexact alarm
 * instead: late rather than silent.
 *
 * This half did not. It asked for `allowWhileIdle`, the plugin threw, the
 * catch around the whole thing swallowed it and answered "nothing to book" —
 * so on a phone that is its own instance, *no reminder ever arrived* and
 * nothing anywhere said why. The same fallback, in the same words.
 *
 * @param what the notifications, with `at` instead of a `schedule`
 */
async function book(
	notifications: Notifications,
	what: ({ at: Date } & Record<string, unknown>)[]
): Promise<void> {
	const withSchedule = (allowWhileIdle: boolean) =>
		what.map(({ at, ...rest }) => ({ ...rest, schedule: { at, allowWhileIdle } }));

	try {
		await notifications.schedule({ notifications: withSchedule(true) });
	} catch {
		await notifications.schedule({ notifications: withSchedule(false) });
	}
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
export async function scheduleDeviceReminders(t: Translate): Promise<number> {
	const notifications = phoneNotifications();
	if (!notifications) return 0;

	try {
		// Asked for, not demanded: a phone that has said no keeps saying no, and
		// the reminder still appears the next time the app is opened.
		const allowed = await notifications.checkPermissions();
		if (allowed.display !== 'granted') return 0;

		await ensureChannel(notifications, t);

		const answer = await fetch('/api/reminders?upcoming=1');
		if (!answer.ok) return 0;
		const { upcoming } = (await answer.json()) as { upcoming: Upcoming[] };

		/*
		 * `at`, not `remindAt`: see the note on `upcomingReminders`. Parsing
		 * the wall clock here read it in the *device's* zone, which is the
		 * account's zone only by luck.
		 */
		const wanted = upcoming
			.filter((r) => r.id > 0 && r.id <= MAX_ID && Date.parse(r.at) > Date.now())
			.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
			.slice(0, BOOKABLE_AT_ONCE);

		/*
		 * Nothing to do when nothing has moved.
		 *
		 * This runs whenever the app is opened, whenever it comes back, and on
		 * every poll — so most calls are answering "are these still the right
		 * alarms?" with "yes". Cancelling and rebooking every one of them to
		 * find that out is a burst of work against the system's alarm table for
		 * no change at all, and it used to happen on every one of those.
		 *
		 * Booking is otherwise cancel-then-book because there is no partial
		 * edit: the plugin takes a list, and a reminder that moved has to lose
		 * its old time before it gains a new one.
		 */
		const fingerprint = wanted.map((r) => `${r.id}@${r.at}${r.audible ? '!' : ''}`).join(',');
		if (fingerprint === booked) return wanted.length;

		const pending = await notifications.getPending();
		if (pending.notifications.length > 0) await notifications.cancel(pending);

		if (wanted.length === 0) {
			booked = fingerprint;
			return 0;
		}

		await book(
			notifications,
			wanted.map((reminder) => ({
				id: reminder.id,
				title: t('app.ontoplano2'),
				body: reminder.message,
				at: new Date(reminder.at),
				// Silent ones are still worth showing; what `audible` decides is
				// whether the phone makes a noise about it.
				sound: reminder.audible ? undefined : null,
				smallIcon: NOTIFICATION_ICON,
				iconColor: accent(),
				channelId: REMINDER_CHANNEL
			}))
		);
		booked = fingerprint;
		return wanted.length;
	} catch {
		// Whatever went wrong, the next pass should try again rather than
		// believe the last fingerprint still describes the system's alarms.
		booked = null;
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
	ringerStatus(): Promise<Partial<RingerStatus>>;
	openExactAlarmSettings(): Promise<void>;
};

/**
 * What the phone knows about whether it will ring — every link in the chain.
 *
 * All of it is read off the shell; see `Ringer.status` for why each one is
 * worth asking. Millisecond stamps rather than dates because they cross the
 * bridge as numbers, and 0 for "never" / "nothing".
 */
export type RingerStatus = {
	/** The instance this phone rings for, or '' if it has not been set up. */
	ringingFor: string;
	/** When it last asked that instance what was coming. */
	lastLookAt: number;
	/** Whether that attempt worked. */
	lastLookWorked: boolean;
	/** One word about why it did not, when it did not. */
	trouble: string;
	/** When it will ask again — which bounds how stale `booked` can be. */
	nextLookAt: number;
	/** How many alarms are on this phone right now. */
	booked: number;
	/** When the first of them is due. */
	nextRingAt: number;
	/** Whether Android lets this book an alarm at a minute rather than near one. */
	exactAllowed: boolean;
	/** Whether the channel they are posted to still makes a sound. */
	channelAudible: boolean;
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
 * Everything the phone will say about whether a reminder will reach it.
 *
 * `null` where there is no shell to ask — a browser, or a build older than the
 * call — which the page shows as nothing rather than as a row of zeroes
 * claiming nothing is booked.
 */
export async function ringerStatus(): Promise<RingerStatus | null> {
	const settings = shell();
	if (!settings) return null;
	try {
		const said = await settings.ringerStatus();
		// An older shell answers with an empty object rather than failing, so
		// the absence of the one field every answer carries is the test.
		if (typeof said?.ringingFor !== 'string') return null;
		return {
			ringingFor: said.ringingFor,
			lastLookAt: Number(said.lastLookAt ?? 0),
			lastLookWorked: Boolean(said.lastLookWorked),
			trouble: String(said.trouble ?? ''),
			nextLookAt: Number(said.nextLookAt ?? 0),
			booked: Number(said.booked ?? 0),
			nextRingAt: Number(said.nextRingAt ?? 0),
			exactAllowed: said.exactAllowed !== false,
			channelAudible: said.channelAudible !== false
		};
	} catch {
		return null;
	}
}

/** The system screen that grants booking an alarm at a minute. */
export async function openExactAlarmSettings(): Promise<void> {
	await shell()
		?.openExactAlarmSettings()
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
export async function testPhoneNotification(t: Translate): Promise<boolean> {
	const notifications = phoneNotifications();
	if (!notifications) return false;
	try {
		await ensureChannel(notifications, t);
		await book(notifications, [
			{
				id: TEST_ID,
				title: t('app.ontoplano2'),
				body: t('phone.aTestRemindersWillLook'),
				at: new Date(Date.now() + TEST_DELAY_MS),
				smallIcon: NOTIFICATION_ICON,
				// A test is only worth pressing if it looks — and sounds — like
				// the real thing, and is booked the way a real one is.
				iconColor: accent(),
				channelId: REMINDER_CHANNEL
			}
		]);
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
export async function askPhoneToNotify(t: Translate): Promise<boolean> {
	const notifications = phoneNotifications();
	if (!notifications) return false;
	try {
		const asked = await notifications.requestPermissions();
		if (asked.display !== 'granted') return false;
		await scheduleDeviceReminders(t);
		return true;
	} catch {
		return false;
	}
}
