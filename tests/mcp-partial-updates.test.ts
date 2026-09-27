/**
 * A change names what changes, and nothing else moves.
 *
 * Every `change_*` / `edit_*` tool takes an id and whichever fields the
 * caller mentions. Two promises are held here for each of them:
 *
 * - a field left out keeps what it had — including the ones the tool does not
 *   even offer, which a service writing the whole row used to blank (a
 *   location's notes, a bill's direction, a notebook's description);
 * - a call that is refused writes nothing at all, not the half that came
 *   before the refusal.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	ctx: import('../src/lib/services/ctx').Ctx;
	todos: typeof import('../src/lib/services/todos');
	notebooks: typeof import('../src/lib/services/notebooks');
	goals: typeof import('../src/lib/services/goals');
	diary: typeof import('../src/lib/services/diary');
	ideas: typeof import('../src/lib/services/ideas');
	recipes: typeof import('../src/lib/services/recipes');
	inventory: typeof import('../src/lib/services/inventory');
	habits: typeof import('../src/lib/services/habits');
	reminders: typeof import('../src/lib/services/reminders');
	slots: typeof import('../src/lib/services/slots');
	activities: typeof import('../src/lib/services/activities');
	people: typeof import('../src/lib/services/people');
	locations: typeof import('../src/lib/services/locations');
	workouts: typeof import('../src/lib/services/workouts');
	statements: typeof import('../src/lib/services/statements');
	bills: typeof import('../src/lib/services/bills');
	instances: typeof import('../src/lib/services/instances');
};

let s: Services;
let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let ASSISTANT_SCOPES: typeof import('../src/lib/server/mcp/tools').ASSISTANT_SCOPES;
const NOW = new Date('2026-03-14T10:00:00Z');

beforeAll(async () => {
	const { buildCtx } = await import('../src/lib/services/ctx');
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ ASSISTANT_SCOPES } = await import('../src/lib/server/mcp/tools'));
	s = {
		ctx: buildCtx(OWNER, { tz: 'UTC', now: NOW }),
		todos: await import('../src/lib/services/todos'),
		notebooks: await import('../src/lib/services/notebooks'),
		goals: await import('../src/lib/services/goals'),
		diary: await import('../src/lib/services/diary'),
		ideas: await import('../src/lib/services/ideas'),
		recipes: await import('../src/lib/services/recipes'),
		inventory: await import('../src/lib/services/inventory'),
		habits: await import('../src/lib/services/habits'),
		reminders: await import('../src/lib/services/reminders'),
		slots: await import('../src/lib/services/slots'),
		activities: await import('../src/lib/services/activities'),
		people: await import('../src/lib/services/people'),
		locations: await import('../src/lib/services/locations'),
		workouts: await import('../src/lib/services/workouts'),
		statements: await import('../src/lib/services/statements'),
		bills: await import('../src/lib/services/bills'),
		instances: await import('../src/lib/services/instances')
	};
	s.activities.createCategory(s.ctx, { name: 'work', color: '#1d4ed8' });
});

function call(name: string, args: Record<string, unknown>) {
	return handleBody({ ctx: s.ctx, scopes: [...ASSISTANT_SCOPES, 'destructive'] } as never, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name, arguments: args }
	}) as { result?: { isError?: boolean; content?: { text?: string }[] }; error?: unknown };
}

/** The tool's own answer, failing the test when it was refused. */
function ok(name: string, args: Record<string, unknown>): Record<string, unknown> {
	const answer = call(name, args);
	const text = answer.result?.content?.[0]?.text ?? '';
	expect(answer.result?.isError, `${name} refused: ${text}`).toBeFalsy();
	return JSON.parse(text || '{}');
}

/** The call was refused. */
function refused(name: string, args: Record<string, unknown>) {
	const answer = call(name, args);
	expect(
		answer.error !== undefined || answer.result?.isError === true,
		`${name} was expected to refuse`
	).toBe(true);
}

