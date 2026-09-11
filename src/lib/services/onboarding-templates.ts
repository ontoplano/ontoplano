/**
 * The starter weeks, as data.
 *
 * Separate from `onboarding.ts` because that module reaches the database at
 * import time, and these are three literals that a test — or anything else —
 * should be able to read without one. `onboarding.ts` re-exports them, so
 * nothing that already imports from there has to change.
 */

export const TEMPLATE_KEYS = ['student', 'remote', 'blank'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type Block = {
	weekday: number;
	startTime: string;
	durationMinutes: number;
	activity: string;
};

export type Template = {
	key: TemplateKey;
	label: string;
	description: string;
	categories: { name: string; color: string; colorLight: string }[];
	/** Activity name → the category it belongs to. */
	activities: { name: string; category: string }[];
	blocks: Block[];
};

/** Weekdays are Monday 0 … Sunday 6, as everywhere else in the planner. */
const WEEKDAYS = [0, 1, 2, 3, 4];

/**
 * Every starter week has to put something on every day of the week — including
 * both weekend days, which is what these templates used to get wrong.
 *
 * Onboarding's whole promise is "a populated week in three minutes", and the
 * day it populates first is today. Somebody signing up on a Saturday got the
 * Remote worker week, whose only weekend block was on Sunday, and landed on a
 * dashboard that said nothing was planned — on their first day, before they
 * had seen the app do anything. `onboarding.test.ts` refuses a template with
 * an empty day so this cannot come back by somebody tuning a schedule.
 */

/**
 * Colours are drawn from the section palette: deep enough for white text, and
 * spread by lightness as well as hue so they stay distinct without relying on
 * red versus green.
 */
const BASE_CATEGORIES = [
	{ name: 'work', color: '#1d4ed8', colorLight: '#dbeafe' },
	{ name: 'health', color: '#0f766e', colorLight: '#ccfbf1' },
	{ name: 'personal', color: '#b45309', colorLight: '#fef3c7' }
];

export const TEMPLATES: Template[] = [
	{
		key: 'student',
		label: 'Student',
		description: 'Lectures in the morning, study blocks after, exercise in between.',
		categories: BASE_CATEGORIES,
		activities: [
			{ name: 'Lectures', category: 'work' },
			{ name: 'Study block', category: 'work' },
			{ name: 'Exercise', category: 'health' },
			{ name: 'Reading', category: 'personal' }
		],
		blocks: [
			...WEEKDAYS.map((weekday) => ({
				weekday,
				startTime: '09:00',
				durationMinutes: 120,
				activity: 'Lectures'
			})),
			...WEEKDAYS.map((weekday) => ({
				weekday,
				startTime: '14:00',
				durationMinutes: 90,
				activity: 'Study block'
			})),
			{ weekday: 1, startTime: '18:00', durationMinutes: 60, activity: 'Exercise' },
			{ weekday: 3, startTime: '18:00', durationMinutes: 60, activity: 'Exercise' },
			// Both weekend days, not one. A starter week with an empty Saturday
			// is an empty first day for everybody who signs up on a Saturday —
			// see the note above WEEKDAYS.
			{ weekday: 5, startTime: '11:00', durationMinutes: 60, activity: 'Exercise' },
			{ weekday: 6, startTime: '10:00', durationMinutes: 90, activity: 'Reading' }
		]
	},
	{
		key: 'remote',
		label: 'Remote worker',
		description: 'Deep work before lunch, admin after, a walk to end the day.',
		categories: BASE_CATEGORIES,
		activities: [
			{ name: 'Deep work', category: 'work' },
			{ name: 'Admin', category: 'work' },
			{ name: 'Walk', category: 'health' },
			{ name: 'Cook', category: 'personal' }
		],
		blocks: [
			...WEEKDAYS.map((weekday) => ({
				weekday,
				startTime: '09:00',
				durationMinutes: 180,
				activity: 'Deep work'
			})),
			...WEEKDAYS.map((weekday) => ({
				weekday,
				startTime: '14:00',
				durationMinutes: 60,
				activity: 'Admin'
			})),
			...WEEKDAYS.map((weekday) => ({
				weekday,
				startTime: '17:30',
				durationMinutes: 30,
				activity: 'Walk'
			})),
			{ weekday: 5, startTime: '11:00', durationMinutes: 90, activity: 'Cook' },
			{ weekday: 6, startTime: '10:00', durationMinutes: 60, activity: 'Walk' }
		]
	},
	{
		key: 'blank',
		label: 'Blank',
		description: 'Three categories and an empty week. Fill it yourself.',
		categories: BASE_CATEGORIES,
		activities: [],
		blocks: []
	}
];

/**
 * Should this account see first run?
 *
 * The stored flag is the answer for anyone who has been through it. Accounts
 * that predate it are recognised by having a plan already: sending someone with
 * a year of history to a screen offering to seed a starter week would be worse
 * than never showing it at all.
 */
