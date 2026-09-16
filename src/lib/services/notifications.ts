import type { Ctx } from './ctx.js';
import { getGridHours, getUserSetting, setUserSetting } from './settings.js';
import { ValidationError } from './errors.js';
import { TIME_PATTERN } from './validate.js';
import { whyNot, type Capabilities, type FeatureKey } from '../capabilities.js';

/**
 * Everything the app will tell you about, in one list.
 *
 * These grew one at a time and each one decided for itself whether to happen:
 * the weekly review nag always did, bills always did, birthdays always did,
 * the Monday mail was a checkbox on a different page, and a block could only
 * notify you if you gave that block a lead time by hand. So there was no
 * screen anywhere that answered "what will this app interrupt me for", which
 * is the first thing somebody wants to know and the only thing they can act
 * on.
 *
 * One list, then, and the settings screen is drawn from it rather than being a
 * hand-written row per notification — a new one appears there by being added
 * here, which is the only way a list like this stays complete.
 *
 * Off or on is an account's business and lives in `user_settings`. It is not
 * the same question as *sound*, which is per device and per kind and belongs
 * to the reminders page: this decides whether the thing is said at all.
 */

/** A notification somebody can turn off, as the settings screen draws it. */
export type Notification = {
	id: NotificationId;
	/** What it is called on the screen. */
	label: string;
	/** One sentence: what arrives, and when. */
	description: string;
	/** Where the answer is kept. */
	key: string;
	/**
	 * What it does for an account that has never said.
	 *
	 * The ones that predate this list default to what they already did, so
	 * turning the list on changes nothing for anybody until they touch it.
	 */
	on: boolean;
	/**
	 * A time somebody chooses, for the ones that are not tied to an event.
	 *
	 * `at` is where it is kept; the default is worked out per account, because
	 * "the end of the day" is a different hour for a baker and a night shift.
	 */
	time?: { key: string; of: (userId: string) => string };
	/**
	 * What this instance has to be able to do for the notification to happen.
	 *
	 * Most of these need nothing: a phone that is its own instance books
	 * Android's alarms and they arrive with the app shut. Mail is the exception
	 * — it goes out on a Monday morning, from a machine that has to be running
	 * then — and an instance on a phone is not. A switch for something that
	 * cannot happen is worse than no switch: it is a promise.
	 */
	needs?: FeatureKey;
};

export const NOTIFICATION_IDS = [
	'blocks',
	'endOfDay',
	'review',
	'reviewMail',
	'bills',
	'birthdays'
] as const;
export type NotificationId = (typeof NOTIFICATION_IDS)[number];

/**
 * The Monday mail's key is the one it has always had.
 *
 * It was a checkbox under Settings → Account before any of the rest existed,
 * and accounts have answered it. Renaming the key to match the others would
 * quietly turn it off for every one of them, which is the wrong way round:
 * somebody who asked for mail should not stop getting it because the setting
 * moved house.
 */
export const REVIEW_MAIL_KEY = 'mail.weekly-review';

