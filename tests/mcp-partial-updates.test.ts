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
	ledgers: typeof import('../src/lib/services/ledgers');
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
		ledgers: await import('../src/lib/services/ledgers'),
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

describe('change_recipe ingredients', () => {
	const lines = (id: unknown) =>
		s.recipes.ingredientsOf(s.ctx, Number(id)).map((one) => one.name.toLowerCase());

	it('adds with addIngredients and takes out with removeIngredients, keeping the rest', () => {
		const { id } = ok('add_recipe', { title: 'Pancakes', ingredients: '200 g flour\n2 eggs' });
		const eggs = s.recipes.ingredientsOf(s.ctx, Number(id)).find((one) => /egg/i.test(one.name))!;

		const answer = ok('change_recipe', {
			id,
			addIngredients: '300 ml milk',
			removeIngredients: [eggs.itemId]
		});
		expect(answer).toMatchObject({ ingredients: 1, removed: 1 });
		expect(answer.warning).toBeUndefined();
		expect(lines(id).some((one) => one.includes('flour'))).toBe(true);
		expect(lines(id).some((one) => one.includes('milk'))).toBe(true);
		expect(lines(id).some((one) => one.includes('egg'))).toBe(false);
		// The shopping item itself stays.
		expect(s.inventory.listItems(s.ctx).some((one) => one.id === eggs.itemId)).toBe(true);
	});

	it('still adds under the old `ingredients`, and says it is going', () => {
		const { id } = ok('add_recipe', { title: 'Toast', ingredients: '2 slices bread' });
		const answer = ok('change_recipe', { id, ingredients: '1 tbsp butter' });
		expect(lines(id)).toHaveLength(2);
		expect(String(answer.warning)).toMatch(/addIngredients.*0\.190\.0|0\.190\.0.*addIngredients/s);
	});

	it('refuses an ingredient of another recipe, and writes nothing', () => {
		const { id: dal } = ok('add_recipe', { title: 'Lentil soup', ingredients: '1 onion' });
		const { id: other } = ok('add_recipe', { title: 'Rice', ingredients: '1 cup rice' });
		const rice = s.recipes.ingredientsOf(s.ctx, Number(other))[0];
		refused('change_recipe', {
			id: dal,
			title: 'Renamed anyway',
			removeIngredients: [rice.itemId]
		});
		expect(s.recipes.getRecipe(s.ctx, Number(dal)).title).toBe('Lentil soup');
		expect(lines(other)).toHaveLength(1);
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

	it('changes the currency and the direction, and an empty currency is the account default', () => {
		const { id } = ok('add_bill', { name: 'rent abroad', amount_expected: 90000, currency: 'EUR' });
		const now = () => s.bills.getBill(s.ctx, Number(id));
		ok('change_bill', { id, currency: 'USD' });
		expect([now().currency, now().name, now().amountExpected]).toEqual([
			'USD',
			'rent abroad',
			90000
		]);
		ok('change_bill', { id, flow: 'in' });
		expect([now().flow, now().currency]).toEqual(['in', 'USD']);
		ok('change_bill', { id, currency: '' });
		expect(now().currency).toBeNull();
		refused('change_bill', { id, flow: 'sideways' });
		expect(now().flow).toBe('in');
	});
});

/*
 * The verbs the capability matrix listed as the app's alone: each one is a
 * field on the change tool it belongs to, or — where there is no such tool —
 * a verb of its own. Every one keeps what it is not told about, and a refused
 * call writes nothing.
 */
describe('change_ledger', () => {
	const ledger = (id: number) =>
		database.all('select * from ledgers where id = ?', id)[0] as Record<string, unknown>;

	it('renames, archives, brings back and reorders, keeping what it is not told', () => {
		const first = s.ledgers.createLedger(s.ctx, {
			name: 'Current',
			kind: 'bank',
			defaultParser: 'nubank:conta_corrente'
		}).id;
		const second = s.ledgers.createLedger(s.ctx, { name: 'Card', kind: 'card' }).id;

		ok('change_ledger', { id: first, name: 'Everyday' });
		expect(ledger(first)).toMatchObject({
			name: 'Everyday',
			kind: 'bank',
			default_parser: 'nubank:conta_corrente'
		});

		ok('change_ledger', { id: first, archived: true });
		expect(ledger(first)).toMatchObject({ archived: 1, name: 'Everyday' });
		ok('change_ledger', { id: first, archived: false });
		expect(ledger(first).archived).toBe(0);

		ok('change_ledger', { id: second, position: 0 });
		const order = s.ledgers.listLedgers(s.ctx, { includeArchived: true }).map((l) => l.id);
		expect(order.indexOf(second)).toBeLessThan(order.indexOf(first));
	});

	it('writes nothing — not the archive, not the move — when the name is taken', () => {
		const [a, b] = s.ledgers.listLedgers(s.ctx, { includeArchived: true });
		const before = JSON.stringify(database.all('select * from ledgers order by id'));
		refused('change_ledger', { id: a.id, name: b.name, archived: true, position: 5 });
		expect(JSON.stringify(database.all('select * from ledgers order by id'))).toBe(before);
	});
});

describe('change_movement and remove_movement', () => {
	const row = (id: number) =>
		database.all('select * from finance_transactions where id = ?', id)[0] as
			| Record<string, unknown>
			| undefined;

	it('corrects the amount and keeps the rest; writes nothing for a bad date', () => {
		const ledgerId = s.ledgers.listLedgers(s.ctx, { includeArchived: true })[0].id;
		const { id } = s.statements.recordMovement(s.ctx, {
			ledgerId,
			occurredOn: '2026-03-10',
			amountCents: -4500,
			description: 'MERCADO'
		});
		ok('change_movement', { id, amount_cents: -450 });
		expect(row(id)).toMatchObject({
			amount_cents: -450,
			occurred_on: '2026-03-10',
			description: 'MERCADO',
			ledger_id: ledgerId
		});

		refused('change_movement', { id, description: 'changed anyway', occurred_on: 'Tuesday' });
		expect(row(id)).toMatchObject({ description: 'MERCADO', occurred_on: '2026-03-10' });
	});

	it('removes a line, answering with all of it', () => {
		const ledgerId = s.ledgers.listLedgers(s.ctx, { includeArchived: true })[0].id;
		const { id } = s.statements.recordMovement(s.ctx, {
			ledgerId,
			occurredOn: '2026-03-11',
			amountCents: -999,
			description: 'TWICE'
		});
		const answer = ok('remove_movement', { id });
		expect(JSON.stringify(answer)).toContain('TWICE');
		expect(row(id)).toBeUndefined();
		refused('remove_movement', { id });
	});
});

describe('change_sort_rule position', () => {
	it('moves a category rule to the front of its kind, and a refusal moves nothing', () => {
		for (const name of ['rent', 'fuel', 'pets'])
			s.statements.createRule(s.ctx, { kind: 'category', name, pattern: name });
		const names = () =>
			s.statements
				.listRules(s.ctx)
				.filter((r) => r.kind === 'category')
				.map((r) => r.name);
		const pets = s.statements.listRules(s.ctx).find((r) => r.name === 'pets')!.id;

		refused('change_sort_rule', { id: pets, pattern: '(', position: 0 });
		expect(names().indexOf('pets')).toBe(names().length - 1);

		ok('change_sort_rule', { id: pets, position: 0 });
		expect(names()[0]).toBe('pets');
		expect(s.statements.listRules(s.ctx).find((r) => r.id === pets)!.pattern).toBe('pets');
	});
});

describe('change_activity active, and remove_activity', () => {
	const activity = (id: number) =>
		database.all('select * from activities where id = ?', id)[0] as
			| Record<string, unknown>
			| undefined;

	it('switches one off and on again, keeping its name', () => {
		const { id } = ok('add_activity', { name: 'piano', category: 'work' });
		ok('change_activity', { id, active: false });
		expect(activity(Number(id))).toMatchObject({ active: 0, name: 'piano' });
		ok('change_activity', { id, active: true });
		expect(activity(Number(id))!.active).toBe(1);
	});

	it('deletes one nothing names, and refuses one a block names', () => {
		const { id } = ok('add_activity', { name: 'typo', category: 'work' });
		ok('remove_activity', { id });
		expect(activity(Number(id))).toBeUndefined();

		const { id: used } = ok('add_activity', { name: 'chess', category: 'work' });
		s.slots.createSlot(s.ctx, {
			weekday: 3,
			startTime: '20:00',
			durationMinutes: 30,
			mode: 'activity',
			activityId: used
		});
		refused('remove_activity', { id: used });
		expect(activity(Number(used))).toBeDefined();
	});
});

describe('change_notebook closed', () => {
	it('closes and reopens it, keeping its name and line', () => {
		const id = s.notebooks.createNotebook(s.ctx, { title: 'Trip', description: 'June' });
		const row = () =>
			database.all('select * from notebooks where id = ?', id)[0] as Record<string, unknown>;
		ok('change_notebook', { id, closed: true });
		expect(row().closed_at).toBeTruthy();
		expect([row().title, row().description]).toEqual(['Trip', 'June']);

		refused('change_notebook', { id, title: '', closed: false });
		expect(row().closed_at).toBeTruthy();

		ok('change_notebook', { id, closed: false });
		expect(row().closed_at).toBeNull();
	});
});

describe('change_repeating_block paused', () => {
	it('pauses and resumes without touching the block', () => {
		const work = s.activities.listCategories(s.ctx)[0] as { id: number };
		const id = s.slots.createSlot(s.ctx, {
			weekday: 4,
			startTime: '06:30',
			durationMinutes: 20,
			mode: 'category',
			categoryId: work.id,
			label: 'stretch'
		});
		const slot = () => s.slots.listWeeklySlots(s.ctx).find((w) => w.id === id)!;
		const before = { ...slot(), active: undefined };

		ok('change_repeating_block', { id, paused: true });
		expect(slot().active).toBe(false);
		expect({ ...slot(), active: undefined }).toEqual(before);

		refused('change_repeating_block', { id, paused: false, start_time: 'dawn' });
		expect(slot().active).toBe(false);

		ok('change_repeating_block', { id, paused: false });
		expect(slot().active).toBe(true);
	});
});

describe('change_inventory_item', () => {
	it('renames and retypes, keeping notes, price and section; writes nothing for a bad type', () => {
		const section = s.inventory.createCategory(s.ctx, { name: 'Tools' });
		const { id } = s.inventory.createItem(s.ctx, {
			name: 'drill bits',
			type: 'replenish',
			notes: '6mm',
			price: '12',
			inventoryCategoryId: section
		});
		const row = () =>
			database.all('select * from inventory_items where id = ?', id)[0] as Record<string, unknown>;
		const price = row().price_cents;

		ok('change_inventory_item', { id, name: 'masonry bits', type: 'someday' });
		expect(row()).toMatchObject({
			name: 'masonry bits',
			type: 'someday',
			notes: '6mm',
			price_cents: price,
			inventory_category_id: section
		});

		refused('change_inventory_item', { id, name: 'renamed anyway', type: 'sometimes' });
		expect(row().name).toBe('masonry bits');

		ok('change_inventory_item', { id, notes: '' });
		expect(row().notes ?? '').toBe('');
		expect(row().name).toBe('masonry bits');
	});
});

describe('change_workout_category', () => {
	it('renames it and keeps its workouts in it; refuses an empty name or one taken', () => {
		const id = s.workouts.createWorkoutCategory(s.ctx, 'Lifting');
		const workout = s.workouts.createWorkout(s.ctx, { title: 'Deadlift', categoryId: id });
		ok('change_workout_category', { id, name: 'Barbell' });
		const name = () =>
			(database.all('select name from workout_categories where id = ?', id)[0] as { name: string })
				.name;
		expect(name()).toBe('Barbell');
		expect(s.workouts.getWorkout(s.ctx, workout).categoryId).toBe(id);

		refused('change_workout_category', { id, name: '' });
		const other = s.workouts.createWorkoutCategory(s.ctx, 'Rowing');
		refused('change_workout_category', { id, name: 'rowing' });
		expect(other).not.toBe(id);
		expect(name()).toBe('Barbell');
	});
});

describe('reorder_tasks', () => {
	it('puts the named tasks in the order given', () => {
		const ids = ['first', 'second', 'third'].map(
			(title) => ok('add_task', { title: `order ${title}` }).id as number
		);
		ok('reorder_tasks', { ids: [ids[2], ids[0], ids[1]] });
		const order = s.todos
			.listTodos(s.ctx)
			.filter((t) => t.title.startsWith('order '))
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((t) => t.id);
		expect(order).toEqual([ids[2], ids[0], ids[1]]);
	});

	it('refuses a list with an id that is not one of them, and moves nothing', () => {
		const before = JSON.stringify(database.all('select id, sort_order from todo_tasks'));
		const [one] = s.todos.listTodos(s.ctx);
		refused('reorder_tasks', { ids: [one.id, 987654] });
		expect(JSON.stringify(database.all('select id, sort_order from todo_tasks'))).toBe(before);
	});
});
