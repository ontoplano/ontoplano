/**
 * @vitest-environment happy-dom
 */
/**
 * What the app hands Android's alarm clock, and what it never does.
 *
 * `scheduleDeviceReminders` stands between the reminders table and a phone's
 * notification schedule, and everything it filters exists because Android
 * would misbehave without it: an id past 2³¹ wraps, a reminder in the past
 * fires the moment it is booked, and an alarm not cancelled first belongs to
 * a row that may no longer exist. None of that is visible in a browser, so
 * this is the place it is held.
 */
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { translatorFor } from '../src/lib/i18n/core.js';
import type { Translate } from '../src/lib/i18n/core.js';

/*
 * The real catalogue, not a stub that answers anything.
 *
 * What a notification is titled goes through the translator, and a stub that
 * echoes its argument would pass just as happily on a key nobody ever wrote a
 * message for — which is the exact bug this is here to catch.
 */
let t: Translate;
beforeAll(async () => {
	t = await translatorFor('en');
});

/*
 * The build's own declared settings, which there are none of here.
 *
 * `$env/dynamic/public` is a virtual module SvelteKit fills in: in the browser
 * it reads what the server stamped onto the page, and in a bare happy-dom
 * document there is no such stamp — importing it throws before a single test
 * runs. This file reaches it through `isIsolated`, which decides whether a
 * notification goes out in ontoplano's blue or in the drained version the copy
 * on the device wears. Empty is the honest answer for a test: no build flags,
 * so not the isolated build.
 */
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { APP_USER_AGENT } from '../src/lib/instance-choice';
import {
	REMINDER_CHANNEL,
	phonePermission,
	ringFor,
	ringingFor,
	scheduleDeviceReminders,
	stopRinging,
	testPhoneNotification
} from '../src/lib/phone-notifications';

/** Pretend to be inside the phone app, with whatever plugins are given. */
function inTheApp(plugins: Record<string, unknown>) {
	Object.defineProperty(navigator, 'userAgent', {
		value: `Mozilla/5.0 (Linux; Android 14) ${APP_USER_AGENT}`,
		configurable: true
	});
	(globalThis as { Capacitor?: unknown }).Capacitor = { Plugins: plugins };
}

/** The plugin as the shell injects it, remembering what it was asked. */
function notificationPlugin(display = 'granted', pending: { id: number }[] = []) {
	const state = {
		cancelled: [] as { id: number }[],
		booked: [] as {
			id: number;
			title?: string;
			body?: string;
			sound?: string | null;
			channelId?: string;
			schedule: { at: Date };
		}[],
		channels: [] as { id: string; importance: number; name?: string; description?: string }[]
	};
	const plugin = {
		checkPermissions: async () => ({ display }),
		requestPermissions: async () => ({ display }),
		getPending: async () => ({ notifications: pending }),
		cancel: async (what: { notifications: { id: number }[] }) => {
			state.cancelled.push(...what.notifications);
		},
		schedule: async (what: { notifications: (typeof state.booked)[number][] }) => {
			state.booked.push(...what.notifications);
		},
		createChannel: async (what: { id: string; importance: number }) => {
			state.channels.push(what);
		}
	};
	return { plugin, state };
}

function upcoming(reminders: unknown[]) {
	vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ upcoming: reminders }) }));
}

afterEach(() => {
	delete (globalThis as { Capacitor?: unknown }).Capacitor;
	// And back out of the app, so the browser cases really are in a browser.
	Object.defineProperty(navigator, 'userAgent', {
		value: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0',
		configurable: true
	});
	vi.unstubAllGlobals();
});

/*
 * A row in the shape the wire really has.
 *
 * `at` is the instant an alarm is set to; `remindAt` is the account's wall
 * clock, which is for showing. They are deliberately different here — reading
 * the wrong one is the bug this shape exists because of, and fixtures where
 * both say the same thing would not notice it.
 */
const due = (at: Date) => ({
	at: at.toISOString(),
	remindAt: new Date(at.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 19)
});
const soon = () => due(new Date(Date.now() + 60 * 60 * 1000));

