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
import { createIdea, deleteIdea, listIdeas } from '../services/ideas.js';
import { closeGoal, listGoals } from '../services/goals.js';
import { listNotebooks } from '../services/notebooks.js';
import {
	createRecipe,
	getRecipe,
	importIngredients,
	ingredientsOf,
	listRecipes
} from '../services/recipes.js';
import { grouped, search } from '../services/search.js';
import { createItem, deleteItem, listItems, setBought, setSnoozed } from '../services/shopping.js';
import { getTodayBoard } from '../services/today.js';
import {
	createTodo,
	deleteTodo,
	listTodos,
	scheduleTodo,
	setTodoStatus
} from '../services/todos.js';
import { getUpcomingSchedule } from '../services/schedule.js';
import { createExceptional } from '../services/slots.js';
import { cancelOccurrence, changeOccurrence, setOccurrenceStatus } from '../services/instances.js';
import { listCategories } from '../services/activities.js';
import { toggleOccurrence } from '../services/habits.js';
import { ValidationError } from '../services/errors.js';

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
		name: 'keep_habit',
		title: 'Mark a habit kept',
		description:
			'Record that a habit was kept today, or take that back if it was marked by mistake. Takes the id `habits` gives. Keeping it twice is not an error; the second call unmarks it, which is how the app\u2019s own tick behaves.',
		scope: 'habits:write',
		writes: true,
		input: object(
			{
				id: { type: 'integer', description: 'The habit\u2019s id, as `habits` gave it.' },
				date: text('The day, as YYYY-MM-DD. Today if left out.')
			},
			['id']
		),
		run: (ctx, args) => {
			toggleOccurrence(ctx, {
				habitId: args.id,
				date: args.date ?? localDateOf(ctx.now, ctx.tz)
			});
			return { ok: true };
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
					'Which part of life it belongs to, by name. The first one is used if this is left out or does not match.'
				)
			},
			['date', 'title', 'start_time']
		),
		run: (ctx, args) => {
			// A block belongs to a category — the colour it is drawn in and the
			// bucket the week is counted into — so one is chosen here rather than
			// making a model guess an id it has never seen.
			const categories = listCategories(ctx) as { id: number; name: string }[];
			if (categories.length === 0)
				throw new ValidationError(
					'This account has no categories yet, and a block belongs to one. Make one in the app first.'
				);

			const wanted = typeof args.category === 'string' ? args.category.trim().toLowerCase() : '';
			const chosen =
				categories.find((c) => c.name.toLowerCase() === wanted) ??
				categories.find((c) => c.name.toLowerCase().includes(wanted) && wanted !== '') ??
				categories[0];

			const id = createExceptional(ctx, {
				date: day(args.date, 'date'),
				mode: 'category',
				categoryId: chosen.id,
				label: args.title,
				startTime: args.start_time,
				durationMinutes: args.minutes ?? 60
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
				title: text('What it should be called instead.')
			},
			['id']
		),
		run: (ctx, args) =>
			changeOccurrence(ctx, args.id, {
				date: args.date,
				startTime: args.start_time,
				minutes: args.minutes,
				title: args.title
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
				scheduledDate: text('The day to put it on, as YYYY-MM-DD. Usually omitted.')
			},
			['title']
		),
		run: (ctx, args) => {
			const id = createTodo(ctx, {
				title: args.title,
				notes: args.notes ?? '',
				scheduledDate: args.scheduledDate ? day(args.scheduledDate, 'scheduledDate') : null
			});
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
			'What the person is working towards, by horizon, with the work counted against each. There is no tool that makes one: a goal is a commitment somebody makes, not one an assistant makes for them. Saying how one ended is different — that is `close_goal`.',
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
			'Add an entry. Markdown, in the person’s own voice — an assistant writing a diary entry is transcribing, not composing. Put it in a notebook when it is about one subject; leave the notebook off for an ordinary day.',
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
		name: 'ideas',
		title: 'Ideas',
		description:
			'Things caught before they evaporated, newest first. An idea is not a task: nobody has committed to doing it, which is what makes it cheap to write down.',
		scope: 'notes:read',
		writes: false,
		input: object({ limit: count('How many.', 50) }),
		run: (ctx, args) => listIdeas(ctx).slice(0, limitOf(args, 50))
	},
	{
		name: 'add_idea',
		title: 'Catch an idea',
		description:
			'Write an idea down without deciding where it belongs. The lowest-friction thing here; prefer it to a todo when the person has not said they will do it.',
		scope: 'notes:write',
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
		scope: 'notes:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The idea\u2019s id.' } }, ['id']),
		run: (ctx, args) => {
			deleteIdea(ctx, Number(args.id));
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
				notes: text('Anything else about it.')
			},
			['name']
		),
		run: (ctx, args) =>
			createItem(ctx, {
				name: args.name,
				type: args.type ?? 'replenish',
				notes: args.notes ?? ''
			})
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
		name: 'snooze_item',
		title: 'Put something aside for now',
		description:
			'Take an item off the visible list without deleting it — for something not wanted this week. It keeps everything about itself and comes back with `unsnooze_item`. Prefer this to removing when somebody says "not now" rather than "never".',
		scope: 'shopping:write',
		writes: true,
		input: object({ id: { type: 'integer', description: 'The item\u2019s id.' } }, ['id']),
		run: (ctx, args) => setSnoozed(ctx, Number(args.id), true)
	},
	{
		name: 'unsnooze_item',
		title: 'Bring something back to the list',
		description:
			'Wake an item that was put aside, so it shows on the list again. `shopping_list` says which items are snoozed.',
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
	}
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Every scope any tool needs — what a token for an assistant is asked to hold. */
export const ASSISTANT_SCOPES = [...new Set(TOOLS.map((t) => t.scope))].sort();
