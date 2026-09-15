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
import { afterEach, describe, expect, test, vi } from 'vitest';

import { APP_USER_AGENT } from '../src/lib/instance-choice';
import {
	phonePermission,
	ringFor,
	ringingFor,
	scheduleDeviceReminders,
	stopRinging
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
		booked: [] as { id: number; sound?: string | null; schedule: { at: Date } }[]
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

const soon = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe('what gets booked', () => {
	test('cancels what it booked before, then books what is still to come', async () => {
		const { plugin, state } = notificationPlugin('granted', [{ id: 7 }, { id: 9 }]);
		inTheApp({ LocalNotifications: plugin });
		upcoming([
			{ id: 1, remindAt: soon(), message: 'stretch', audible: true },
			// Already gone off: booking it would make the phone ring right now
			// about something that is over.
			{
				id: 2,
				remindAt: new Date(Date.now() - 60_000).toISOString(),
				message: 'past',
				audible: true
			},
			// Android's ids are 32-bit signed; a row id past that wraps into
			// somebody else's notification.
			{ id: 2 ** 31, remindAt: soon(), message: 'too big', audible: true },
			{ id: 3, remindAt: soon(), message: 'quietly', audible: false }
		]);

		const booked = await scheduleDeviceReminders();

		expect(state.cancelled.map((n) => n.id)).toEqual([7, 9]);
		expect(booked).toBe(2);
		expect(state.booked.map((n) => n.id)).toEqual([1, 3]);
	});

	test('a silent reminder is shown without a sound, not skipped', async () => {
		const { plugin, state } = notificationPlugin();
		inTheApp({ LocalNotifications: plugin });
		upcoming([
			{ id: 1, remindAt: soon(), message: 'loud', audible: true },
			{ id: 2, remindAt: soon(), message: 'quiet', audible: false }
		]);

		await scheduleDeviceReminders();

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

		expect(await scheduleDeviceReminders()).toBe(0);
		expect(fetched).not.toHaveBeenCalled();
	});

	test('books nothing in a browser', async () => {
		expect(await scheduleDeviceReminders()).toBe(0);
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