describe('what gets booked', () => {
	test('cancels what it booked before, then books what is still to come', async () => {
		const { plugin, state } = notificationPlugin('granted', [{ id: 7 }, { id: 9 }]);
		inTheApp({ LocalNotifications: plugin });
		upcoming([
			{ id: 1, ...soon(), message: 'stretch', audible: true },
			// Already gone off: booking it would make the phone ring right now
			// about something that is over.
			{
				id: 2,
				...due(new Date(Date.now() - 60_000)),
				message: 'past',
				audible: true
			},
			// Android's ids are 32-bit signed; a row id past that wraps into
			// somebody else's notification.
			{ id: 2 ** 31, ...soon(), message: 'too big', audible: true },
			{ id: 3, ...soon(), message: 'quietly', audible: false }
		]);

		const booked = await scheduleDeviceReminders(t);

		expect(state.cancelled.map((n) => n.id)).toEqual([7, 9]);
		expect(booked).toBe(2);
		expect(state.booked.map((n) => n.id)).toEqual([1, 3]);
	});

	/*
	 * A notification's words go out through Android, where nothing renders
	 * them and nobody can correct them.
	 *
	 * This caught the real thing: the sweep that made the app translatable
	 * turned the title into a message key and left it there, because this
	 * module is not a component and has no `t` of its own. The phone showed
	 * `app.ontoplano2` at the top of every reminder. A key is a plausible
	 * string, so nothing else noticed.
	 */
	test('what the phone is shown is words, not message keys', async () => {
		const { plugin, state } = notificationPlugin();
		inTheApp({ LocalNotifications: plugin });
		upcoming([{ id: 1, ...soon(), message: 'buy milk', audible: true }]);

		await scheduleDeviceReminders(t);

		const said = [
			...state.booked.flatMap((n) => [n.title, n.body]),
			...state.channels.flatMap((c) => [c.name, c.description])
		];
		expect(said.length).toBeGreaterThan(0);
		for (const words of said) {
			expect(words).toBeTruthy();
			expect(words).not.toMatch(/^[a-z][\w-]*(\.[\w-]+)+$/);
		}
	});

	test('a silent reminder is shown without a sound, not skipped', async () => {
		const { plugin, state } = notificationPlugin();
		inTheApp({ LocalNotifications: plugin });
		upcoming([
			{ id: 1, ...soon(), message: 'loud', audible: true },
			{ id: 2, ...soon(), message: 'quiet', audible: false }
		]);

		await scheduleDeviceReminders(t);

		// `sound: null` is the plugin's word for silent; `undefined` leaves the
		// channel's own sound in charge.
		expect(state.booked.find((n) => n.id === 1)?.sound).toBeUndefined();
		expect(state.booked.find((n) => n.id === 2)?.sound).toBeNull();
	});

	test('asks nothing of the instance while the permission is not granted', async () => {
		const { plugin } = notificationPlugin('denied');
		inTheApp({ LocalNotifications: plugin });
		const fetched = vi.fn();
		vi.stubGlobal('fetch', fetched);

		expect(await scheduleDeviceReminders(t)).toBe(0);
		expect(fetched).not.toHaveBeenCalled();
	});

	test('books nothing in a browser', async () => {
		expect(await scheduleDeviceReminders(t)).toBe(0);
	});
});

describe('what Android has answered', () => {
	test('a page with no plugins cannot know, and says so', async () => {
		expect(await phonePermission()).toBe('unreachable');
	});

	test.each([
		['granted', 'granted'],
		['prompt', 'prompt'],
		['prompt-with-rationale', 'prompt'],
		['denied', 'denied']
	])('%s is read as %s', async (display, read) => {
		const { plugin } = notificationPlugin(display);
		inTheApp({ LocalNotifications: plugin });
		expect(await phonePermission()).toBe(read);
	});
});

describe('the shell that is not there', () => {
	// Every page an instance serves runs where no plugin exists; each of these
	// answering quietly is what keeps the reminders screen from throwing on it.
	test('ringFor fails quietly, and says it failed', async () => {
		expect(await ringFor('https://my.ontoplano.example', 'onto_key')).toBe(false);
	});

	test('stopRinging fails quietly', async () => {
		expect(await stopRinging()).toBe(false);
	});

	test('ringingFor answers nobody', async () => {
		expect(await ringingFor()).toBe('');
	});
});

