/**
 * The vocabulary as a thing you can manage.
 *
 * A tag used to exist only as a side effect of being typed onto something:
 * there was no rename, no colour and no way off. These are the three verbs the
 * Tags tab offers, and the one that needs watching is rename — the unique
 * index on (account, name) is what makes the vocabulary *one* vocabulary, and
 * renaming `worik` to `work` when `work` already exists is exactly what
 * somebody fixing a typo does. It merges rather than throwing.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let tagsService: typeof import('../src/lib/services/tags');
let todos: typeof import('../src/lib/services/todos');
let diary: typeof import('../src/lib/services/diary');
let ideas: typeof import('../src/lib/services/ideas');
let slots: typeof import('../src/lib/services/slots');
let activities: typeof import('../src/lib/services/activities');
let ctx: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	tagsService = await import('../src/lib/services/tags');
	todos = await import('../src/lib/services/todos');
	diary = await import('../src/lib/services/diary');
	ideas = await import('../src/lib/services/ideas');
	slots = await import('../src/lib/services/slots');
	activities = await import('../src/lib/services/activities');
	ctx = { userId: OWNER, now: new Date('2026-09-20T09:00:00'), tz: 'UTC' };
});

/** The label the account calls this word, or nothing. */
const label = (name: string, of = ctx) =>
	tagsService.listTagsWithUses(of.userId).find((one) => one.name === name);

/** What a task is labelled with right now. */
const onTodo = (id: number, of = ctx) =>
	todos
		.listTodos(of)
		.find((one) => one.id === id)!
		.tags.map((one) => one.name)
		.sort();

describe('the list', () => {
	test('is alphabetical, and says how many things carry each word', () => {
		todos.createTodo(ctx, { title: 'renew the domain', tags: 'admin, urgent' });
		todos.createTodo(ctx, { title: 'pay the bill', tags: 'admin' });
		diary.createEntry(ctx, { content: 'A slow morning.', tags: 'urgent' });

		const listed = tagsService.listTagsWithUses(ctx.userId);
		expect(listed.map((one) => one.name)).toEqual(['admin', 'urgent']);
		expect(listed.map((one) => one.uses)).toEqual([2, 2]);
	});

	test('is the account’s own, and a stranger sees none of it', () => {
		expect(tagsService.listTagsWithUses(STRANGER)).toEqual([]);
	});
});

describe('a colour', () => {
	test('goes on and comes back, lower case', () => {
		const id = label('admin')!.id;
		tagsService.recolorTag(ctx.userId, id, '#0F766E');
		expect(label('admin')!.color).toBe('#0f766e');
	});

	test('comes off again, because most labels are words rather than colours', () => {
		const id = label('admin')!.id;
		tagsService.recolorTag(ctx.userId, id, '');
		expect(label('admin')!.color).toBeNull();
	});

	test('has to be a colour', () => {
		const id = label('admin')!.id;
		expect(() => tagsService.recolorTag(ctx.userId, id, 'teal')).toThrow();
	});

	test('is not a stranger’s to set', () => {
		const id = label('admin')!.id;
		expect(() => tagsService.recolorTag(STRANGER, id, '#0f766e')).toThrow();
		expect(label('admin')!.color).toBeNull();
	});
});

