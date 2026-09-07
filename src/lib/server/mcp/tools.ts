/**
 * What an assistant can do in here, and what it has to hold to do it.
 *
 * Every tool is one entry: a name, the sentence a model reads to decide whether
 * this is the thing it wants, the shape of its arguments, the scope the token
 * must carry, and a handler that calls the same service function the web page
 * calls. Nothing here talks to the database, and nothing here reimplements a
 * rule — the ceilings, the validation and the ownership are the service's, so a
 * tool cannot be a way around them.
 *
 * Two habits keep this honest:
 *
 * **The description is written for a model that has never seen this app.** It
 * says what the thing is in this app's own vocabulary — a notebook is a subject
 * you write against, a todo is a task with no date yet — because a tool called
 * `create_entry` with the description "creates an entry" is a tool that gets
 * called for the wrong reasons.
 *
 * **Reading and writing are different scopes.** A token granted `notes:read`
 * that calls a tool needing `notes:write` is refused, and the refusal names the
 * scope it lacked rather than saying no.
 */
import { localDateOf, type Ctx } from '../services/ctx.js';
import type { Scope } from '../services/tokens.js';

import { createEntry, listEntries } from '../services/diary.js';
import { createActivity, listActivities, updateActivity } from '../services/activities.js';
import { createHabit, listHabits, updateHabit, HABIT_TYPES } from '../services/habits.js';
import { createReminder, dismissReminder, listReminders } from '../services/reminders.js';
import { createPerson, listPeople, updatePerson } from '../services/people.js';
import { RELATIONSHIPS } from '../../people.js';
import { listWins, saveWins, WINS_PER_DAY } from '../services/wins.js';
import {
	listLines,
	readWeek,
	saveLines,
	weekStartOf,
	LINES_PER_REVIEW
} from '../services/review.js';
import { getStreamBySlug, listStreams, pushPoints, serialiseStream } from '../services/streams.js';
import { createSlot, deleteSlots, listWeeklySlots, updateSlot } from '../services/slots.js';
import {
	describeRecurrence,
	formatDate as recFormatDate,
	MAX_INTERVAL,
	parseRecurrence,
	serialiseRecurrence
} from '../../recurrence.js';
import {
	createIdea,
	deleteIdea,
	listIdeas,
	toggleApplied,
	toggleFavorite,
	updateIdea
} from '../services/ideas.js';
import {
	addGoalLinks,
	closeGoal,
	createArea,
	createGoal,
	listAreas,
	listGoals,
	removeGoalLinks,
	setGoalProgress,
	updateGoal
} from '../services/goals.js';
import {
	contentsOf,
	createNotebook,
	deleteNotebook,
	listNotebooks,
	setNotebookShared
} from '../services/notebooks.js';
import {
	cooked,
	createRecipe,
	getRecipe,
	importIngredients,
	ingredientsOf,
	listRecipes,
	setArchived,
	updateRecipe
} from '../services/recipes.js';
import {
	listWorkouts,
	getWorkout,
	createWorkout,
	updateWorkout,
	setArchived as setWorkoutArchived,
	done as workoutDone,
	listWorkoutCategories,
	createWorkoutCategory,
	deleteWorkoutCategory
} from '../services/workouts.js';
import {
	listBills,
	getBill,
	createBill,
	updateBill,
	setArchived as setBillArchived,
	markPaid,
	unmarkPaid,
	listPayments,
	monthSummary,
	billsDueBetween
} from '../services/bills.js';
import { grouped, search } from '../services/search.js';
import {
	createCategory as createShoppingCategory,
	createItem,
	deleteCategory as deleteShoppingCategory,
	deleteItem,
	listItems,
	listCategories as listShoppingCategories,
	recordPaid,
	renameCategory,
	setBought,
	setCategoryFood,
	setCategoryShared,
	setSnoozed,
	setItemCategory
} from '../services/shopping.js';
import { getTodayBoard } from '../services/today.js';
import {
	createTodo,
	deleteTodo,
	listTodos,
	scheduleTodo,
	setTodoStatus,
	updateTodo
} from '../services/todos.js';
import { getUpcomingSchedule } from '../services/schedule.js';
import { createExceptional } from '../services/slots.js';
import {
	cancelOccurrence,
	changeOccurrence,
	recordIdOf,
	setOccurrenceStatus
} from '../services/instances.js';
import { listCategories } from '../services/activities.js';
import { toggleOccurrence } from '../services/habits.js';
import {
	locationTree,
	createLocation,
	updateLocation,
	deleteLocation,
	getLocation,
	pathOf
} from '../services/locations.js';
import {
	setItemLocation,
	setItemAttributes,
	listItems as listShoppingItems
} from '../services/shopping.js';
import { NotFoundError, ValidationError } from '../services/errors.js';

/** JSON Schema, the subset a tool's arguments actually use. */
type Shape = {
	type: 'object';
	properties: Record<string, unknown>;
	required?: string[];
	additionalProperties?: false;
};

export type Tool = {
	name: string;
	title: string;
	description: string;
	scope: Scope;
	/** Whether calling it changes anything, which is what a client warns about. */
	writes: boolean;
	input: Shape;
	run: (ctx: Ctx, args: Record<string, unknown>) => unknown;
};

const object = (properties: Record<string, unknown>, required: string[] = []): Shape => ({
	type: 'object',
	properties,
	required,
	additionalProperties: false
});

const text = (description: string) => ({ type: 'string', description });
const count = (description: string, fallback: number) => ({
	type: 'integer',
	description,
	default: fallback
});

/** A day, as this app writes one. Rejected early so a service never sees junk. */
function day(value: unknown, what: string): string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
		throw new ValidationError(`${what} has to be a date like 2026-03-14.`);
	return value;
}

function limitOf(args: Record<string, unknown>, fallback: number, ceiling = 200): number {
	const raw = Number(args.limit ?? fallback);
	if (!Number.isFinite(raw) || raw < 1) return fallback;
	return Math.min(Math.floor(raw), ceiling);
}

/** A 1–5 rating, or nothing. Bad numbers are refused before a service sees them. */
const rating = (value: unknown, what: string): number | undefined => {
	if (value === undefined || value === null) return undefined;
	const n = Number(value);
	if (!Number.isInteger(n) || n < 1 || n > 5)
		throw new ValidationError(`${what} is a whole number from 1 to 5.`);
	return n;
};

const ratingArgs = {
	urgency: { type: 'integer', description: 'How soon it has to happen, 1–5.' },
	interest: { type: 'integer', description: 'How much they want to do it, 1–5.' },
	energy: { type: 'integer', description: 'How much it will take out of them, 1–5.' }
};

const ratingsOf = (args: Record<string, unknown>) => ({
	urgency: rating(args.urgency, 'urgency') ?? null,
	interest: rating(args.interest, 'interest') ?? null,
	energy: rating(args.energy, 'energy') ?? null
});

const gaveARating = (args: Record<string, unknown>) =>
	args.urgency !== undefined || args.interest !== undefined || args.energy !== undefined;

/*
 * WHAT NEVER GETS A DELETE TOOL
 *
 * Deletion verbs here exist only for cheap, often-reversed things: blocks and
 * repeating blocks, reminders, ideas, todos, shopping items. Data that
 * accumulates a story or stands for people and commitments — a person's page,
 * a habit and its kept days, a goal, a goal area — is never deletable through
 * a tool, however symmetric that would look beside its add_*. A
 * mis-transcription is fixed with the change_* verb; a real deletion is rare,
 * and the person does it themselves in the app.
 */

/**
 * The category the caller named, refused loudly when it names nothing.
 *
 * This used to fall back to the first category on a miss, so a typo filed
 * work under the wrong part of life and reported success. A blind write is
 * worse than a refusal: the refusal lists the names to pick from.
 */
function categoryByName(ctx: Ctx, wanted: unknown): { id: number; name: string } {
	const all = listCategories(ctx) as { id: number; name: string }[];
	if (all.length === 0)
		throw new ValidationError(
			'This account has no categories yet, and a block belongs to one. Make one in the app first.'
		);

	const said = typeof wanted === 'string' ? wanted.trim().toLowerCase() : '';
	if (!said) return all[0];

	const hit =
		all.find((c) => c.name.toLowerCase() === said) ??
		all.find((c) => c.name.toLowerCase().includes(said));
	if (!hit)
		throw new ValidationError(
			`No category called "${String(wanted)}". This account has: ${all.map((c) => c.name).join(', ')}.`
		);
	return hit;
}

/**
 * A habit by name, for a token that may write habits and not read them.
 *
 * `habits:write` on its own was a permission that could not be used: the tick
 * takes an id, and the only thing that hands out ids is `habits`, which is
 * behind `habits:read`. Rather than have one grant quietly imply the other —
 * a tick is not a licence to read a month of somebody's slips — the write
 * tool can find the habit itself.
 *
 * Names are not unique, so an ambiguous one is refused rather than guessed:
 * ticking the wrong habit is a lie in somebody's history.
 */
function habitByName(ctx: Ctx, wanted: unknown): { id: number; name: string } {
	const said = typeof wanted === 'string' ? wanted.trim().toLowerCase() : '';
	if (!said) throw new ValidationError('Which habit? Give its name or its id.');

	const all = listHabits(ctx) as { id: number; name: string }[];
	const exact = all.filter((h) => h.name.toLowerCase() === said);
	const near = exact.length > 0 ? exact : all.filter((h) => h.name.toLowerCase().includes(said));

	if (near.length === 0)
		throw new ValidationError(
			`No habit called "${String(wanted)}"${
				all.length > 0 ? `. This account has: ${all.map((h) => h.name).join(', ')}.` : '.'
			}`
		);
	if (near.length > 1)
		throw new ValidationError(
			`More than one habit matches "${String(wanted)}": ${near.map((h) => h.name).join(', ')}. Use the exact name.`
		);
	return near[0];
}

/**
 * How often a repeating block comes back, for the tools that set it.
 *
 * The app has offered every-N-weeks, every-N-days and monthly since blocks
 * could repeat at all; this surface could only ever make a weekly one, which
 * left "put the bins out every other Tuesday" impossible to ask for.
 */
const repeatArgs = {
	repeats: {
		type: 'string',
		enum: ['weekly', 'every_n_weeks', 'every_n_days', 'monthly'],
		description:
			'How often it comes back. Weekly if left out. `every_n_weeks` and `every_n_days` need `every`; `monthly` needs `month_day` and ignores the weekday.'
	},
	every: {
		type: 'integer',
		description: 'The N in every N weeks or every N days — 2 is "every other".'
	},
	month_day: {
		type: 'integer',
		description:
			'For `monthly`: which day of the month, 1 to 31. A month too short for it uses its last day.'
	}
} as const;

/**
 * The rule these arguments describe, or `undefined` when they say nothing —
 * which is how a change that does not mention the rhythm leaves it alone.
 *
 * `anchor` is what every-N counts from: the date the block was asked about, so
 * "every other Tuesday" starts on the Tuesday somebody meant.
 */
function recurrenceFromArgs(args: Record<string, unknown>, anchor: string): string | undefined {
	const repeats = args.repeats;
	if (repeats === undefined || repeats === null || repeats === '') return undefined;

	const every = Math.trunc(Number(args.every ?? 1));
	if (repeats === 'every_n_weeks' || repeats === 'every_n_days') {
		if (!Number.isInteger(every) || every < 1 || every > MAX_INTERVAL) {
			throw new ValidationError(`\`every\` must be a whole number from 1 to ${MAX_INTERVAL}`);
		}
		const kind = repeats === 'every_n_weeks' ? 'weeks' : 'days';
		return serialiseRecurrence({ kind, interval: every, anchor });
	}
	if (repeats === 'monthly') {
		const day = Math.trunc(Number(args.month_day ?? 1));
		if (!Number.isInteger(day) || day < 1 || day > 31) {
			throw new ValidationError('`month_day` must be a whole number from 1 to 31');
		}
		return serialiseRecurrence({ kind: 'monthly', day });
	}
	return 'weekly';
}