/**
 * The part that decides whether anything is heard.
 *
 * Android takes the sound from a notification's *channel*, not from the
 * notification: one made at the default importance posts silently however
 * loudly the notification asks. The shell's own ringer made
 * `ontoplano-reminders` at IMPORTANCE_HIGH and rang; this half named no
 * channel at all, landed on the plugin's default, and arrived in silence — the
 * notification appeared, and the sound only played later, out of the page,
 * when the app was opened.
 */
describe('the channel a reminder lands on', () => {
	test('is made before anything is booked, and every booking names it', async () => {
		const { plugin, state } = notificationPlugin();
		inTheApp({ LocalNotifications: plugin });
		upcoming([{ id: 1, ...soon(), message: 'stretch', audible: true }]);

		await scheduleDeviceReminders(t);

		expect(state.channels.map((c) => c.id)).toContain(REMINDER_CHANNEL);
		// 5 is IMPORTANCE_HIGH: it makes a sound. 3 (DEFAULT) does not peek and
		// 2 (LOW) is silent — a channel made at either is the bug this pins.
		expect(state.channels.find((c) => c.id === REMINDER_CHANNEL)?.importance).toBe(5);

		expect(state.booked).toHaveLength(1);
		expect(state.booked[0].channelId).toBe(REMINDER_CHANNEL);
	});

	test('a test notification lands on the same one, so it sounds like the real thing', async () => {
		const { plugin, state } = notificationPlugin();
		inTheApp({ LocalNotifications: plugin });

		expect(await testPhoneNotification(t)).toBe(true);
		expect(state.channels.map((c) => c.id)).toContain(REMINDER_CHANNEL);
		expect(state.booked[0].channelId).toBe(REMINDER_CHANNEL);
	});
});

/**
 * The permission this app does not ask for, and what happens without it.
 *
 * An exact alarm needs `SCHEDULE_EXACT_ALARM` from Android 12 on. Ontoplano
 * deliberately does not request it — asking is a promise about what the app is
 * for, and that belongs to whoever ships it — so the request throws, and the
 * shell's own ringer has always caught that and booked an inexact alarm
 * instead: late rather than silent.
 *
 * This half asked for `allowWhileIdle`, let the throw reach the catch around
 * everything, and answered "nothing to book". On a phone that is its own
 * instance that meant *no reminder ever arrived*, with nothing anywhere saying
 * why — which is precisely how it was reported: "no notification arrived".
 */
describe('a phone that will not take an exact alarm', () => {
	/** Like the real plugin: exact alarms throw, inexact ones are accepted. */
	function refusesExactAlarms() {
		const { plugin, state } = notificationPlugin();
		const asked: boolean[] = [];
		const strict = {
			...plugin,
			schedule: async (what: { notifications: { schedule: { allowWhileIdle: boolean } }[] }) => {
				const exact = what.notifications.some((n) => n.schedule.allowWhileIdle);
				asked.push(exact);
				if (exact) throw new Error('SecurityException: SCHEDULE_EXACT_ALARM');
				return plugin.schedule(what as never);
			}
		};
		return { plugin: strict, state, asked };
	}

	test('is given an inexact one rather than nothing at all', async () => {
		const { plugin, state, asked } = refusesExactAlarms();
		inTheApp({ LocalNotifications: plugin });
		upcoming([{ id: 1, ...soon(), message: 'stretch', audible: true }]);

		const booked = await scheduleDeviceReminders(t);

		// Exact first, because exact is what a reminder wants.
		expect(asked).toEqual([true, false]);
		expect(booked, 'it reported booking nothing').toBe(1);
		expect(state.booked.map((n) => n.id)).toEqual([1]);
	});

	test('and the test notification degrades the same way', async () => {
		const { plugin, state, asked } = refusesExactAlarms();
		inTheApp({ LocalNotifications: plugin });

		expect(await testPhoneNotification(t)).toBe(true);
		expect(asked).toEqual([true, false]);
		expect(state.booked).toHaveLength(1);
	});
});