describe('renaming', () => {
	test('changes the word on everything that carried it', () => {
		const todo = todos.createTodo(ctx, { title: 'file the form', tags: 'taxess' });
		tagsService.renameTag(ctx.userId, label('taxess')!.id, 'taxes');

		expect(onTodo(todo)).toEqual(['taxes']);
		expect(label('taxess')).toBeUndefined();
	});

	test('normalises the new name the way the tag box does', () => {
		const todo = todos.createTodo(ctx, { title: 'ring the bank', tags: 'bankk' });
		tagsService.renameTag(ctx.userId, label('bankk')!.id, '#Bank');
		expect(onTodo(todo)).toEqual(['bank']);
	});

	test('refuses a name that is really two names', () => {
		const id = label('bank')!.id;
		expect(() => tagsService.renameTag(ctx.userId, id, 'bank admin')).toThrow();
	});

	test('merges into a name the account already uses, rather than failing', () => {
		const one = todos.createTodo(ctx, { title: 'the deck', tags: 'hause' });
		const two = todos.createTodo(ctx, { title: 'the roof', tags: 'house' });

		const survivor = tagsService.renameTag(ctx.userId, label('hause')!.id, 'house');

		expect(survivor.name).toBe('house');
		expect(label('hause')).toBeUndefined();
		expect(onTodo(one)).toEqual(['house']);
		expect(onTodo(two)).toEqual(['house']);
		expect(label('house')!.uses).toBe(2);
	});

	test('leaves a thing that carried both carrying it once', () => {
		const both = todos.createTodo(ctx, { title: 'the garden', tags: 'yard, garden' });
		tagsService.renameTag(ctx.userId, label('yard')!.id, 'garden');

		expect(onTodo(both)).toEqual(['garden']);
		expect(label('yard')).toBeUndefined();
	});

	test('keeps the earlier date when both labels were on one thing', () => {
		const todo = todos.createTodo(ctx, { title: 'the shed', tags: 'old' });
		// The old label went on first; the new one a day later. What survives
		// has been true since the earlier of the two.
		todos.updateTodo({ ...ctx, now: new Date('2026-09-21T09:00:00') }, todo, {
			title: 'the shed',
			tags: 'old, new'
		});
		const before = todos
			.listTodos(ctx)
			.find((one) => one.id === todo)!
			.tags.find((one) => one.name === 'old')!.taggedAt;

		tagsService.renameTag(ctx.userId, label('old')!.id, 'new');

		const after = todos
			.listTodos(ctx)
			.find((one) => one.id === todo)!
			.tags.find((one) => one.name === 'new')!.taggedAt;
		expect(after).toBe(before);
	});

	test('hands the survivor a colour when it had none of its own', () => {
		todos.createTodo(ctx, { title: 'the attic', tags: 'loft' });
		todos.createTodo(ctx, { title: 'the eaves', tags: 'roof' });
		tagsService.recolorTag(ctx.userId, label('loft')!.id, '#0f766e');

		tagsService.renameTag(ctx.userId, label('loft')!.id, 'roof');
		expect(label('roof')!.color).toBe('#0f766e');
	});

	test('leaves the survivor’s own colour alone', () => {
		todos.createTodo(ctx, { title: 'the cellar', tags: 'basement' });
		todos.createTodo(ctx, { title: 'the steps', tags: 'stairs' });
		tagsService.recolorTag(ctx.userId, label('basement')!.id, '#0f766e');
		tagsService.recolorTag(ctx.userId, label('stairs')!.id, '#b45309');

		tagsService.renameTag(ctx.userId, label('basement')!.id, 'stairs');
		expect(label('stairs')!.color).toBe('#b45309');
	});

	test('is not a stranger’s to do', () => {
		const id = label('stairs')!.id;
		expect(() => tagsService.renameTag(STRANGER, id, 'theirs')).toThrow();
		expect(label('stairs')).toBeDefined();
	});
});

describe('deleting', () => {
	test('takes the label off everything that carried it, and nothing else', () => {
		const todo = todos.createTodo(ctx, { title: 'the fence', tags: 'outside, wood' });
		const idea = ideas.createIdea(ctx, { content: 'A gate in the fence.', tags: 'outside' });

		tagsService.deleteTag(ctx.userId, label('outside')!.id);

		expect(onTodo(todo)).toEqual(['wood']);
		expect(label('outside')).toBeUndefined();
		expect(
			ideas
				.listIdeas(ctx)
				.find((one) => one.id === idea)!
				.tags.map((one) => one.name)
		).toEqual([]);
	});

	test('is not a stranger’s to do', () => {
		todos.createTodo(ctx, { title: 'the gate', tags: 'latch' });
		expect(() => tagsService.deleteTag(STRANGER, label('latch')!.id)).toThrow();
		expect(label('latch')).toBeDefined();
	});
});

describe('the sweep that removes labels nothing carries', () => {
	test('leaves a word that is only on a block of the week', () => {
		// The sweep used to read four join tables and the two block ones were
		// not among them, so a label used only on the plan was deleted the next
		// time an unrelated note was edited.
		const category = activities.createCategory(ctx, { name: 'Body', color: '#0f766e' });
		slots.createSlot(ctx, {
			weekday: 1,
			startTime: '18:00',
			durationMinutes: 60,
			mode: 'category',
			categoryId: category,
			label: 'gym',
			tags: 'gym'
		});

		tagsService.cleanupOrphanTags(ctx.userId);

		expect(label('gym')).toBeDefined();
	});
});
