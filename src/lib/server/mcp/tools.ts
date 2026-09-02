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
import type { Ctx } from '../services/ctx.js';
import type { Scope } from '../services/tokens.js';

import { createEntry, listEntries } from '../services/diary.js';
import { createIdea, listIdeas } from '../services/ideas.js';
import { listGoals } from '../services/goals.js';
import { listNotebooks } from '../services/notebooks.js';
import {
	createRecipe,
	getRecipe,
	importIngredients,
	ingredientsOf,
	listRecipes
} from '../services/recipes.js';
import { grouped, search } from '../services/search.js';
import { createItem, listItems, setBought } from '../services/shopping.js';
import { getTodayBoard } from '../services/today.js';
import { createTodo, listTodos, scheduleTodo, setTodoStatus } from '../services/todos.js';
import { getUpcomingSchedule } from '../services/schedule.js';
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
		name: 'goals',
		title: 'Goals',
		description:
			'What the person is working towards, by horizon, with the work counted against each. Read-only: a goal is a commitment somebody makes, not one an assistant makes for them.',
		scope: 'tasks:read',
		writes: false,
		input: object({ includeClosed: { type: 'boolean', default: false } }),
		run: (ctx, args) => listGoals(ctx, { includeClosed: Boolean(args.includeClosed) })
	},

	// ── Writing ──────────────────────────────────────────────────────────────
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