describe('change_task', () => {
	const todo = () => s.todos.listTodos(s.ctx).find((t) => t.title.startsWith('fix the tap'))!;

	it('keeps notes, labels, notebook and ratings when only the title is sent', () => {
		const book = s.notebooks.createNotebook(s.ctx, { title: 'House' });
		const { id } = ok('add_task', {
			title: 'fix the tap',
			notes: 'washer is 12mm',
			tags: 'home plumbing',
			notebookId: book
		});
		ok('change_task', { id, urgency: 4, interest: 2 });
		ok('change_task', { id, title: 'fix the tap properly' });

		const now = todo();
		expect(now.title).toBe('fix the tap properly');
		expect(now.notes).toBe('washer is 12mm');
		expect(now.notebookId).toBe(book);
		expect(now.tags.map((t) => t.name ?? t).sort()).toEqual(['home', 'plumbing']);
		expect(now.ratings.urgency).toBe(4);
		expect(now.ratings.interest).toBe(2);
		expect(now.status).toBe('todo');
	});

	it('takes a nought, and clears one rating with null while keeping the other', () => {
		const id = todo().id;
		ok('change_task', { id, urgency: 0 });
		expect(todo().ratings.urgency).toBe(0);
		ok('change_task', { id, urgency: null });
		expect(todo().ratings.urgency).toBeNull();
		expect(todo().ratings.interest).toBe(2);
	});

	it('writes nothing when the status is not one of the four', () => {
		const id = todo().id;
		refused('change_task', { id, title: 'renamed anyway', status: 'finished-ish' });
		expect(todo().title).toBe('fix the tap properly');
		expect(todo().status).toBe('todo');
	});

	it('writes nothing when a rating is off the scale', () => {
		const id = todo().id;
		refused('change_task', { id, title: 'renamed anyway', interest: 9 });
		expect(todo().title).toBe('fix the tap properly');
	});
});

describe('change_notebook', () => {
	it('needs only the id, and keeps the name, the line and the labels it is not told about', () => {
		const id = s.notebooks.createNotebook(s.ctx, {
			title: 'Garden',
			folder: 'Home',
			description: 'beds and the shed',
			defaultTags: 'outside'
		});
		ok('change_notebook', { id, folder: 'Outdoors' });

		const now = s.notebooks.getNotebook(s.ctx, id);
		expect(now.title).toBe('Garden');
		expect(now.folder).toBe('Outdoors');
		expect(now.description).toBe('beds and the shed');
		expect(now.defaultTags).toBe('outside');
	});

	it('clears the line with an empty string, and refuses an empty title without writing', () => {
		const id = s.notebooks.listNotebooks(s.ctx).find((n) => n.title === 'Garden')!.id;
		refused('change_notebook', { id, title: '', folder: 'Elsewhere' });
		expect(s.notebooks.getNotebook(s.ctx, id).folder).toBe('Outdoors');

		ok('change_notebook', { id, description: '' });
		expect(s.notebooks.getNotebook(s.ctx, id).description ?? '').toBe('');
	});
});

describe('change_goal', () => {
	const goal = () =>
		s.goals.listGoals(s.ctx, { includeClosed: true }).find((g) => g.title.startsWith('Read'))!;

	it('keeps notes and measures when renamed, and a unit alone renames the measure', () => {
		const { id } = ok('add_goal', {
			title: 'Read more',
			horizon: 'month',
			notes: 'fiction counts',
			targetValue: 12,
			unit: 'chapters'
		});
		ok('change_goal', { id, title: 'Read much more' });
		expect(goal().notes).toBe('fiction counts');
		expect(goal().targets.map((t) => [t.targetValue, t.unit])).toEqual([[12, 'chapters']]);

		ok('change_goal', { id, unit: 'books' });
		expect(goal().targets.map((t) => [t.targetValue, t.unit])).toEqual([[12, 'books']]);
	});

	it('writes nothing when the horizon is not one', () => {
		refused('change_goal', { id: goal().id, title: 'Renamed anyway', horizon: 'fortnight' });
		expect(goal().title).toBe('Read much more');
	});
});

describe('edit_entry', () => {
	it('keeps the words when only the title is sent; writes nothing when the words are emptied', () => {
		const { id } = ok('write_entry', { content: 'Long walk by the river.', tags: 'walks' });
		ok('edit_entry', { id, title: 'Sunday' });
		const now = () => s.diary.getEntry(s.ctx, Number(id));
		expect(now().title).toBe('Sunday');
		expect(now().content).toBe('Long walk by the river.');

		refused('edit_entry', { id, title: 'Renamed anyway', content: '' });
		expect(now().title).toBe('Sunday');
	});
});