/** The rhythm in words, so a row does not have to be decoded to be read. */
function repeatsInWords(recurrence: string | null, weekdayName: string): string {
	return describeRecurrence(parseRecurrence(recurrence), weekdayName);
}

/** The next date on or after `from` that falls on this Monday-indexed weekday. */
function nextWeekdayOnOrAfter(from: Date, weekday: unknown): Date {
	const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
	const ahead = (Math.trunc(Number(weekday)) - ((d.getDay() + 6) % 7) + 7) % 7;
	d.setDate(d.getDate() + ahead);
	return d;
}

const WEEKDAY_NAMES = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
];

export const TOOLS: Tool[] = [
	// ── Looking ──────────────────────────────────────────────────────────────
	{
		name: 'today',
		title: "Today's plan",
		description:
			"What is on today: the blocks planned for it and the tasks pulled onto it. This is the answer to 'what am I meant to be doing', and the first thing to reach for before adding anything. Habits are not here — they are their own permission, and their own tool.",
		scope: 'today:read',
		writes: false,
		input: object({}),
		run: (ctx) => getTodayBoard(ctx)
	},
	{
		name: 'habits',
		title: 'Habits due today',
		description:
			"The habits scheduled for today, each with its streak and whether it has been kept yet. Separate from the day's plan on purpose: whether somebody kept their habits is a more personal thing than what is on their calendar, so it is granted separately.",
		scope: 'habits:read',
		writes: false,
		input: object({}),
		run: (ctx) => getTodayBoard(ctx, { habits: true }).habits ?? []
	},
	{
		/*
		 * Reading whether somebody kept their habits, and being unable to say
		 * that they did, is a strange half of a feature: "I did my stretching"
		 * is the most ordinary sentence there is about a habit.
		 */
		name: 'tick_habit',
		title: 'Tick a habit',
		description:
			'Tick a habit for a day: for something being built, the tick means it was done; for something being avoided, it means it happened. Name it or give the id `habits` gave; a name that matches two habits is refused rather than guessed. Ticking twice is not an error; the second call takes it back, which is how the app\u2019s own tick behaves.',
		scope: 'habits:write',
		writes: true,
		input: object({
			id: { type: 'integer', description: 'The habit\u2019s id, as `habits` gave it.' },
			name: text('The habit by name, when the id is not to hand — "stretching".'),
			date: text('The day, as YYYY-MM-DD. Today if left out.')
		}),
		run: (ctx, args) => {
			const habit = args.id ? { id: args.id, name: '' } : habitByName(ctx, args.name);
			toggleOccurrence(ctx, {
				habitId: habit.id,
				date: args.date ?? localDateOf(ctx.now, ctx.tz)
			});
			return { ok: true, habit: habit.name || undefined };
		}
	},
	{
		/*
		 * Answering for a block, which is the other half of reading the day.
		 *
		 * The ids are the ones `today` hands back. Both answers are kept: "done"
		 * and "skipped" are different facts about a week, and a tracker that only
		 * accepts the good one starts lying by the second week.
		 */
		name: 'finish_block',
		title: 'Mark a block done or skipped',
		description:
			'Answer for one block on the day: it happened, or it did not. Takes the id `today` gives for that block. Skipping is a real answer — say skipped when the person says they did not do it. It is NOT a way to clear something off the day: a skip goes into the week\u2019s record and the review asks about it. To move a block use `change_block`; to take one off because it was never happening use `cancel_block`. `todo` takes an answer back, for one ticked by mistake.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				id: text('The block’s id, exactly as `today` gave it — it looks like `slot:42`.'),
				status: {
					type: 'string',
					enum: ['done', 'skipped', 'todo'],
					description: 'What actually happened.'
				}
			},
			['id', 'status']
		),
		run: (ctx, args) => {
			setOccurrenceStatus(ctx, args.id, args.status);
			return { ok: true };
		}
	},
	{
		/*
		 * A block on one day, which is not a todo.
		 *
		 * A todo is a thing to do with no hour attached; this is an hour. Asked
		 * for "deep work 9 to 11 today", an assistant with only `add_todo` writes
		 * the time into the title and the day still looks empty, which is the
		 * failure this exists to stop.
		 */
		name: 'add_block',
		title: 'Put a block on a day',
		description:
			'Add a one-off block to one day: a title, a start time and how long it runs. This is for "deep work from 9 to 11 today" — a thing with an hour. Use `add_todo` instead when there is no time attached, and `change_block` to move or rename something already on the day rather than adding a second copy of it. It does not touch the repeating week; this is that day only.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				date: text('The day, as YYYY-MM-DD.'),
				title: text('What it is — shown on the block.'),
				start_time: text('When it starts, as HH:MM on a 24-hour clock.'),
				minutes: count('How long it runs, in minutes.', 60),
				category: text(
					'Which part of life it belongs to, by name — `categories` lists them. A name that matches nothing is refused, never guessed. The first category is used only when this is left out entirely.'
				),
				...ratingArgs
			},
			['date', 'title', 'start_time']
		),
		run: (ctx, args) => {
			// A block belongs to a category — the colour it is drawn in and the
			// bucket the week is counted into — resolved by name and refused on a
			// miss, because a typo silently filed under the wrong life was worse
			// than an error.
			const chosen = categoryByName(ctx, args.category);

			const id = createExceptional(ctx, {
				date: day(args.date, 'date'),
				mode: 'category',
				categoryId: chosen.id,
				label: args.title,
				startTime: args.start_time,
				durationMinutes: args.minutes ?? 60,
				...(gaveARating(args) ? { ratings: ratingsOf(args) } : {})
			});

			return { id, category: chosen.name };
		}
	},
	{
		/*
		 * The verb that was missing, and what its absence cost.
		 *
		 * Asked to "push the study block to four", an assistant with only add and
		 * answer-for invented a move: it added a second block at 16:00 and marked
		 * the original *skipped* to clear the first one off the grid. The day then
		 * recorded something that had not happened — and a skip is not cosmetic,
		 * it is what the weekly review asks about.
		 *
		 * A tool surface that cannot express an ordinary request does not produce
		 * a refusal; it produces a workaround, and the workaround writes to
		 * somebody's record of their own life.
		 */
		name: 'change_block',
		title: 'Move or rename a block',
		description:
			'Change one block on one day: its time, its day, how long it runs, or what it is called. This is "push the study block to four", "make it two hours", "that was actually client work". Takes the id `today` or `upcoming` gives. Only the fields you pass change. It affects that day only — moving this Thursday\u2019s gym does not move gym — and it never edits the repeating week. Renaming keeps which part of life it belongs to and stops it being the named activity it was, because that is what saying it was something else means.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				id: text('The block\u2019s id, exactly as the day gave it — like `slot:42`.'),
				date: text('Move it to this day, as YYYY-MM-DD. Leave out to keep the day it is on.'),
				start_time: text('The new start, as HH:MM on a 24-hour clock.'),
				minutes: { type: 'integer', description: 'How long it should run, in minutes.' },
				title: text('What it should be called instead.'),
				category: text(
					'Refile it under this part of life, by name — `categories` lists them. Affects that day only, like everything here.'
				)
			},
			['id']
		),
		run: (ctx, args) =>
			changeOccurrence(ctx, args.id, {
				date: args.date,
				startTime: args.start_time,
				minutes: args.minutes,
				title: args.title,
				...(args.category !== undefined && args.category !== null && args.category !== ''
					? { categoryId: categoryByName(ctx, args.category).id }
					: {})
			})
	},
	{
		name: 'cancel_block',
		title: 'Take a block off the day',
		description:
			'Remove a block from a day because it is not happening — the meeting moved, the class was called off, it was put on the wrong day. This is NOT the same as marking it skipped: skipped means it was meant to happen and did not, which is a fact the weekly review asks about, and cancelled means it was never going to. Use `finish_block` with "skipped" for the first and this for the second. A repeating block is only removed from that one day.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{ id: text('The block\u2019s id, exactly as the day gave it — like `slot:42`.') },
			['id']
		),
		run: (ctx, args) => cancelOccurrence(ctx, args.id)
	},
	{
		name: 'upcoming',
		title: 'The days ahead',
		description:
			'Everything planned from today onwards — the blocks of the week, in order. Use it to answer questions about a day that is not today.',
		scope: 'schedule:read',
		writes: false,
		input: object({ days: count('How many days from today, up to 31.', 7) }),
		run: (ctx, args) => getUpcomingSchedule(ctx, { days: args.days ?? 7 })
	},
	{
		/*
		 * The week that has already happened, which nothing could reach.
		 *
		 * Answering for a block always worked on any block, past or future —
		 * but the only lists were `today` and `upcoming`, so a block from last
		 * Tuesday had no id anybody could name. "I did not actually do Monday's
		 * run, and I did do the reading" was unanswerable for want of a
		 * listing, and a week's record that can only be corrected on the day is
		 * a week's record that quietly drifts from the truth.
		 */
		name: 'past',
		title: 'The days behind',
		description:
			'What was on the days that have already happened, with what each one was answered — done, skipped, or nothing yet. Use it before correcting a week: it gives the ids `finish_block` needs. Ask for a week back with `days: 7`, or name the day it starts on.',
		scope: 'schedule:read',
		writes: false,
		input: object({
			days: count('How many days to look back over, up to 31.', 7),
			startingOn: text(
				'The first day to include, as YYYY-MM-DD. Left out, it is that many days before today.'
			)
		}),
		run: (ctx, args) => {
			const days = Number(args.days ?? 7);
			// Counted back from today unless a day is named, so `days: 7` means
			// "the last week" rather than "the week starting a week ago and
			// ending now" — which is the same range, said the way people say it.
			const startingOn =
				args.startingOn ?? localDateOf(new Date(ctx.now.getTime() - days * 86400_000), ctx.tz);

			return getUpcomingSchedule(ctx, { days, startingOn, includeCompleted: true });
		}
	},
	{
		name: 'search',
		title: 'Search everything written',
		description:
			'One search over diary entries, notebooks, notes, ideas, goals, people, recipes and todos. Prefer this to guessing which room a thing is in.',
		scope: 'search:read',
		writes: false,
		input: object({ query: text('What to look for.') }, ['query']),
		run: (ctx, args) =>
			grouped(search(ctx, args.query)).map((g) => ({
				kind: g.kind,
				label: g.label,
				hits: g.hits
			}))
	},

	// ── The todo list ────────────────────────────────────────────────────────
	{
		name: 'todos',
		title: 'The todo list',
		description:
			'Tasks with no date on them yet. A todo gains a date by being put on a day, which promotes it onto the week.',
		scope: 'tasks:read',
		writes: false,
		input: object({ limit: count('How many to return.', 50) }),
		run: (ctx, args) => listTodos(ctx).slice(0, limitOf(args, 50))
	},
	{
		name: 'add_todo',
		title: 'Add a todo',
		description:
			'Put a task on the todo list. Leave the date off unless the person said when — a todo with no date is the normal case here, not an unfinished one.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				title: text('What the task is, in the person’s own words.'),
				notes: text('Anything else about it.'),
				scheduledDate: text('The day to put it on, as YYYY-MM-DD. Usually omitted.'),
				goalId: {
					type: 'integer',
					description:
						'A goal to count this towards, as `goals` gives its id. Breaking a goal into tasks is the ordinary reason to make several at once, and a task linked here moves that goal’s progress when it is finished.'
				}
			},
			['title']
		),
		run: (ctx, args) => {
			const id = createTodo(ctx, {
				title: args.title,
				notes: args.notes ?? '',
				scheduledDate: args.scheduledDate ? day(args.scheduledDate, 'scheduledDate') : null
			});
			/*
			 * Linked in the same call, because the alternative is two calls with a
			 * new id in between and an assistant that forgets the second one half
			 * the time. Additive: it cannot disturb what is already on the goal.
			 */
			if (args.goalId !== undefined) {
				addGoalLinks(ctx, Number(args.goalId), { todoIds: [id] });
			}
			return { id };
		}
	},
	{
		name: 'finish_todo',
		title: 'Finish a todo',
		description:
			'Mark a todo done, which is what "I did that" means here — it is not deleted, it moves to done and stays in the record. Ask `todos` first for the id.',
		scope: 'tasks:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The todo’s id.' } }, ['id']),
		run: (ctx, args) => {
			setTodoStatus(ctx, Number(args.id), 'done');
			return { ok: true };
		}
	},
	{
		name: 'drop_todo',
		title: 'Delete a todo',
		description:
			'Remove a todo entirely, because it is not going to happen and is not worth a record — "bin that one", "forget it". Different from `finish_todo`, which keeps it as something that was done. Gone for good; prefer finishing it when it actually happened.',
		scope: 'tasks:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The todo\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteTodo(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		/*
		 * Both closing verbs have one way back, and it is the same way back.
		 *
		 * `finish_todo` and `drop_todo` each set a status; nothing set it to
		 * `todo` again. So "actually I haven't done that yet" had no answer,
		 * and the workaround is a second row with the same words on it.
		 */
		name: 'reopen_todo',
		title: 'Put a todo back on the list',
		description:
			'Undo a finish or a drop: the todo goes back to not-done. Use it when something was ticked by mistake, or when a dropped thing turns out to matter after all. It keeps its notes, its day and everything linked to it.',
		scope: 'tasks:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The todo\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			setTodoStatus(ctx, Number(args.id), 'todo');
			return { ok: true };
		}
	},
	{
		name: 'change_todo',
		title: 'Change a todo',
		description:
			'Rewrite a todo\u2019s title or notes. Only the fields given change. Moving it on or off a day is `schedule_todo`; done and not-done are `finish_todo` and `reopen_todo`.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The todo\u2019s id, as `todos` gives it.' },
				title: text('The new title, in the person\u2019s own words.'),
				notes: text('The new notes.'),
				...ratingArgs
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listTodos(ctx).find((t) => t.id === Number(args.id));
			if (!current) throw new NotFoundError('todo');
			updateTodo(ctx, current.id, {
				title: args.title ?? current.title,
				notes: args.notes ?? current.notes,
				categoryId: current.categoryId,
				notebookId: current.notebookId,
				...(gaveARating(args)
					? {
							ratings: {
								urgency: rating(args.urgency, 'urgency') ?? current.ratings.urgency,
								interest: rating(args.interest, 'interest') ?? current.ratings.interest,
								energy: rating(args.energy, 'energy') ?? current.ratings.energy
							}
						}
					: {})
			});
			return { ok: true };
		}
	},
	{
		name: 'schedule_todo',
		title: 'Put a todo on a day',
		description:
			'Give a todo a date, which moves it onto that day’s board. This is what "do it on Thursday" means here.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The todo’s id.' },
				date: text('The day, as YYYY-MM-DD.')
			},
			['id', 'date']
		),
		run: (ctx, args) => {
			scheduleTodo(ctx, Number(args.id), day(args.date, 'date'));
			return { ok: true };
		}
	},
	{
		name: 'unschedule_todo',
		title: 'Take a todo off its day',
		description:
			'Take the date off a todo, which moves it back to the list of things with no time yet. This is "not today after all" — the todo is kept, it just stops being on a day.',
		scope: 'tasks:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The todo\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			scheduleTodo(ctx, Number(args.id), null);
			return { ok: true };
		}
	},
	{
		name: 'goals',
		title: 'Goals',
		description:
			'What the person is working towards, by horizon, with the work counted against each. `add_goal` transcribes one they just said; `close_goal` says how one ended.',
		scope: 'tasks:read',
		writes: false,
		input: object({ includeClosed: { type: 'boolean', default: false } }),
		run: (ctx, args) => listGoals(ctx, { includeClosed: Boolean(args.includeClosed) })
	},
	{
		/*
		 * Making a goal is a commitment and stays out of here. Saying how one
		 * ended is a report — "I finished the book", "that one is not happening
		 * this year" — and refusing to record it just means it stays open,
		 * counting against a person who already did the thing.
		 */
		name: 'close_goal',
		title: 'Say how a goal ended',
		description:
			'Close a goal: achieved, missed, or abandoned. Missed and abandoned are different — missed is a deadline that passed, abandoned is a decision to stop — and both are worth recording honestly rather than being rounded to one. Takes the id `goals` gives. There is no tool that opens a goal; that is the person\u2019s to make.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The goal\u2019s id.' },
				status: {
					type: 'string',
					enum: ['achieved', 'missed', 'abandoned'],
					description: 'How it ended.'
				},
				note: text('A line about how it went, if they said one.')
			},
			['id', 'status']
		),
		run: (ctx, args) => {
			closeGoal(ctx, Number(args.id), { status: args.status, outcome: args.note });
			return { ok: true };
		}
	},

	// ── Writing ──────────────────────────────────────────────────────────────
	{
		/*
		 * `close_goal` already takes the status the app uses, and `open` is one
		 * of them — but the tool's enum did not offer it, so a goal could be
		 * closed by an assistant and only reopened by hand.
		 */
		/*
		 * Putting existing work against a goal.
		 *
		 * `add_todo` links what it creates, which covers "break this goal into
		 * tasks". This is the other half: work that already exists and turns out
		 * to belong to something.
		 *
		 * Additive on purpose. The page's own save replaces the whole set — it
		 * shows every checkbox, so it can — and a caller that knows about three
		 * todos calling that would silently unlink everything else on the goal.
		 */
		name: 'link_to_goal',
		title: 'Count work towards a goal',
		description:
			'Attach todos or repeating blocks to a goal, so finishing them moves its progress. Adds to what is already linked; nothing is replaced. `goals` gives the goal id and what it already has on it.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				goalId: { type: 'integer', description: 'The goal’s id, as `goals` gave it.' },
				todoIds: {
					type: 'array',
					items: { type: 'integer' },
					description: 'Todo ids, as `todos` gives them.'
				},
				slotIds: {
					type: 'array',
					items: { type: 'integer' },
					description: 'Ids of repeating blocks, for a goal met by doing something weekly.'
				}
			},
			['goalId']
		),
		run: (ctx, args) =>
			addGoalLinks(ctx, Number(args.goalId), {
				todoIds: (args.todoIds as unknown[]) ?? [],
				slotIds: (args.slotIds as unknown[]) ?? []
			})
	},
	{
		name: 'unlink_from_goal',
		title: 'Take work off a goal',
		description:
			'Detach todos or blocks from a goal. Only the ones named; everything else it counts stays.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				goalId: { type: 'integer', description: 'The goal’s id.' },
				todoIds: { type: 'array', items: { type: 'integer' }, description: 'Todo ids.' },
				slotIds: {
					type: 'array',
					items: { type: 'integer' },
					description: 'Ids of repeating blocks.'
				}
			},
			['goalId']
		),
		run: (ctx, args) =>
			removeGoalLinks(ctx, Number(args.goalId), {
				todoIds: (args.todoIds as unknown[]) ?? [],
				slotIds: (args.slotIds as unknown[]) ?? []
			})
	},
	{
		name: 'reopen_goal',
		title: 'Reopen a goal',
		description:
			'Put a closed goal back to open. Its outcome note is cleared and the date it was closed on goes with it, so a reopened goal does not read as having been finished at some point in the past.',
		scope: 'tasks:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The goal\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			closeGoal(ctx, Number(args.id), { status: 'open' });
			return { ok: true };
		}
	},
	{
		/*
		 * Editing is not committing. The goal exists because the person made
		 * it; a rename, a fixed target or a horizon that turned out wrong is
		 * theirs to ask for. Making one is still not a tool — see `goals`.
		 */
		name: 'change_goal',
		title: 'Change a goal',
		description:
			'Rename a goal, or change its notes, horizon, start date, target or unit. Only the fields given change. Saying how it ended is `close_goal`, not this.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The goal\u2019s id, as `goals` gives it.' },
				title: text('The new name, in the person\u2019s own words.'),
				notes: text('The new notes.'),
				horizon: text('week, month, quarter, semester or year.'),
				startDate: text('The day its period starts from, as YYYY-MM-DD.'),
				targetValue: { type: 'number', description: 'The number it is aiming at.' },
				unit: text('What the target counts — pages, km, sessions.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listGoals(ctx, { includeClosed: true }).find((g) => g.id === Number(args.id));
			if (!current) throw new NotFoundError('goal');
			updateGoal(ctx, current.id, {
				title: args.title ?? current.title,
				notes: args.notes ?? current.notes ?? '',
				areaId: current.areaId,
				notebookId: current.notebookId,
				targetValue: args.targetValue ?? current.targetValue,
				unit: args.unit ?? current.unit,
				horizon: args.horizon ?? current.horizon,
				startDate: args.startDate ? day(args.startDate, 'startDate') : undefined
			});
			return { ok: true };
		}
	},
	{
		name: 'diary',
		title: 'Recent diary entries',
		description:
			'What has been written lately, newest first. An entry can belong to a notebook or to no notebook at all.',
		scope: 'notes:read',
		writes: false,
		input: object({ limit: count('How many entries.', 20) }),
		run: (ctx, args) => listEntries(ctx).slice(0, limitOf(args, 20))
	},
	{
		name: 'write_entry',
		title: 'Write a diary entry',
		description:
			'Add an entry. Markdown. Writing one when asked is the point of this tool — keep their words and their voice where you have them, and do not invent an entry nobody asked for. Put it in a notebook when it is about one subject; leave the notebook off for an ordinary day.',
		scope: 'notes:write',
		writes: true,
		input: object(
			{
				content: text('The entry, as Markdown.'),
				tags: text('Comma-separated tags.'),
				notebookId: { type: 'integer', description: 'The notebook it belongs to, if any.' }
			},
			['content']
		),
		run: (ctx, args) => {
			const id = createEntry(ctx, {
				content: args.content,
				tags: args.tags ?? '',
				notebookId: args.notebookId ?? null
			});
			return { id };
		}
	},
	{
		name: 'notebooks',
		title: 'Notebooks',
		description:
			'The subjects being written against — a trip, a renovation, a book. Ask for these before writing an entry into one.',
		scope: 'notes:read',
		writes: false,
		input: object({}),
		run: (ctx) => listNotebooks(ctx)
	},
	{
		name: 'add_notebook',
		title: 'Make a notebook',
		description:
			'Make a notebook — a subject written against with no deadline: a book, a trip, a renovation. `write_entry` files notes into it by name.',
		scope: 'notes:write',
		writes: true,
		input: object(
			{
				title: text('What it is about.'),
				description: text('A line under the title, shown on its page.')
			},
			['title']
		),
		run: (ctx, args) => ({
			id: createNotebook(ctx, { title: args.title, description: args.description })
		})
	},
	{
		/*
		 * The one notebook deletion an assistant gets: an empty one.
		 *
		 * Notebooks with anything in them are under the same rule as people,
		 * habits and goals — never deletable through a tool, because what they
		 * hold is somebody's writing. But a notebook made by mistake a minute
		 * ago holds nothing, and "remove it in the app yourself" for a thing
		 * the assistant just created is ceremony with no one to protect.
		 */
		name: 'remove_notebook',
		title: 'Remove an empty notebook',
		description:
			'Delete a notebook that holds nothing — no notes, no tasks, no goals. One with anything in it is refused with what it holds: somebody\u2019s writing is deleted by them in the app, never through a tool. For a notebook made by mistake.',
		scope: 'notes:write',
		writes: true,
		input: object(
			{ id: { type: 'integer', description: 'The notebook\u2019s id, as `notebooks` gives it.' } },
			['id']
		),
		run: (ctx, args) => {
			const held = contentsOf(ctx, Number(args.id));
			const entries = held.entries.length;
			const tasks = held.todos.length + held.blocks.length;
			const goals = held.goals.length;
			if (entries + tasks + goals > 0)
				throw new ValidationError(
					`That notebook holds ${entries} note(s), ${tasks} task(s) and ${goals} goal(s). What is written in it is deleted by the person, in the app — not through a tool.`
				);
			deleteNotebook(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'share_notebook',
		title: 'Share a notebook with the family',
		description:
			'Share one of the person\u2019s notebooks with everybody on their family plan — they read it and write their own entries into it — or stop sharing with `shared: false`. Only its owner\u2019s to flip, and only when they asked.',
		scope: 'notes:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The notebook\u2019s id, as `notebooks` gives it.' },
				shared: { type: 'boolean', description: 'False stops the sharing. True if left out.' }
			},
			['id']
		),
		run: (ctx, args) => {
			setNotebookShared(
				ctx,
				Number(args.id),
				args.shared === undefined ? true : Boolean(args.shared)
			);
			return { ok: true };
		}
	},
	{
		name: 'ideas',
		title: 'Ideas',
		description:
			'Things caught before they evaporated, newest first. An idea is not a task: nobody has committed to doing it, which is what makes it cheap to write down.',
		scope: 'ideas:read',
		writes: false,
		input: object({ limit: count('How many.', 50) }),
		run: (ctx, args) => listIdeas(ctx).slice(0, limitOf(args, 50))
	},
	{
		name: 'add_idea',
		title: 'Catch an idea',
		description:
			'Write an idea down without deciding where it belongs. The lowest-friction thing here; prefer it to a todo when the person has not said they will do it.',
		scope: 'ideas:write',
		writes: true,
		input: object({ content: text('The idea.'), tags: text('Comma-separated tags.') }, ['content']),
		run: (ctx, args) => ({ id: createIdea(ctx, { content: args.content, tags: args.tags ?? '' }) })
	},

	// ── The kitchen and the list ─────────────────────────────────────────────
	{
		/*
		 * Anything an assistant can create, it has to be able to take back.
		 * `add_idea` with no `remove_idea` means a misheard sentence is a row
		 * somebody else has to go and delete.
		 */
		name: 'remove_idea',
		title: 'Delete an idea',
		description:
			'Delete an idea — for one added by mistake, or one that has been dealt with. It is gone, not archived, so prefer leaving it alone unless the person asked.',
		scope: 'ideas:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The idea\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteIdea(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'change_idea',
		title: 'Change an idea',
		description:
			'Rewrite an idea, or retag it. Only the fields given change — this is for a misheard word or a better tag, not for turning it into something else.',
		scope: 'ideas:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The idea\u2019s id, as `ideas` gives it.' },
				content: text('The idea, rewritten.'),
				tags: text('Comma-separated tags, replacing the old ones.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listIdeas(ctx).find((i) => i.id === Number(args.id));
			if (!current) throw new NotFoundError('idea');
			updateIdea(ctx, current.id, {
				content: args.content ?? current.content,
				tags: args.tags ?? current.tags.map((t) => t.name).join(', ')
			});
			return { ok: true };
		}
	},
	{
		name: 'shopping_list',
		title: 'The shopping list',
		description:
			'What is to buy and what is already in the cupboard. An item is a thing, not a line: ticking it bought puts it back in the cupboard rather than deleting it.',
		scope: 'shopping:read',
		writes: false,
		input: object({}),
		run: (ctx) => listItems(ctx)
	},
	{
		name: 'add_to_shopping_list',
		title: 'Add to the shopping list',
		description:
			'Put something on the list. If the cupboard already has it, this says so rather than adding a second one.',
		scope: 'shopping:write',
		writes: true,
		input: object(
			{
				name: text('What to buy.'),
				type: {
					type: 'string',
					enum: ['replenish', 'someday'],
					description:
						'`replenish` is something the cupboard runs out of and wants again; `someday` is a wishlist item. Default `replenish`.',
					default: 'replenish'
				},
				notes: text('Anything else about it.'),
				section: text('The section to file it under, by name — `shopping_categories` lists them.')
			},
			['name']
		),
		run: (ctx, args) => {
			let shoppingCategoryId: number | undefined;
			const said = typeof args.section === 'string' ? args.section.trim().toLowerCase() : '';
			if (said) {
				const all = listShoppingCategories(ctx) as { id: number; name: string }[];
				const hit =
					all.find((c) => c.name.toLowerCase() === said) ??
					all.find((c) => c.name.toLowerCase().includes(said));
				if (!hit)
					throw new ValidationError(
						`No section called "${String(args.section)}". This list has: ${all.map((c) => c.name).join(', ') || 'none yet'}.`
					);
				shoppingCategoryId = hit.id;
			}
			return createItem(ctx, {
				name: args.name,
				type: args.type ?? 'replenish',
				notes: args.notes ?? '',
				...(shoppingCategoryId !== undefined ? { shoppingCategoryId } : {})
			});
		}
	},
	{
		name: 'tick_bought',
		title: 'Tick something bought',
		description:
			'Mark an item bought, which moves it out of "to buy" and into the cupboard. The row stays: the same thing is bought again the next time it runs out.',
		scope: 'shopping:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The item’s id.' } }, ['id']),
		run: (ctx, args) => setBought(ctx, Number(args.id), true)
	},
	{
		/*
		 * The way back out of the cupboard.
		 *
		 * Every verb here had exactly one direction, and an assistant tidying a
		 * list found the wall immediately: it could tick a thing bought and it
		 * could delete a row, so the only way to undo a mistaken tick was to
		 * destroy the item and make a new one — losing its category, its notes
		 * and every price ever recorded against it. A one-way tool does not
		 * produce a refusal; it produces a workaround, and the workaround is
		 * always worse than the thing it stands in for.
		 */
		name: 'untick_bought',
		title: 'Put something back on the list',
		description:
			'Undo a tick: the item comes out of the cupboard and back onto "to buy". Use it when something was marked bought by mistake, or when it has run out again. Nothing is lost either way — the row, its category and its price history are the same row.',
		scope: 'shopping:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The item\u2019s id.' } }, ['id']),
		run: (ctx, args) => setBought(ctx, Number(args.id), false)
	},
	{
		/*
		 * Snoozing is how the list stays short without anybody losing anything,
		 * so it needs both directions for the same reason ticking does.
		 */
		name: 'archive_item',
		title: 'Put something aside for now',
		description:
			'Put an item away without deleting it — for something not wanted this week. It keeps everything about itself and comes back with `unarchive_item`. Prefer this to removing when somebody says "not now" rather than "never".',
		scope: 'shopping:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The item\u2019s id.' } }, ['id']),
		run: (ctx, args) => setSnoozed(ctx, Number(args.id), true)
	},
	{
		name: 'unarchive_item',
		title: 'Bring something back to the list',
		description:
			'Bring back an item that was put away, so it shows on the list again. `shopping_list` says which items are archived.',
		scope: 'shopping:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The item\u2019s id.' } }, ['id']),
		run: (ctx, args) => setSnoozed(ctx, Number(args.id), false)
	},
	{
		name: 'remove_from_shopping_list',
		title: 'Take something off the shopping list',
		description:
			'Remove an item because it is not wanted — "take milk off", "we already have that". Not the same as `tick_bought`, which records that it *was* bought and keeps it in the history and the price record. Takes the id `shopping_list` gives.',
		scope: 'shopping:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The item\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteItem(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'recipes',
		title: 'Recipes',
		description:
			'Every recipe, with its ingredients. An ingredient here is a shopping item with an amount, which is what lets a meal on a day fill the shopping list.',
		scope: 'kitchen:read',
		writes: false,
		input: object({ id: { type: 'integer', description: 'One recipe, in full.' } }),
		run: (ctx, args) => {
			if (!args.id) return listRecipes(ctx);
			const id = Number(args.id);
			return { ...getRecipe(ctx, id), ingredients: ingredientsOf(ctx, id) };
		}
	},
	{
		name: 'add_recipe',
		title: 'Add a recipe',
		description:
			'Write a recipe down. Ingredients are one per line — "200 g flour", "2 eggs" — and each becomes a shopping item, so the list knows about them the day the meal is planned.',
		scope: 'kitchen:write',
		writes: true,
		input: object(
			{
				title: text('What it is called.'),
				ingredients: text('One per line, quantity first.'),
				method: text('How to make it, as Markdown.'),
				servings: { type: 'integer', description: 'How many it feeds.' },
				minutes: { type: 'integer', description: 'How long it takes.' },
				source: text('Where it came from.')
			},
			['title']
		),
		run: (ctx, args) => {
			const id = createRecipe(ctx, {
				title: args.title,
				method: args.method ?? '',
				notes: '',
				servings: args.servings ?? null,
				minutes: args.minutes ?? null,
				source: args.source ?? ''
			});
			// The ingredients are a second call because each one becomes a shopping
			// item: `importIngredients` is the same parser the paste box uses, so a
			// recipe added here and one pasted in behave identically afterwards.
			const added = args.ingredients ? importIngredients(ctx, id, args.ingredients) : 0;
			return { id, ingredients: added };
		}
	},
	{
		/*
		 * `kitchen:write`\u2019s sentence has promised "add and change recipes"
		 * since the scope was written; this is the change half. Ingredients are
		 * additive here — replacing the whole set from a partial list would
		 * silently delete shopping items other meals point at.
		 */
		name: 'change_recipe',
		title: 'Change a recipe',
		description:
			'Change a recipe\u2019s title, method, servings, time or source, and add ingredients — one per line, quantity first. Only the fields given change, and existing ingredients stay.',
		scope: 'kitchen:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The recipe\u2019s id, as `recipes` gives it.' },
				title: text('The new name.'),
				method: text('How to make it, as Markdown.'),
				ingredients: text('Ingredients to add, one per line.'),
				servings: { type: 'integer', description: 'How many it feeds.' },
				minutes: { type: 'integer', description: 'How long it takes.' },
				source: text('Where it came from.')
			},
			['id']
		),
		run: (ctx, args) => {
			const id = Number(args.id);
			const current = getRecipe(ctx, id);
			updateRecipe(ctx, id, {
				title: args.title ?? current.title,
				method: args.method ?? current.method,
				notes: current.notes,
				servings: args.servings ?? current.servings,
				minutes: args.minutes ?? current.minutes,
				source: args.source ?? current.source
			});
			const added = args.ingredients ? importIngredients(ctx, id, args.ingredients) : 0;
			return { ok: true, ingredients: added };
		}
	},
	{
		name: 'cooked_recipe',
		title: 'Say a recipe was cooked',
		description:
			'Record that a meal was made — `recipes` shows when each was last cooked, and this is what sets it. Name the ingredient ids that ran out and they land back on the shopping list, which is the loop the kitchen exists to close.',
		scope: 'kitchen:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The recipe\u2019s id, as `recipes` gives it.' },
				ranOutOf: {
					type: 'array',
					items: { type: 'integer' },
					description:
						'Ingredient item ids that were used up, as the recipe\u2019s ingredient list gives them.'
				}
			},
			['id']
		),
		run: (ctx, args) => {
			cooked(ctx, Number(args.id), ((args.ranOutOf as unknown[]) ?? []).map(Number));
			return { ok: true };
		}
	},
	{
		name: 'archive_recipe',
		title: 'Put a recipe away',
		description:
			'Archive a recipe — out of the everyday list, not deleted — or bring one back with `archived: false`. For the dish nobody makes any more that somebody may yet ask for.',
		scope: 'kitchen:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The recipe\u2019s id.' },
				archived: {
					type: 'boolean',
					description: 'False brings it back. True if left out.',
					default: true
				}
			},
			['id']
		),
		run: (ctx, args) => {
			setArchived(
				ctx,
				Number(args.id),
				args.archived === undefined ? true : Boolean(args.archived)
			);
			return { ok: true };
		}
	},
	{
		name: 'file_shopping_item',
		title: 'File an item into a section',
		description:
			'Move a shopping item into a section — "put the milk under Dairy". Takes the item\u2019s id from `shopping_list` and the section by name from `shopping_categories`; an empty section name unfiles it. A name matching no section is refused with the ones that exist.',
		scope: 'shopping:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The item\u2019s id, as `shopping_list` gives it.' },
				section: text('The section, by name. Empty unfiles the item.')
			},
			['id']
		),
		run: (ctx, args) => {
			const said = typeof args.section === 'string' ? args.section.trim().toLowerCase() : '';
			let categoryId: number | null = null;
			if (said) {
				const all = listShoppingCategories(ctx) as { id: number; name: string }[];
				const hit =
					all.find((c) => c.name.toLowerCase() === said) ??
					all.find((c) => c.name.toLowerCase().includes(said));
				if (!hit)
					throw new ValidationError(
						`No section called "${String(args.section)}". This list has: ${all.map((c) => c.name).join(', ') || 'none yet'}.`
					);
				categoryId = hit.id;
			}
			setItemCategory(ctx, Number(args.id), categoryId);
			return { ok: true };
		}
	},
	{
		name: 'shopping_categories',
		title: 'The shopping list\u2019s sections',
		description:
			'How the shopping list is sectioned — produce, cleaning, whatever the person keeps. Read it before filing an item somewhere.',
		scope: 'shopping:read',
		writes: false,
		input: object({}),
		run: (ctx) => listShoppingCategories(ctx)
	},
	{
		name: 'add_shopping_category',
		title: 'Add a shopping section',
		description:
			'Make a new section for the shopping list — and say whether it holds food, because only food sections can feed recipes as ingredients.',
		scope: 'shopping:write',
		writes: true,
		input: object(
			{
				name: text('The section\u2019s name — "Frozen", "Cleaning".'),
				holdsFood: {
					type: 'boolean',
					description: 'Whether what is in it is food. Off if left out.'
				}
			},
			['name']
		),
		run: (ctx, args) => ({
			id: createShoppingCategory(ctx, { name: args.name, isFood: args.holdsFood === true })
		})
	},
	{
		name: 'change_shopping_category',
		title: 'Rename a shopping section',
		description:
			'Rename a section, or change whether it holds food. Only the fields given change; the items filed under it stay exactly where they are.',
		scope: 'shopping:write',
		writes: true,
		input: object(
			{
				id: {
					type: 'integer',
					description: 'The section\u2019s id, as `shopping_categories` gives it.'
				},
				name: text('The new name.'),
				holdsFood: { type: 'boolean', description: 'Whether what is in it is food.' },
				shareWithFamily: {
					type: 'boolean',
					description:
						'Share the section with everybody on the family plan, or stop. Only its owner\u2019s to flip.'
				}
			},
			['id']
		),
		run: (ctx, args) => {
			if (args.name !== undefined && args.name !== null && args.name !== '')
				renameCategory(ctx, Number(args.id), args.name);
			if (args.holdsFood !== undefined && args.holdsFood !== null)
				setCategoryFood(ctx, Number(args.id), Boolean(args.holdsFood));
			if (args.shareWithFamily !== undefined && args.shareWithFamily !== null)
				setCategoryShared(ctx, Number(args.id), Boolean(args.shareWithFamily));
			return { ok: true };
		}
	},
	{
		name: 'remove_shopping_category',
		title: 'Delete a shopping section',
		description:
			'Delete a section. Its items are not touched — they stay on the list, just unfiled. A section is a shelf label, and removing the label must not empty the shelf.',
		scope: 'shopping:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The section\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteShoppingCategory(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'record_price',
		title: 'Record what an item cost',
		description:
			'Write down what was paid for a shopping item — "milk was 6,50 today". The list keeps a small price history per item, which is how it can notice drift. Takes the id `shopping_list` gives, and the price as the person said it.',
		scope: 'shopping:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The item\u2019s id.' },
				price: text('The price, in the account\u2019s own currency — "6,50" or "6.50" both work.')
			},
			['id', 'price']
		),
		run: (ctx, args) => {
			recordPaid(ctx, Number(args.id), args.price);
			return { ok: true };
		}
	},

	// ── Goals, and where they stand ──────────────────────────────────────────
	{
		/*
		 * Creation arrived late, and the earlier refusal is kept in the words:
		 * a goal is a commitment the person makes. This transcribes one they
		 * just said — it must never be a way for an assistant to invent one.
		 */
		name: 'add_goal',
		title: 'Write down a goal they made',
		description:
			'Transcribe a goal the person just committed to, in their own words — "apply to twenty companies this quarter". Never invent one, and never add a goal they did not say: a goal is a commitment, and the commitment is theirs. `goal_areas` lists the areas one can be filed under.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				title: text('The goal, in the person\u2019s own words.'),
				horizon: text('week, month, quarter, semester or year.'),
				notes: text('Anything else they said about it.'),
				startDate: text('The day its period starts from, as YYYY-MM-DD. Today if left out.'),
				area: text('The area to file it under, by name — `goal_areas` lists them.'),
				targetValue: {
					type: 'number',
					description: 'The number it aims at, when it counts something.'
				},
				unit: text('What the target counts — applications, km, pages.')
			},
			['title', 'horizon']
		),
		run: (ctx, args) => {
			let areaId: number | undefined;
			if (args.area !== undefined && args.area !== null && args.area !== '') {
				const areas = listAreas(ctx);
				const said = String(args.area).trim().toLowerCase();
				const hit = areas.find((a) => a.name.toLowerCase() === said);
				if (!hit)
					throw new ValidationError(
						`No area called "${String(args.area)}". This account has: ${areas.map((a) => a.name).join(', ') || 'none yet'}.`
					);
				areaId = hit.id;
			}
			const id = createGoal(ctx, {
				title: args.title,
				horizon: args.horizon,
				notes: args.notes,
				startDate: args.startDate,
				areaId,
				targetValue: args.targetValue,
				unit: args.unit
			});
			return { id };
		}
	},
	{
		/*
		 * `goals.current_value` used to move only when a linked todo finished,
		 * so a goal counted by hand — CVs sent, pages read — sat at zero
		 * however much was done. Saying "I sent three today" is a report, and
		 * reports get recorded.
		 */
		name: 'log_goal_progress',
		title: 'Move a goal\u2019s number',
		description:
			'Record progress on a goal that counts something: pass `value` to set where it stands, or `delta` to add what just happened — "I sent three more CVs" is `delta: 3`. Exactly one of the two. `goals` shows the current number.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The goal\u2019s id.' },
				value: { type: 'number', description: 'Where it stands now, absolute.' },
				delta: { type: 'number', description: 'How much just happened, added to where it stands.' }
			},
			['id']
		),
		run: (ctx, args) => {
			const gaveValue = args.value !== undefined && args.value !== null;
			const gaveDelta = args.delta !== undefined && args.delta !== null;
			if (gaveValue === gaveDelta)
				throw new ValidationError('Say either `value` or `delta` — exactly one.');

			const current = listGoals(ctx, { includeClosed: true }).find((g) => g.id === Number(args.id));
			if (!current) throw new NotFoundError('goal');

			const next = gaveValue
				? Number(args.value)
				: Number(current.currentValue ?? 0) + Number(args.delta);
			setGoalProgress(ctx, current.id, next);
			return { ok: true, currentValue: next };
		}
	},
	{
		name: 'goal_areas',
		title: 'The areas goals are filed under',
		description:
			'The areas of life a goal can belong to — career, health, whatever the person keeps. Read it before filing a goal; `add_goal_area` makes a missing one.',
		scope: 'tasks:read',
		writes: false,
		input: object({}),
		run: (ctx) => listAreas(ctx)
	},
	{
		name: 'add_goal_area',
		title: 'Add a goal area',
		description:
			'Make a new area to file goals under. Only when the person named one that does not exist — `goal_areas` says what already does.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				name: text('The area\u2019s name.'),
				color: text('A hex colour like #1d4ed8, if they chose one.')
			},
			['name']
		),
		run: (ctx, args) => ({ id: createArea(ctx, { name: args.name, color: args.color }) })
	},

	// ── Habits, whole ────────────────────────────────────────────────────────
	{
		name: 'all_habits',
		title: 'Every habit',
		description:
			'The full list of habits, due today or not — id, name, type and which days each is scheduled. `habits` is today\u2019s view with streaks; this is the one to read before adding or changing one.',
		scope: 'habits:read',
		writes: false,
		input: object({}),
		run: (ctx) => listHabits(ctx)
	},
	{
		name: 'add_habit',
		title: 'Add a habit',
		description:
			'Start tracking a habit: something to keep doing (`good`), to avoid (`bad`), or just to watch (`neutral`). Scheduled days come in the same shape `all_habits` shows for existing ones; leave them out for every day.',
		scope: 'habits:write',
		writes: true,
		input: object(
			{
				name: text('The habit, in the person\u2019s own words.'),
				type: {
					type: 'string',
					enum: [...HABIT_TYPES],
					description: 'good to keep, bad to avoid, neutral to watch.'
				},
				description: text('Anything else about it.'),
				scheduledDays: text(
					'The days it is due, in the shape `all_habits` shows. Every day if left out.'
				)
			},
			['name']
		),
		run: (ctx, args) => ({
			id: createHabit(ctx, {
				name: args.name,
				type: args.type,
				description: args.description,
				scheduledDays: args.scheduledDays
			})
		})
	},
	{
		name: 'change_habit',
		title: 'Change a habit',
		description:
			'Rename a habit or change its type, description or days. Only the fields given change; its history of kept days stays exactly as it was.',
		scope: 'habits:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The habit\u2019s id, as `all_habits` gives it.' },
				name: text('The new name.'),
				type: { type: 'string', enum: [...HABIT_TYPES], description: 'good, bad or neutral.' },
				description: text('The new description.'),
				scheduledDays: text('The new days, in the shape `all_habits` shows.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listHabits(ctx).find((h) => h.id === Number(args.id));
			if (!current) throw new NotFoundError('habit');
			updateHabit(ctx, current.id, {
				name: args.name ?? current.name,
				type: args.type ?? current.type,
				description: args.description ?? current.description,
				scheduledDays: args.scheduledDays ?? current.scheduledDays
			});
			return { ok: true };
		}
	},

	// ── Reminders ────────────────────────────────────────────────────────────
	{
		name: 'reminders',
		title: 'What will reach out, and when',
		description:
			'The reminders set to fire — each hangs off a block, because a reminder here is "tell me before this starts". Include the past to see what already fired.',
		scope: 'schedule:read',
		writes: false,
		input: object({ includePast: { type: 'boolean', default: false } }),
		run: (ctx, args) => listReminders(ctx, { includePast: Boolean(args.includePast) })
	},
	{
		/*
		 * There is deliberately no free-floating reminder. "Remind me at three
		 * to call the dentist" is a thing happening at three — put it on the day
		 * with `add_block`, then hang the reminder on it. The description says
		 * so, because the model will be asked exactly that sentence.
		 */
		name: 'remind_before_block',
		title: 'Set a reminder on a block',
		description:
			'Be told some minutes before a block starts — it reaches the phone even with the app closed. A reminder belongs to a block: for "remind me at three to call the dentist", first `add_block` the call at three, then set the reminder on it. Takes the id the day gives, like `slot:42`.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				id: text('The block\u2019s id, exactly as the day gave it.'),
				minutes: {
					type: 'integer',
					description: 'How many minutes before the start. 0 is at the start.'
				},
				message: text('What the nudge should say. The block\u2019s own name if left out.')
			},
			['id', 'minutes']
		),
		run: (ctx, args) => ({
			id: createReminder(ctx, {
				subjectId: recordIdOf(ctx, args.id),
				at: args.minutes,
				message: args.message
			})
		})
	},
	{
		name: 'dismiss_reminder',
		title: 'Dismiss a reminder',
		description:
			'Wave one reminder off so it does not fire — for "no need to remind me about that any more". Takes the id `reminders` gives; the block it sat on is untouched.',
		scope: 'schedule:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The reminder\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			dismissReminder(ctx, Number(args.id));
			return { ok: true };
		}
	},

	// ── The repeating week ───────────────────────────────────────────────────
	{
		name: 'repeating_week',
		title: 'The week as it repeats',
		description:
			'The blocks that make up every week — each with its weekday, time, length and category. Weekdays are numbered from Monday: 0 is Monday, 6 is Sunday. Not all of them are weekly: `repeats` says in words how often each one comes back, which can be every N weeks, every N days, or a day of the month. This is the template the days are generated from; `today` and `upcoming` show what it produced. Read it before changing Tuesdays rather than a Tuesday.',
		scope: 'schedule:read',
		writes: false,
		input: object({}),
		run: (ctx) =>
			listWeeklySlots(ctx).map((slot) => ({
				...slot,
				repeats: repeatsInWords(slot.recurrence, WEEKDAY_NAMES[slot.weekday] ?? 'that day')
			}))
	},
	{
		name: 'add_repeating_block',
		title: 'Put a block on every week',
		description:
			'Add a block that comes back — "gym on Tuesdays at seven", "the bins every other Tuesday", "rent on the first". Weekly unless `repeats` says otherwise. This changes every week from now on; `add_block` is the one for a single day. Weekdays count from Monday: 0 is Monday, 6 is Sunday. A block can be a bare category rather than a named thing — leave the title out and it shows as the category itself, which is what "put work in those hours" means.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				weekday: {
					type: 'integer',
					description: '0 is Monday, 6 is Sunday — the week starts on Monday here.'
				},
				title: text(
					'What it is — shown on the block. Leave it out for a block that is just the category.'
				),
				start_time: text('When it starts, as HH:MM on a 24-hour clock.'),
				minutes: count('How long it runs, in minutes.', 60),
				category: text('Which part of life it belongs to, by name — `categories` lists them.'),
				remind_minutes: {
					type: 'integer',
					description: 'Minutes before each occurrence to be reminded. No reminder if left out.'
				},
				...repeatArgs,
				...ratingArgs
			},
			['weekday', 'start_time']
		),
		run: (ctx, args) => {
			const chosen = categoryByName(ctx, args.category);
			// Every-N counts from the next of the chosen weekday, so "every other
			// Tuesday" starts on a Tuesday rather than on whatever today is.
			const anchor = recFormatDate(nextWeekdayOnOrAfter(ctx.now, args.weekday));
			const id = createSlot(ctx, {
				weekday: args.weekday,
				startTime: args.start_time,
				durationMinutes: args.minutes ?? 60,
				mode: 'category',
				categoryId: chosen.id,
				label: args.title,
				remindLeadMinutes: args.remind_minutes,
				recurrence: recurrenceFromArgs(args, anchor),
				...(gaveARating(args) ? { ratings: ratingsOf(args) } : {})
			});
			return { id, category: chosen.name };
		}
	},
	{
		name: 'change_repeating_block',
		title: 'Change a repeating block',
		description:
			'Change every future occurrence of a repeating block: its weekday, time, length, how often it comes back, the text on it, its category or its reminder. This is "move gym to Wednesdays" or "make it every other week"; `change_block` is "move this Wednesday\u2019s gym". Only the fields given change. Takes the id `repeating_week` gives.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				id: {
					type: 'integer',
					description: 'The repeating block\u2019s id, as `repeating_week` gives it.'
				},
				weekday: {
					type: 'integer',
					description: 'The new weekday. 0 is Monday, 6 is Sunday.'
				},
				start_time: text('The new start, as HH:MM.'),
				minutes: { type: 'integer', description: 'The new length, in minutes.' },
				title: text(
					'The text shown on the block. A block that names an activity stays that activity — this only changes what the block says, which is how "add stretching to the morning routine\u2019s text" is done.'
				),
				category: text('Refile it under this part of life, by name.'),
				remind_minutes: { type: 'integer', description: 'The new reminder lead. 0 turns it off.' },
				...repeatArgs
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listWeeklySlots(ctx).find((w) => w.id === Number(args.id));
			if (!current) throw new NotFoundError('block');

			const refiled =
				args.category !== undefined && args.category !== null && args.category !== ''
					? {
							mode: 'category',
							categoryId: categoryByName(ctx, args.category).id,
							activityId: null
						}
					: { mode: current.mode, categoryId: current.categoryId, activityId: current.activityId };

			updateSlot(ctx, current.id, {
				weekday: args.weekday ?? current.weekday,
				startTime: args.start_time ?? current.startTime,
				durationMinutes: args.minutes ?? current.durationMinutes,
				...refiled,
				label: args.title ?? current.label,
				remindLeadMinutes: args.remind_minutes ?? current.remindLeadMinutes,
				recurrence:
					recurrenceFromArgs(
						args,
						recFormatDate(nextWeekdayOnOrAfter(ctx.now, args.weekday ?? current.weekday))
					) ??
					current.recurrence ??
					undefined
			});
			return { ok: true };
		}
	},
	{
		name: 'remove_repeating_block',
		title: 'Take a block out of the week',
		description:
			'Remove a repeating block from every week to come. Its past occurrences and their record stay. For one day only, use `cancel_block` instead — this is the whole pattern.',
		scope: 'schedule:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The repeating block\u2019s id.' } }, [
			'id'
		]),
		run: (ctx, args) => {
			deleteSlots(ctx, [Number(args.id)]);
			return { ok: true };
		}
	},
	{
		name: 'categories',
		title: 'The parts of a life',
		description:
			'The categories blocks are filed under — the areas of this person\u2019s life, each with its colour. Read it before writing a block, so the name is real rather than guessed.',
		scope: 'schedule:read',
		writes: false,
		input: object({}),
		run: (ctx) => listCategories(ctx)
	},
	{
		name: 'activities',
		title: 'The named recurring things',
		description:
			'Activities are the named things inside categories — "piano", not just "music". A block can name one instead of a bare category. `add_activity` and `change_activity` write them.',
		scope: 'schedule:read',
		writes: false,
		input: object({}),
		run: (ctx) => listActivities(ctx)
	},
	{
		name: 'add_activity',
		title: 'Name a new recurring thing',
		description:
			'Add an activity — a named thing inside a category, like "piano" inside "music" — so blocks can name it instead of the bare category.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				name: text('What it is called.'),
				category: text('The category it belongs to, by name — `categories` lists them.'),
				description: text('A line about it, shown where it is edited.')
			},
			['name']
		),
		run: (ctx, args) => {
			const chosen = categoryByName(ctx, args.category);
			const id = createActivity(ctx, {
				name: args.name,
				categoryId: chosen.id,
				description: args.description
			});
			return { id, category: chosen.name };
		}
	},
	{
		/*
		 * The gap an assistant hit: asked to fold stretching into the morning
		 * routine, it could read the activity, rewrite every block that used
		 * it, and not change the one sentence describing what the routine is.
		 */
		name: 'change_activity',
		title: 'Rename an activity, or say what it is',
		description:
			'Change an activity: its name, the line describing it, or which category it belongs to. Takes the id `activities` gives. Only the fields you pass change. Blocks that name it follow the change; nothing on any day is moved.',
		scope: 'schedule:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The activity\u2019s id, as `activities` gave it.' },
				name: text('A new name.'),
				description: text('A new line about it. Pass an empty string to clear it.'),
				category: text('Move it to this category, by name.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = (
				listActivities(ctx) as {
					id: number;
					name: string;
					categoryId: number;
					description: string | null;
				}[]
			).find((a) => a.id === Number(args.id));
			if (!current) throw new NotFoundError('activity');

			updateActivity(ctx, Number(args.id), {
				name: args.name ?? current.name,
				categoryId:
					args.category === undefined ? current.categoryId : categoryByName(ctx, args.category).id,
				description: args.description === undefined ? current.description : args.description
			});
			return { ok: true };
		}
	},

	// ── People ───────────────────────────────────────────────────────────────
	{
		name: 'people',
		title: 'The people in their life',
		description:
			'Everybody the person keeps a page for — name, relationship, birthday, contact details. These are other people\u2019s facts held in this account, which is why they sit behind their own permission.',
		scope: 'people:read',
		writes: false,
		input: object({}),
		run: (ctx) => listPeople(ctx)
	},
	{
		name: 'upcoming_birthdays',
		title: 'Whose birthday is coming',
		description:
			'Birthdays in the days ahead, soonest first — the answer to "whose birthday is coming up". Only people with a birthday written down appear.',
		scope: 'people:read',
		writes: false,
		input: object({ days: count('How many days ahead to look.', 30) }),
		run: (ctx, args) => {
			const horizon = Math.min(Math.max(Number(args.days ?? 30), 1), 366);
			const today = localDateOf(ctx.now, ctx.tz);
			const start = new Date(`${today}T12:00:00`);

			const coming: { id: number; name: string; birthday: string; date: string; inDays: number }[] =
				[];
			for (const person of listPeople(ctx)) {
				if (!person.birthday) continue;
				const monthDay = person.birthday.slice(-5); // both shapes end -MM-DD
				for (let ahead = 0; ahead <= horizon; ahead++) {
					const at = new Date(start.getTime() + ahead * 24 * 60 * 60 * 1000);
					const local = at.toISOString().slice(0, 10);
					if (local.slice(5) === monthDay) {
						coming.push({
							id: person.id,
							name: person.name,
							birthday: person.birthday,
							date: local,
							inDays: ahead
						});
						break;
					}
				}
			}
			return coming.sort((a, b) => a.inDays - b.inDays);
		}
	},
	{
		name: 'add_person',
		title: 'Add a person',
		description:
			'Keep a page for somebody — name at minimum; birthday as YYYY-MM-DD, or --MM-DD when the year is unknown. A birthday written down announces itself on the morning, unless told not to.',
		scope: 'people:write',
		writes: true,
		input: object(
			{
				name: text('Their name, as the person says it.'),
				relationship: {
					type: 'string',
					enum: [...RELATIONSHIPS],
					description: 'The nearest of these — "sister" is family, "landlord" is professional.'
				},
				birthday: text('YYYY-MM-DD, or --MM-DD without a year.'),
				remindOnBirthday: {
					type: 'boolean',
					description: 'Announce the birthday that morning. On if left out.'
				},
				phone: text('A phone number.'),
				email: text('An email address.'),
				notes: text('Anything else worth keeping.')
			},
			['name']
		),
		run: (ctx, args) => ({
			id: createPerson(ctx, {
				name: args.name,
				relationship: args.relationship,
				birthday: args.birthday,
				remindOnBirthday: args.remindOnBirthday,
				phone: args.phone,
				email: args.email,
				notes: args.notes
			})
		})
	},
	{
		name: 'change_person',
		title: 'Change a person\u2019s page',
		description:
			'Correct or extend what is recorded about somebody — a birthday learnt, a number changed. Only the fields given change. Takes the id `people` gives.',
		scope: 'people:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The person\u2019s id.' },
				name: text('The new name.'),
				relationship: {
					type: 'string',
					enum: [...RELATIONSHIPS],
					description: 'The new relationship, one of these.'
				},
				birthday: text('YYYY-MM-DD, or --MM-DD without a year.'),
				remindOnBirthday: {
					type: 'boolean',
					description: 'Whether the birthday announces itself.'
				},
				phone: text('The new phone number.'),
				email: text('The new email address.'),
				notes: text('The new notes.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = listPeople(ctx).find((one) => one.id === Number(args.id));
			if (!current) throw new NotFoundError('person');
			updatePerson(ctx, current.id, {
				name: args.name ?? current.name,
				relationship: args.relationship ?? current.relationship,
				birthday: args.birthday ?? current.birthday,
				remindOnBirthday: args.remindOnBirthday ?? current.remindOnBirthday,
				phone: args.phone ?? current.phone,
				email: args.email ?? current.email,
				notes: args.notes ?? current.notes
			});
			return { ok: true };
		}
	},

	// ── The day's wins, and the week's review ────────────────────────────────
	{
		name: 'daily_wins',
		title: 'Three things that went well',
		description:
			'The day\u2019s three wins, as written. A practice, not a log: three lines a day, and blank ones are simply not written yet.',
		scope: 'notes:read',
		writes: false,
		input: object({ date: text('The day, as YYYY-MM-DD. Today if left out.') }),
		run: (ctx, args) =>
			listWins(ctx, args.date ? day(args.date, 'date') : localDateOf(ctx.now, ctx.tz))
	},
	{
		name: 'record_win',
		title: 'Record a win',
		description:
			'Write one of the day\u2019s three good things, in the person\u2019s own words, into the first empty line. Refused when all three are written — a day holds three, and the fourth is tomorrow\u2019s first.',
		scope: 'notes:write',
		writes: true,
		input: object(
			{
				content: text('The win, exactly as they said it.'),
				date: text('The day it belongs to, as YYYY-MM-DD. Today if left out.')
			},
			['content']
		),
		run: (ctx, args) => {
			const forDate = args.date ? day(args.date, 'date') : localDateOf(ctx.now, ctx.tz);
			const existing = listWins(ctx, forDate);
			const contents: string[] = [];
			for (let position = 1; position <= WINS_PER_DAY; position++) {
				contents.push(existing.find((w) => w.position === position)?.content ?? '');
			}
			const empty = contents.findIndex((c) => !c.trim());
			if (empty === -1)
				throw new ValidationError('All three wins are already written for that day.');
			contents[empty] = String(args.content ?? '');
			saveWins(ctx, { forDate, contents });
			return { ok: true, position: empty + 1 };
		}
	},
	{
		name: 'weekly_review',
		title: 'How a week actually went',
		description:
			'A week read whole: planned against done, by category, with the three lines written about it. The heart of the app — this is what the Monday mail says, and what closing a week means. Defaults to the week now running.',
		scope: 'tasks:read',
		writes: false,
		input: object({
			weekStart: text('The Monday the week starts on, as YYYY-MM-DD. This week if left out.')
		}),
		run: (ctx, args) => {
			const weekStart = weekStartOf(args.weekStart, ctx.now);
			const { reading, loose } = readWeek(ctx, weekStart);
			return { weekStart, reading, loose, lines: listLines(ctx, weekStart) };
		}
	},
	{
		name: 'write_review_lines',
		title: 'Write the week\u2019s three lines',
		description:
			'Replace the three lines of a week\u2019s review — in the person\u2019s own words, and only when they said them. These are what they will reread in a year; never compose them unasked.',
		scope: 'tasks:write',
		writes: true,
		input: object(
			{
				lines: {
					type: 'array',
					items: { type: 'string' },
					description: 'Up to three lines, replacing what was there.'
				},
				weekStart: text('The Monday the week starts on. This week if left out.')
			},
			['lines']
		),
		run: (ctx, args) => {
			const lines = (args.lines as unknown[]) ?? [];
			if (!Array.isArray(lines) || lines.length === 0 || lines.length > LINES_PER_REVIEW)
				throw new ValidationError(`A review holds up to ${LINES_PER_REVIEW} lines.`);
			const weekStart = weekStartOf(args.weekStart, ctx.now);
			saveLines(ctx, { weekStart, contents: lines });
			return { ok: true, weekStart };
		}
	},

	// ── Data streams ─────────────────────────────────────────────────────────
	{
		name: 'data_streams',
		title: 'The numbers being tracked',
		description:
			'The account\u2019s data streams — weight, mood, sleep, anything a plugin or a person logs over time — each with its slug, kind and unit. `log_data_point` writes into one by its slug.',
		scope: 'streams:read',
		writes: false,
		input: object({}),
		run: (ctx) => listStreams(ctx).map((one) => serialiseStream(one))
	},
	{
		name: 'log_data_point',
		title: 'Log a reading',
		description:
			'Write one point into a data stream — "I weigh 82 today", "slept 6 hours". Takes the stream\u2019s slug as `data_streams` gives it; a slug that names nothing is refused with the list, never created on the quiet.',
		scope: 'streams:write',
		writes: true,
		input: object(
			{
				stream: text('The stream\u2019s slug, as `data_streams` gives it.'),
				value: { type: 'number', description: 'The reading.' },
				at: text('When it was taken, as an ISO instant. Now if left out.'),
				text: text('A word beside the number, if they said one.')
			},
			['stream', 'value']
		),
		run: (ctx, args) => {
			const slug = String(args.stream ?? '').trim();
			const stream = getStreamBySlug(ctx, slug, { throwIfMissing: false });
			if (!stream) {
				const known = listStreams(ctx).map((one) => one.slug);
				throw new ValidationError(
					known.length
						? `No stream called "${slug}". This account has: ${known.join(', ')}.`
						: 'This account has no data streams yet — declare one in the app or over the API first.'
				);
			}
			return pushPoints(ctx, slug, [
				{
					at: args.at ?? ctx.now.toISOString(),
					value: args.value,
					...(args.text !== undefined && args.text !== null ? { text: args.text } : {})
				}
			]);
		}
	},

	// ── Ideas, the other halves ──────────────────────────────────────────────
	{
		name: 'apply_idea',
		title: 'Mark an idea applied',
		description:
			'Say an idea was acted on, with a note about what came of it — or take that back by calling it again. Applied is not deleted: the idea stays, wearing what happened.',
		scope: 'ideas:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The idea\u2019s id, as `ideas` gives it.' },
				note: text('What came of it, if they said.')
			},
			['id']
		),
		run: (ctx, args) => {
			toggleApplied(ctx, Number(args.id), args.note);
			return { ok: true };
		}
	},
	{
		name: 'favorite_idea',
		title: 'Star an idea',
		description:
			'Star an idea, or unstar it by calling this again. A star is the person\u2019s to ask for — never decorate their inbox on your own judgement.',
		scope: 'ideas:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The idea\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			toggleFavorite(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		/*
		 * The question the whole tree exists to answer. Matches by name, and
		 * answers the way a person would: the chain of locations, root down.
		 */
		name: 'where_is',
		title: 'Where a thing lives',
		description:
			'Find a thing by name and say where it lives — "Living room \u203a White chest \u203a First drawer" — with its fields (a tape\u2019s length, a cable\u2019s plug). The inventory half of the shopping list.',
		scope: 'inventory:read',
		writes: false,
		input: object({ name: text('The thing, by name or part of it.') }, ['name']),
		run: (ctx, args) => {
			const wanted = String(args.name ?? '').toLowerCase();
			const hits = listShoppingItems(ctx)
				.filter((i) => i.name.toLowerCase().includes(wanted))
				.slice(0, 10)
				.map((i) => ({
					id: i.id,
					name: i.name,
					location: i.locationId ? pathOf(ctx, i.locationId).join(' \u203a ') : null,
					fields: JSON.parse(i.attributes || '{}')
				}));
			return { things: hits };
		}
	},
	{
		name: 'locations',
		title: 'The locations tree',
		description:
			'Every location, nested the way the house is — rooms holding furniture holding drawers — each with how many things sit directly in it.',
		scope: 'inventory:read',
		writes: false,
		input: object({}),
		run: (ctx) => ({ locations: locationTree(ctx) })
	},
	{
		name: 'add_location',
		title: 'Add a location',
		description:
			'Add a location things can live in — a room, a chest, a drawer — optionally inside another location.',
		scope: 'inventory:write',
		writes: true,
		input: object(
			{
				name: text('What the location is called.'),
				parent_id: { type: 'integer', description: 'The location it is inside, from `locations`.' }
			},
			['name']
		),
		run: (ctx, args) => ({ id: createLocation(ctx, { name: args.name, parentId: args.parent_id }) })
	},
	{
		name: 'change_location',
		title: 'Rename or move a location',
		description:
			'Rename a location, or move it under a different parent (no parent_id moves it to the top level). It refuses to be put inside itself.',
		scope: 'inventory:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The location\u2019s id.' },
				name: text('The name, rewritten.'),
				parent_id: { type: 'integer', description: 'The new parent, or leave out for top level.' }
			},
			['id']
		),
		run: (ctx, args) => {
			const current = getLocation(ctx, Number(args.id));
			updateLocation(ctx, current.id, {
				name: args.name ?? current.name,
				parentId: args.parent_id === undefined ? current.parentId : args.parent_id
			});
			return { ok: true };
		}
	},
	{
		/*
		 * Removing a location is cheap on purpose: its children rise to where it
		 * was and the things in it merely lose their address — nothing a person
		 * typed is destroyed, so this verb may exist beside add_location.
		 */
		name: 'remove_location',
		title: 'Remove a location',
		description:
			'Remove a location. Locations inside it rise to where it was; things in it stay, just without an address.',
		scope: 'inventory:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The location\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteLocation(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'put_item',
		title: 'Say where a thing lives',
		description:
			'Put a shopping/inventory item in a location, or take its address away by leaving location_id out. The item itself is untouched.',
		scope: 'inventory:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The item\u2019s id, as `shopping_list` gives it.' },
				location_id: {
					type: 'integer',
					description: 'The location, from `locations`. Leave out to unfile.'
				}
			},
			['id']
		),
		run: (ctx, args) => {
			setItemLocation(
				ctx,
				Number(args.id),
				args.location_id === undefined ? null : Number(args.location_id)
			);
			return { ok: true };
		}
	},
	{
		name: 'set_item_fields',
		title: 'Set a thing\u2019s own fields',
		description:
			'Replace an item\u2019s free fields wholesale — { "length": "5m", "plug": "USB-C" }. Not every thing shares a shape; these are this thing\u2019s. Send the full set: removing a field is writing the rest.',
		scope: 'inventory:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The item\u2019s id.' },
				fields: {
					type: 'object',
					description: 'The fields, string values.',
					additionalProperties: { type: 'string' }
				}
			},
			['id', 'fields']
		),
		run: (ctx, args) => {
			setItemAttributes(ctx, Number(args.id), (args.fields ?? {}) as Record<string, string>);
			return { ok: true };
		}
	},
	{
		name: 'workouts',
		title: 'Your workouts',
		description:
			'The workouts you have written down, under Health. Each has a category and a plan; put one on the week with add_block and its workoutId to have it planned like a meal.',
		scope: 'workouts:read',
		writes: false,
		input: object({
			include_archived: { type: 'boolean', description: 'Include ones put away.' }
		}),
		run: (ctx, args) => ({
			workouts: listWorkouts(ctx, { includeArchived: !!args.include_archived })
		})
	},
	{
		name: 'workout_categories',
		title: 'The categories of workout this account keeps',
		description:
			'The categories a workout can be filed under — this account\u2019s own list, not a fixed one. `add_workout` and `change_workout` take a category_id from here.',
		scope: 'workouts:read',
		writes: false,
		input: object({}),
		run: (ctx) => ({ categories: listWorkoutCategories(ctx) })
	},
	{
		name: 'add_workout_category',
		title: 'Add a category of workout',
		description:
			'Add a category to this account\u2019s list — "Swimming", "Physio". Answering with one that already exists returns it rather than making a second.',
		scope: 'workouts:write',
		writes: true,
		input: object({ name: text('What the category is called.') }, ['name']),
		run: (ctx, args) => ({ id: createWorkoutCategory(ctx, args.name) })
	},
	{
		/*
		 * The way back from add_workout_kind. Cheap on purpose: the workouts
		 * filed under it keep existing and simply lose their kind, so nothing
		 * anybody wrote is destroyed by removing a word from a list.
		 */
		name: 'remove_workout_category',
		title: 'Remove a category of workout',
		description:
			'Take a category off the list. Workouts filed under it keep existing, without one.',
		scope: 'workouts:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'From `workout_categories`.' } }, ['id']),
		run: (ctx, args) => {
			deleteWorkoutCategory(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'add_workout',
		title: 'Add a workout',
		description:
			'Write a workout down: a title, a category (one of the account\u2019s own, from `workout_categories`), a plan as Markdown, and roughly how long it takes. Scheduling it onto a day is a block with its workoutId, the way a meal is a block with a recipe.',
		scope: 'workouts:write',
		writes: true,
		input: object(
			{
				title: text('What the session is called.'),
				category_id: { type: 'integer', description: 'Its category, from `workout_categories`.' },
				plan: text('What to do, as Markdown.'),
				minutes: { type: 'integer', description: 'Roughly how long it takes.' },
				notes: text('Anything else.')
			},
			['title']
		),
		run: (ctx, args) => ({
			id: createWorkout(ctx, {
				title: args.title,
				categoryId: args.category_id,
				plan: args.plan ?? '',
				minutes: args.minutes ?? null,
				notes: args.notes ?? ''
			})
		})
	},
	{
		name: 'change_workout',
		title: 'Change a workout',
		description:
			'Rewrite a workout. Only the fields given change — for a misheard word or a better plan, not to turn it into a different session.',
		scope: 'workouts:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The workout\u2019s id, as `workouts` gives it.' },
				title: text('The title, rewritten.'),
				category_id: { type: 'integer', description: 'Its category, from `workout_categories`.' },
				plan: text('The plan, rewritten.'),
				minutes: { type: 'integer', description: 'Roughly how long it takes.' },
				notes: text('Notes, replacing the old ones.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = getWorkout(ctx, Number(args.id));
			updateWorkout(ctx, current.id, {
				title: args.title ?? current.title,
				categoryId: args.category_id ?? current.categoryId,
				plan: args.plan ?? current.plan,
				minutes: args.minutes ?? current.minutes,
				notes: args.notes ?? current.notes
			});
			return { ok: true };
		}
	},
	{
		/*
		 * Put away, not deleted: a workout accumulates a history (when it was\n		 * last done, the blocks that pointed at it), so the reversible verb is\n		 * archive, and its inverse is the same tool with archived:false. There is\n		 * deliberately no delete_workout — a mistaken one is archived; a real\n		 * removal the person does in the app.\n		 */
		name: 'archive_workout',
		title: 'Put a workout away, or bring it back',
		description:
			'Take a workout out of the working list, or restore it. Nothing is lost either way — its history stays.',
		scope: 'workouts:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The workout\u2019s id.' },
				archived: {
					type: 'boolean',
					description: 'true to put away, false to bring back. Defaults to true.'
				}
			},
			['id']
		),
		run: (ctx, args) => {
			setWorkoutArchived(
				ctx,
				Number(args.id),
				args.archived === undefined ? true : !!args.archived
			);
			return { ok: true };
		}
	},
	{
		name: 'workout_done',
		title: 'Mark a workout done',
		description:
			'Record that a workout happened just now — the gym\u2019s version of marking a recipe cooked. It stamps the last-done time.',
		scope: 'workouts:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The workout\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			workoutDone(ctx, Number(args.id));
			return { ok: true };
		}
	},
	{
		name: 'bills',
		title: 'Your bills',
		description:
			'The bills you expect to pay, and what you have actually paid. Amounts are in minor units (cents): 12000 is R$120,00. Marking one paid records the real amount, which can differ from the expected one.',
		scope: 'bills:read',
		writes: false,
		input: object({
			include_archived: { type: 'boolean', description: 'Include ones put away.' }
		}),
		run: (ctx, args) => ({ bills: listBills(ctx, { includeArchived: !!args.include_archived }) })
	},
	{
		name: 'bill_payments',
		title: 'What a bill has cost',
		description:
			'Every period a bill has been paid for, with the expected amount and what was actually paid. Amounts in minor units (cents).',
		scope: 'bills:read',
		writes: false,
		input: object({ id: { type: 'integer', description: 'The bill\u2019s id.' } }, ['id']),
		run: (ctx, args) => ({ payments: listPayments(ctx, Number(args.id)) })
	},
	{
		name: 'month_bills',
		title: 'A month of bills at a glance',
		description:
			'For a month (YYYY-MM), what the monthly bills expected, what has been paid, and the gap. Amounts in minor units (cents).',
		scope: 'bills:read',
		writes: false,
		input: object({ month: text('The month as YYYY-MM. This month if left out.') }),
		run: (ctx, args) => {
			const month =
				typeof args.month === 'string' && /^\d{4}-\d{2}$/.test(args.month)
					? args.month
					: `${ctx.now.getUTCFullYear()}-${String(ctx.now.getUTCMonth() + 1).padStart(2, '0')}`;
			return { month, ...monthSummary(ctx, month) };
		}
	},
	{
		name: 'bills_due',
		title: 'Bills that want paying',
		description:
			'The bills falling due between two dates, each on the day it wants paying (the due day less its lead), with whether that one is already paid. This is what the week shows.',
		scope: 'bills:read',
		writes: false,
		input: object(
			{
				from: text('First day, as 2026-03-14.'),
				to: text('Last day, as 2026-03-21.')
			},
			['from', 'to']
		),
		run: (ctx, args) => ({
			due: billsDueBetween(ctx, day(args.from, 'from'), day(args.to, 'to'))
		})
	},
	{
		name: 'add_bill',
		title: 'Add a bill',
		description:
			'Write down a bill you expect to pay: a name, the expected amount in minor units (cents), and a rhythm (weekly, monthly, yearly, once). A monthly bill can name the day of the month it falls due.',
		scope: 'bills:write',
		writes: true,
		input: object(
			{
				name: text('What the bill is called.'),
				amount_expected: {
					type: 'integer',
					description: 'The expected amount, in minor units (cents).'
				},
				rhythm: text('weekly, monthly, yearly, or once.'),
				due_day: {
					type: 'integer',
					description:
						'Day of the month it falls due, 1-28 (monthly) — the last day it can be paid.'
				},
				pay_lead_days: {
					type: 'integer',
					description:
						'Pay it this many days before the due day (0 = on the day). It turns up on the week that day.'
				},
				currency: text('A currency code like BRL. The account\u2019s default if left out.'),
				notes: text('Anything else.')
			},
			['name']
		),
		run: (ctx, args) => ({
			id: createBill(ctx, {
				name: args.name,
				amountExpected: args.amount_expected ?? 0,
				rhythm: args.rhythm,
				dueDay: args.due_day,
				dueMonth: args.due_month,
				payLeadDays: args.pay_lead_days,
				currency: args.currency,
				notes: args.notes ?? ''
			}).id
		})
	},
	{
		name: 'change_bill',
		title: 'Change a bill',
		description:
			'Rewrite a bill. Only the fields given change. Editing the expected amount does not rewrite what past payments recorded — those are snapshots of the day they were paid.',
		scope: 'bills:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The bill\u2019s id, as `bills` gives it.' },
				name: text('The name, rewritten.'),
				amount_expected: {
					type: 'integer',
					description: 'The expected amount, in minor units (cents).'
				},
				rhythm: text('weekly, monthly, yearly, or once.'),
				due_day: {
					type: 'integer',
					description:
						'When it falls due. Monthly: day of the month. Weekly: weekday 1-7 from Monday. Yearly: day of due_month.'
				},
				due_month: { type: 'integer', description: 'For a yearly bill, the month, 1-12.' },
				pay_lead_days: {
					type: 'integer',
					description: 'Pay it this many days before the due day (0 = on the day).'
				},
				notes: text('Notes, replacing the old ones.')
			},
			['id']
		),
		run: (ctx, args) => {
			const current = getBill(ctx, Number(args.id));
			updateBill(ctx, current.id, {
				name: args.name ?? current.name,
				amountExpected: args.amount_expected ?? current.amountExpected,
				rhythm: args.rhythm ?? current.rhythm,
				dueDay: args.due_day ?? current.dueDay,
				dueMonth: args.due_month ?? current.dueMonth,
				payLeadDays: args.pay_lead_days ?? current.payLeadDays,
				currency: current.currency,
				goalId: current.goalId,
				categoryId: current.categoryId,
				notes: args.notes ?? current.notes
			});
			return { ok: true };
		}
	},
	{
		/*
		 * Put away, not deleted: a bill carries payment history, so the reversible
		 * verb is archive and its inverse is the same tool with archived:false.
		 * No delete_bill — a mistaken one is archived; a real removal the person
		 * does in the app, where the history it takes with it is in front of them.
		 */
		name: 'archive_bill',
		title: 'Put a bill away, or bring it back',
		description:
			'Take a bill out of the active list (it stopped being paid), or restore it. Its payment history stays either way.',
		scope: 'bills:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The bill\u2019s id.' },
				archived: {
					type: 'boolean',
					description: 'true to put away, false to bring back. Defaults to true.'
				}
			},
			['id']
		),
		run: (ctx, args) => {
			setBillArchived(ctx, Number(args.id), args.archived === undefined ? true : !!args.archived);
			return { ok: true };
		}
	},
	{
		name: 'pay_bill',
		title: 'Mark a bill paid',
		description:
			'Record a bill paid for a period. The amount defaults to the expected one; give amount_paid in minor units (cents) when it differed. The period defaults to the current one for the bill\u2019s rhythm. Paying the same period again corrects it, never doubles it.',
		scope: 'bills:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The bill\u2019s id.' },
				amount_paid: {
					type: 'integer',
					description: 'What was actually paid, in minor units (cents).'
				},
				period: text(
					'The period: YYYY-Www for weekly, YYYY-MM for monthly, YYYY for yearly. This period if left out.'
				),
				notes: text('Anything about this payment.')
			},
			['id']
		),
		run: (ctx, args) => ({
			payment: markPaid(ctx, Number(args.id), {
				amountPaid: args.amount_paid,
				period: args.period,
				notes: args.notes
			})
		})
	},
	{
		name: 'unpay_bill',
		title: 'Undo a bill payment',
		description:
			'Remove the payment recorded for a period — it was not actually paid, or was recorded by mistake. The inverse of pay_bill.',
		scope: 'bills:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The bill\u2019s id.' },
				period: text('The period to undo, e.g. 2026-09.')
			},
			['id', 'period']
		),
		run: (ctx, args) => {
			unmarkPaid(ctx, Number(args.id), String(args.period));
			return { ok: true };
		}
	}
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Every scope any tool needs — what a token for an assistant is asked to hold. */
export const ASSISTANT_SCOPES = [...new Set(TOOLS.map((t) => t.scope))].sort();
