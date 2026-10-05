/**
 * The pictures nothing points at.
 *
 * A picture is uploaded when it is pasted and survives the line that
 * mentioned it being deleted, so the gallery lists the ones nothing uses. The
 * expensive mistake is the other direction — calling a picture unused while
 * something still shows it, and offering it for deleting — so every way a
 * picture can be used is asked here, one picture each.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let media: typeof import('../src/lib/services/media');
let unused: typeof import('../src/lib/services/unused-media');
let s: {
	diary: typeof import('../src/lib/services/diary');
	ideas: typeof import('../src/lib/services/ideas');
	todos: typeof import('../src/lib/services/todos');
	goals: typeof import('../src/lib/services/goals');
	people: typeof import('../src/lib/services/people');
	gallery: typeof import('../src/lib/services/gallery');
};
const ctx = { userId: OWNER, now: new Date('2026-10-03T09:00:00Z'), tz: 'UTC' };
const theirs = { ...ctx, userId: STRANGER };

let shade = 0;
/** A distinct picture each time: the same bytes twice are one row. */
async function picture(who = ctx): Promise<number> {
	shade += 1;
	const bytes = Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		Buffer.alloc(64, shade)
	]);
	return (await media.store(who, { bytes, filename: `p${shade}.png` })).id;
}

beforeAll(async () => {
	media = await import('../src/lib/services/media');
	unused = await import('../src/lib/services/unused-media');
	s = {
		diary: await import('../src/lib/services/diary'),
		ideas: await import('../src/lib/services/ideas'),
		todos: await import('../src/lib/services/todos'),
		goals: await import('../src/lib/services/goals'),
		people: await import('../src/lib/services/people'),
		gallery: await import('../src/lib/services/gallery')
	};
});

describe('unused pictures', () => {
	test('are the ones nothing points at, however a picture is used', async () => {
		const loose = await picture();
		const inNote = await picture();
		const inIdea = await picture();
		const inTodo = await picture();
		const inGoal = await picture();
		const inAlbum = await picture();

		s.diary.createEntry(ctx, { content: `a day ![d](/media/${inNote})` });
		s.ideas.createIdea(ctx, { content: `thought ![b](/media/${inIdea})` });
		s.todos.createTodo(ctx, { title: 'fix it', notes: `![c](/media/${inTodo})` });
		s.goals.createGoal(ctx, { title: 'Grow', horizon: 'year', notes: `![g](/media/${inGoal})` });
		const album = s.gallery.createAlbum(ctx, { name: 'Trips' });
		s.gallery.addToAlbum(ctx, album.id, inAlbum);
		const person = s.people.createPerson(ctx, { name: 'Ana' });
		const face = (
			await media.setPersonPicture(ctx, person, {
				bytes: Buffer.concat([
					Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
					Buffer.alloc(64, 250)
				])
			})
		).id;

		const ids = unused.unusedPictures(ctx).map((p) => p.id);
		expect(ids).toContain(loose);
		for (const used of [inNote, inIdea, inTodo, inGoal, inAlbum, face])
			expect(ids).not.toContain(used);
		expect(unused.unusedPictureCount(ctx)).toBe(ids.length);
	});

	test('one cut out of a todo becomes unused, and can be deleted', async () => {
		const shot = await picture();
		const todo = s.todos.createTodo(ctx, { title: 'brief', notes: `![s](/media/${shot})` });
		expect(unused.unusedPictures(ctx).map((p) => p.id)).not.toContain(shot);

		s.todos.updateTodo(ctx, todo, { title: 'brief', notes: 'no picture now' });
		expect(unused.unusedPictures(ctx).map((p) => p.id)).toContain(shot);

		expect(unused.removeUnused(ctx, [shot])).toBe(1);
		expect(media.list(ctx).map((p) => p.id)).not.toContain(shot);
	});

	test('a picture in use is refused, and nothing in the batch is deleted', async () => {
		const loose = await picture();
		const kept = await picture();
		s.ideas.createIdea(ctx, { content: `![k](/media/${kept})` });

		expect(() => unused.removeUnused(ctx, [loose, kept])).toThrow();
		const left = media.list(ctx).map((p) => p.id);
		expect(left).toContain(loose);
		expect(left).toContain(kept);
	});

	test('a stranger sees none of them and deletes none of them', async () => {
		const mine = await picture();
		expect(unused.unusedPictures(theirs).map((p) => p.id)).not.toContain(mine);
		expect(() => unused.removeUnused(theirs, [mine])).toThrow();
		expect(media.list(ctx).map((p) => p.id)).toContain(mine);
	});

	/*
	 * The bug found on the way: `isReferenced` kept its own list, without
	 * todos or ideas, so replacing a person's photo deleted the old file even
	 * while it was pasted into a todo.
	 */
	test('replacing a photo keeps the old one when a todo still shows it', async () => {
		const person = s.people.createPerson(ctx, { name: 'Bea' });
		const first = (
			await media.setPersonPicture(ctx, person, {
				bytes: Buffer.concat([
					Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
					Buffer.alloc(64, 240)
				])
			})
		).id;
		s.todos.createTodo(ctx, { title: 'frame it', notes: `![f](/media/${first})` });
		await media.setPersonPicture(ctx, person, {
			bytes: Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64, 241)])
		});
		expect(media.list(ctx).map((p) => p.id)).toContain(first);
	});
});