describe('change_idea', () => {
	it('keeps the tags when only the words change, and empties them on request', () => {
		const { id } = ok('add_idea', { content: 'a shelf over the desk', tags: 'home diy' });
		const idea = () => s.ideas.listIdeas(s.ctx).find((i) => i.id === Number(id))!;
		ok('change_idea', { id, content: 'a long shelf over the desk' });
		expect(
			idea()
				.tags.map((t) => t.name)
				.sort()
		).toEqual(['diy', 'home']);

		refused('change_idea', { id, content: '', tags: '' });
		expect(idea().tags).toHaveLength(2);

		ok('change_idea', { id, tags: '' });
		expect(idea().tags).toEqual([]);
		expect(idea().content).toBe('a long shelf over the desk');
	});
});

describe('change_recipe', () => {
	it('keeps what it is not told about, and clears servings with 0', () => {
		const { id } = ok('add_recipe', {
			title: 'Dal',
			method: 'Simmer.',
			servings: 4,
			minutes: 40,
			source: 'grandma'
		});
		ok('change_recipe', { id, title: 'Red dal' });
		let now = s.recipes.getRecipe(s.ctx, Number(id));
		expect([now.title, now.method, now.servings, now.minutes, now.source]).toEqual([
			'Red dal',
			'Simmer.',
			4,
			40,
			'grandma'
		]);

		ok('change_recipe', { id, servings: 0 });
		now = s.recipes.getRecipe(s.ctx, Number(id));
		expect(now.servings).toBeNull();
		expect(now.minutes).toBe(40);
	});

	it('writes nothing when a number is refused', () => {
		const id = (s.recipes.listRecipes(s.ctx) as { id: number; title: string }[]).find(
			(r) => r.title === 'Red dal'
		)!.id;
		refused('change_recipe', { id, title: 'Renamed anyway', minutes: -3 });
		expect(s.recipes.getRecipe(s.ctx, id).title).toBe('Red dal');
	});
});

describe('change_inventory_category', () => {
	it('keeps whether it holds food when renamed', () => {
		const { id } = ok('add_inventory_category', { name: 'Pantry', holdsFood: true });
		ok('change_inventory_category', { id, name: 'Larder' });
		const now = s.inventory
			.listCategories(s.ctx)
			.find((c: { id: number }) => c.id === Number(id)) as { name: string; isFood: boolean };
		expect(now.name).toBe('Larder');
		expect(now.isFood).toBe(true);
	});
});

describe('change_habit', () => {
	it('keeps type, description and days when renamed; writes nothing on a bad type', () => {
		const { id } = ok('add_habit', {
			name: 'stretch',
			type: 'good',
			description: 'ten minutes',
			scheduledDays: '0,2,4'
		});
		const habit = () => s.habits.listHabits(s.ctx).find((h) => h.id === Number(id))!;
		ok('change_habit', { id, name: 'stretch more' });
		expect([habit().name, habit().type, habit().description, habit().scheduledDays]).toEqual([
			'stretch more',
			'good',
			'ten minutes',
			'0,2,4'
		]);

		refused('change_habit', { id, name: 'renamed anyway', type: 'sometimes' });
		expect(habit().name).toBe('stretch more');
	});
});

describe('change_reminder', () => {
	it('keeps the time and the sound when reworded; writes nothing on a past time', () => {
		const { id } = ok('set_alarm', { at: '2026-03-20T09:00', message: 'bins', sound: true });
		const reminder = () =>
			s.reminders.listReminders(s.ctx, { includePast: true }).find((r) => r.id === Number(id))!;
		const at = reminder().remindAt;
		ok('change_reminder', { id, message: 'bins out' });
		expect(reminder().message).toBe('bins out');
		expect(reminder().remindAt).toBe(at);
		expect(reminder().audible).toBe(true);

		refused('change_reminder', { id, message: 'renamed anyway', at: '2020-01-01T09:00' });
		expect(reminder().message).toBe('bins out');
	});
});