export const NOTIFICATIONS: Notification[] = [
	{
		id: 'blocks',
		label: 'Blocks, as they start',
		description:
			'Every block on the plan says so when its time comes. Without this only the blocks you gave a lead time to say anything.',
		key: 'notify.blocks',
		on: false
	},
	{
		id: 'endOfDay',
		label: 'The end of the day',
		description: 'What the day turned out to be, at a time you choose.',
		key: 'notify.end-of-day',
		on: false,
		time: {
			key: 'notify.end-of-day.at',
			/*
			 * The last hour the planner grid draws, not the edge past it.
			 *
			 * `end` is exclusive — a grid that runs to 22 draws its last hour at
			 * 21:00 — so the edge itself is the moment the day is already over,
			 * and for a grid that runs to 24 it is midnight, which is somebody
			 * else's morning. The hour before is the one you are still awake for,
			 * which is when "how did today go" is a question rather than a
			 * post-mortem.
			 */
			of: (userId) => `${String((getGridHours(userId).end + 23) % 24).padStart(2, '0')}:00`
		}
	},
	{
		id: 'review',
		label: 'The weekly review',
		description: 'On the morning the week turns over, while last week still has blocks unanswered.',
		key: 'notify.review',
		on: true
	},
	{
		id: 'reviewMail',
		label: 'The weekly review, by email',
		description:
			'Monday morning: what last week actually was, with the page that closes it one press away.',
		key: REVIEW_MAIL_KEY,
		on: false,
		needs: 'reviewMail'
	},
	{
		id: 'bills',
		label: 'Bills',
		description: 'The day one wants paying, every day it stays unpaid, and the day it is due.',
		key: 'notify.bills',
		on: true
	},
	{
		id: 'birthdays',
		label: 'Birthdays',
		description: 'On the morning, for everybody in your address book with a date on them.',
		key: 'notify.birthdays',
		on: true
	}
];

const byId = new Map(NOTIFICATIONS.map((n) => [n.id, n]));

/**
 * Whether one of these is on for an account.
 *
 * Stored as the same two words the mail setting has always used, so the one
 * key that predates this reads the same way as the rest.
 */
export function notifies(userId: string, id: NotificationId): boolean {
	const what = byId.get(id);
	if (!what) return false;
	const said = getUserSetting(userId, what.key);
	if (said === null) return what.on;
	return said === 'on';
}

/** The time one of the timed ones goes off, as `HH:MM`. */
export function notifyAt(userId: string, id: NotificationId): string {
	const what = byId.get(id);
	if (!what?.time) throw new ValidationError('That notification has no time of its own.');
	return getUserSetting(userId, what.time.key) ?? what.time.of(userId);
}

/**
 * What the settings screen draws: every notification, with this account's
 * answers already in it.
 *
 * Built field by field rather than spread from the list, because this crosses
 * the wire: the entries carry a function — how to work out the default hour
 * for an account — and a load that returns one fails the whole page with
 * "cannot stringify a function". Which is the right complaint: where the
 * answer is kept, and how its default is derived, are this module's business
 * and none of the screen's. The screen needs the four things it draws.
 */
export type NotificationRow = {
	id: NotificationId;
	label: string;
	description: string;
	on: boolean;
	/** The hour it goes off, or null for the ones tied to an event. */
	at: string | null;
	/**
	 * Why this instance cannot do it, or null when it can.
	 *
	 * Said rather than hidden, the way every other wall in the app is said:
	 * somebody who has just met one deserves to know it exists and what would
	 * take it down. See `capabilities.ts`.
	 */
	whyNot: string | null;
};

export function notificationSettings(ctx: Ctx, instance: Capabilities): NotificationRow[] {
	return NOTIFICATIONS.map((what) => ({
		id: what.id,
		label: what.label,
		description: what.description,
		on: notifies(ctx.userId, what.id),
		at: what.time ? notifyAt(ctx.userId, what.id) : null,
		whyNot: what.needs ? whyNot(instance, what.needs) : null
	}));
}

export function setNotification(
	ctx: Ctx,
	id: unknown,
	choice: { on: boolean; at?: unknown }
): void {
	const what = byId.get(String(id ?? '') as NotificationId);
	if (!what) throw new ValidationError('There is no such notification.');

	setUserSetting(ctx.userId, what.key, choice.on ? 'on' : 'off');

	if (what.time && choice.at !== undefined) {
		const at = String(choice.at ?? '').trim();
		// The browser's time field hands back HH:MM; anything else is somebody
		// posting the form themselves, and an hour nobody can mean is not a
		// setting to store and puzzle over later.
		if (!TIME_PATTERN.test(at)) throw new ValidationError('That is not a time of day.');
		setUserSetting(ctx.userId, what.time.key, at);
	}
}
