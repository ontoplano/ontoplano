/**
 * Every kind of thing has somewhere to open, and the room it names opens it.
 *
 * A notification that leads to a room's front door is one somebody acts on
 * twice. `$lib/object-links` is the one table of where things open; this holds
 * it to two promises a later change could quietly break: every kind the
 * assistants can touch is in it, and every room it sends to with `?edit=`
 * actually reads that parameter.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDatabase } from './helpers/db';
import { OBJECT_ROOMS, linkTo } from '../src/lib/object-links';
import { whereBurstOpens, ASSISTANT_LOG_PATH } from '../src/lib/server/services/assistant-notify';

makeDatabase();

/** The page a room is, and the components it draws that could hold the opener. */
function roomSources(room: string): string[] {
	const page = join('src/routes', room, '+page.svelte');
	if (!existsSync(page)) return [];
	const text = readFileSync(page, 'utf8');
	const components = [...text.matchAll(/from '\$lib\/components\/(\w+)\.svelte'/g)].map((m) =>
		join('src/lib/components', `${m[1]}.svelte`)
	);
	return [page, ...components.filter((file) => existsSync(file))];
}

describe('where things open', () => {
	it('names every kind the assistants can touch', async () => {
		const { KINDS } = await import('../src/lib/server/mcp/refs');
		const missing = Object.keys(KINDS).filter((kind) => !(kind in OBJECT_ROOMS));
		expect(missing, 'add these to OBJECT_ROOMS in $lib/object-links').toEqual([]);
	});

	it('sends `?edit=` only to rooms that read it', () => {
		const deaf = Object.entries(OBJECT_ROOMS)
			.filter(([, opens]) => 'by' in opens && opens.by === 'edit')
			.filter(
				([, opens]) =>
					!roomSources(opens.room).some((file) =>
						readFileSync(file, 'utf8').includes('openFromUrl(')
					)
			)
			.map(([kind, opens]) => `${kind} → ${opens.room}`);
		expect(deaf, 'these rooms ignore ?edit=; call openFromUrl in them').toEqual([]);
	});

	it('builds the editor link, the path link and the plain room', () => {
		expect(linkTo({ kind: 'todo', id: 12 })).toBe('/tasks/todo?edit=12');
		expect(linkTo({ kind: 'notebook', id: 3 })).toBe('/notebooks/3');
		expect(linkTo({ kind: 'person', id: 5 })).toBe('/notebooks/people?person=5');
		expect(linkTo({ kind: 'tag', id: 9 })).toBe('/notebooks/tags');
		expect(linkTo({ kind: 'block', id: 'slot:4' })).toBe('/tasks/plan');
		expect(linkTo({ kind: 'nothing-like-this', id: 1 })).toBeNull();
	});
});

describe('where an assistant burst opens', () => {
	const call = (kind: string | null, id: string | null, destroyed = false) => ({
		subjectKind: kind,
		subjectId: id,
		destroyed
	});

	it('opens the one thing a burst made', () => {
		expect(whereBurstOpens([call('todo', '41')])).toBe('/tasks/todo?edit=41');
	});

	it('and the same thing changed twice', () => {
		expect(whereBurstOpens([call('todo', '41'), call('todo', '41')])).toBe('/tasks/todo?edit=41');
	});

	it('opens the log for several things, a deletion, or nothing named', () => {
		expect(whereBurstOpens([call('todo', '41'), call('todo', '42')])).toBe(ASSISTANT_LOG_PATH);
		expect(whereBurstOpens([call('todo', '41', true)])).toBe(ASSISTANT_LOG_PATH);
		expect(whereBurstOpens([call(null, null)])).toBe(ASSISTANT_LOG_PATH);
	});
});