describe('the task blocks', () => {
	let workoutId: number;
	beforeAll(() => {
		const category = s.workouts.createWorkoutCategory(s.ctx, 'Running');
		workoutId = s.workouts.createWorkout(s.ctx, { title: 'Long run', categoryId: category });
	});

	it('change_repeating_block renames a workout block and keeps the workout', () => {
		const work = s.activities.listCategories(s.ctx)[0] as { id: number };
		const id = s.slots.createSlot(s.ctx, {
			weekday: 2,
			startTime: '07:00',
			durationMinutes: 50,
			mode: 'workout',
			workoutId,
			categoryId: work.id,
			label: 'run'
		});
		ok('change_repeating_block', { id, title: 'easy run' });
		const now = s.slots.listWeeklySlots(s.ctx).find((w) => w.id === id)!;
		expect([now.label, now.mode, now.workoutId, now.startTime, now.durationMinutes]).toEqual([
			'easy run',
			'workout',
			workoutId,
			'07:00',
			50
		]);

		refused('change_repeating_block', { id, title: 'renamed anyway', start_time: '7 o clock' });
		expect(s.slots.listWeeklySlots(s.ctx).find((w) => w.id === id)!.label).toBe('easy run');
	});

	it('change_block renames a one-off workout and keeps the workout', () => {
		const work = s.activities.listCategories(s.ctx)[0] as { id: number };
		const id = s.slots.createExceptional(s.ctx, {
			date: '2026-03-18',
			startTime: '18:00',
			durationMinutes: 45,
			mode: 'workout',
			workoutId,
			categoryId: work.id,
			label: 'intervals'
		});
		ok('change_block', { id: `exceptional:${id}`, title: 'hill intervals' });
		const row = s.slots
			.listExceptionals(s.ctx, '2026-03-18', '2026-03-19')
			.find((e: { id: number }) => e.id === id) as {
			label: string;
			mode: string;
			workoutId: number;
			durationMinutes: number;
		};
		expect([row.label, row.mode, row.workoutId, row.durationMinutes]).toEqual([
			'hill intervals',
			'workout',
			workoutId,
			45
		]);
	});
});

describe('change_activity', () => {
	it('keeps the description when renamed; writes nothing for a category that is not there', () => {
		const { id } = ok('add_activity', {
			name: 'russian',
			category: 'work',
			description: 'Duolingo and a book'
		});
		const activity = () =>
			(
				s.activities.listActivities(s.ctx) as { id: number; name: string; description: string }[]
			).find((a) => a.id === Number(id))!;
		ok('change_activity', { id, name: 'learn russian' });
		expect(activity().description).toBe('Duolingo and a book');

		refused('change_activity', { id, name: 'renamed anyway', category: 'no such thing' });
		expect(activity().name).toBe('learn russian');
	});
});

describe('change_person', () => {
	it('keeps everything else when the phone changes; writes nothing on a bad birthday', () => {
		const { id } = ok('add_person', {
			name: 'Ana',
			relationship: 'friend',
			birthday: '--04-12',
			email: 'ana@example.com',
			notes: 'likes tea'
		});
		const person = () => s.people.listPeople(s.ctx).find((p) => p.id === Number(id))!;
		ok('change_person', { id, phone: '555 0101' });
		expect([
			person().name,
			person().birthday,
			person().email,
			person().notes,
			person().phone
		]).toEqual(['Ana', '--04-12', 'ana@example.com', 'likes tea', '555 0101']);

		refused('change_person', { id, phone: '555 0202', birthday: 'the fourth' });
		expect(person().phone).toBe('555 0101');
	});
});

describe('change_location', () => {
	it('keeps its notes and its parent when renamed, and 0 moves it to the top', () => {
		const house = s.locations.createLocation(s.ctx, { name: 'House' });
		const id = s.locations.createLocation(s.ctx, {
			name: 'Attic',
			parentId: house,
			notes: 'mind the beam'
		});
		ok('change_location', { id, name: 'Loft' });
		let now = s.locations.getLocation(s.ctx, id);
		expect([now.name, now.parentId, now.notes]).toEqual(['Loft', house, 'mind the beam']);

		refused('change_location', { id, name: 'renamed anyway', parent_id: id });
		expect(s.locations.getLocation(s.ctx, id).name).toBe('Loft');

		ok('change_location', { id, parent_id: 0 });
		now = s.locations.getLocation(s.ctx, id);
		expect([now.parentId, now.notes]).toEqual([null, 'mind the beam']);
	});
});

