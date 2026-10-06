/**
 * Goals and ideas are numbered inside their notebook, the way tasks are, so a
 * note can point at one: `GOAL:#2`, `IDEA:#7`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let notebooks: typeof import('../src/lib/services/notebooks');
let goals: typeof import('../src/lib/services/goals');
let ideas: typeof import('../src/lib/services/ideas');
let linking: typeof import('../src/lib/services/notebook-linking');
let ctx: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	notebooks = await import('../src/lib/services/notebooks');
	goals = await import('../src/lib/services/goals');
	ideas = await import('../src/lib/services/ideas');
	linking = await import('../src/lib/services/notebook-linking');
	ctx = { userId: OWNER, now: new Date('2026-09-20T09:00:00'), tz: 'UTC' };
});

const book = (title: string) =>
	notebooks.createNotebook(ctx, { title, modules: ['notes', 'goals', 'ideas'] });
const goalSeq = (id: number) =>
	goals.listGoals(ctx, { includeClosed: true }).find((one) => one.id === id)?.notebookSeq;
const ideaSeq = (id: number) => ideas.listIdeas(ctx).find((one) => one.id === id)?.notebookSeq;

describe('a goal inside a notebook', () => {
	test('is numbered from one, and keeps its number when edited', () => {
		const here = book('Running');
		const first = goals.createGoal(ctx, { title: '5k', horizon: 'month', notebookId: here });
		const second = goals.createGoal(ctx, { title: '10k', horizon: 'year', notebookId: here });
		expect(goalSeq(first)).toBe(1);
		expect(goalSeq(second)).toBe(2);

		goals.updateGoal(ctx, first, { title: '5k, faster', notebookId: here });
		expect(goalSeq(first)).toBe(1);
	});

	test('gains a number when filed, and loses it when taken out', () => {
		const here = book('Filing goals');
		const loose = goals.createGoal(ctx, { title: 'loose', horizon: 'week' });
		expect(goalSeq(loose)).toBeNull();

		goals.updateGoal(ctx, loose, { title: 'loose', notebookId: here });
		expect(goalSeq(loose)).toBe(1);

		goals.updateGoal(ctx, loose, { title: 'loose', notebookId: null });
		expect(goalSeq(loose)).toBeNull();
	});

	test('a number is never handed to a second goal', () => {
		const here = book('High water goals');
		const first = goals.createGoal(ctx, { title: 'first', horizon: 'week', notebookId: here });
		goals.deleteGoal(ctx, first);
		const next = goals.createGoal(ctx, { title: 'second', horizon: 'week', notebookId: here });
		expect(goalSeq(next)).toBe(2);
	});
});

describe('an idea inside a notebook', () => {
	test('is numbered on creation, when moved, and when linked from the notebook', () => {
		const here = book('Ideas');
		const first = ideas.createIdea(ctx, { content: 'paint the door', notebookId: here });
		expect(ideaSeq(first)).toBe(1);

		const loose = ideas.createIdea(ctx, { content: 'a shelf' });
		expect(ideaSeq(loose)).toBeNull();
		linking.fileUnderNotebook(ctx, 'ideas', loose, here);
		expect(ideaSeq(loose)).toBe(2);

		// An edit that leaves the notebook alone leaves the number alone.
		ideas.updateIdea(ctx, first, { content: 'paint the door blue' });
		expect(ideaSeq(first)).toBe(1);

		const elsewhere = book('Elsewhere');
		ideas.batchIdeas(ctx, 'notebook', [first], { notebookId: elsewhere });
		expect(ideaSeq(first)).toBe(1);
		ideas.updateIdea(ctx, loose, { content: 'a shelf', notebookId: elsewhere });
		expect(ideaSeq(loose)).toBe(2);
	});
});