describe('the workouts', () => {
	it('change_workout keeps the plan and time when renamed, and clears the time with 0', () => {
		const category = s.workouts.createWorkoutCategory(s.ctx, 'Strength');
		const id = s.workouts.createWorkout(s.ctx, {
			title: 'Push day',
			categoryId: category,
			plan: 'bench, press',
			minutes: 60,
			notes: 'warm up first'
		});
		ok('change_workout', { id, title: 'Push' });
		let now = s.workouts.getWorkout(s.ctx, id);
		expect([now.title, now.categoryId, now.plan, now.minutes, now.notes]).toEqual([
			'Push',
			category,
			'bench, press',
			60,
			'warm up first'
		]);

		refused('change_workout', { id, title: 'renamed anyway', minutes: -5 });
		expect(s.workouts.getWorkout(s.ctx, id).title).toBe('Push');

		ok('change_workout', { id, minutes: 0 });
		now = s.workouts.getWorkout(s.ctx, id);
		expect([now.minutes, now.plan]).toEqual([null, 'bench, press']);
	});

	it('change_workout_session keeps its lines, and a refused line leaves the notes as they were', () => {
		const workout = s.workouts.listWorkouts(s.ctx, {})[0];
		const id = s.workouts.logWorkout(s.ctx, workout.id, {
			doneOn: '2026-03-13',
			notes: 'felt strong',
			measures: [{ activity: 'benched', amount: 60, unit: 'kg' }]
		});
		ok('change_workout_session', { id, notes: 'felt very strong' });
		const now = s.workouts.getSession(s.ctx, id);
		expect(now.notes).toBe('felt very strong');
		expect(now.doneOn).toBe('2026-03-13');
		expect(now.measures.map((m) => [m.activity, m.amount, m.unit])).toEqual([
			['benched', 60, 'kg']
		]);

		// The session row is written before its lines are read: the refusal
		// has to take the notes back with it.
		refused('change_workout_session', { id, notes: 'rewritten anyway', measures: 'lots' });
		const after = s.workouts.getSession(s.ctx, id);
		expect(after.notes).toBe('felt very strong');
		expect(after.measures).toHaveLength(1);
	});
});

describe('change_sort_rule', () => {
	it('keeps the pattern when renamed; writes nothing for a pattern that does not compile', () => {
		const { rule } = ok('add_sort_rule', {
			kind: 'category',
			name: 'food',
			pattern: 'lidl|aldi'
		}) as {
			rule?: { id: number };
			id?: number;
		};
		const id = rule?.id ?? s.statements.listRules(s.ctx).find((r) => r.name === 'food')!.id;
		ok('change_sort_rule', { id, name: 'groceries' });
		const now = () => s.statements.listRules(s.ctx).find((r) => r.id === id)!;
		expect([now().name, now().pattern]).toEqual(['groceries', 'lidl|aldi']);

		refused('change_sort_rule', { id, name: 'renamed anyway', pattern: '(' });
		expect(now().name).toBe('groceries');
	});
});

describe('change_bill', () => {
	it('keeps an income an income when renamed; writes nothing on a day past the month', () => {
		const { id } = ok('add_bill', {
			name: 'salary',
			amount_expected: 300000,
			flow: 'in',
			due_day: 5,
			notes: 'net'
		});
		ok('change_bill', { id, name: 'pay' });
		const now = () => s.bills.getBill(s.ctx, Number(id));
		expect([now().name, now().flow, now().dueDay, now().notes, now().amountExpected]).toEqual([
			'pay',
			'in',
			5,
			'net',
			300000
		]);

		refused('change_bill', { id, name: 'renamed anyway', due_day: 40 });
		expect(now().name).toBe('pay');

		ok('change_bill', { id, due_day: null });
		expect(now().dueDay).toBeNull();
	});
});
