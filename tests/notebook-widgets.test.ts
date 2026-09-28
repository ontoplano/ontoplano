import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * A home-screen widget showing one tab of one notebook.
 *
 * Two halves: the lines a tab turns into, filtered and ordered the way the tab
 * offers; and the widget itself, whose key reads that tab of that notebook and
 * nothing else — not another notebook, not another tab's grant, not the rest
 * of the API.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Sections = typeof import('../src/lib/services/notebook-sections');
type Widgets = typeof import('../src/lib/server/services/phone-widgets');
type Tokens = typeof import('../src/lib/server/services/tokens');

let sections: Sections;
let widgets: Widgets;
let tokens: Tokens;
let api: typeof import('../src/lib/server/api/auth');
let widgetQuery: typeof import('../src/lib/notebook-widget').widgetQuery;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;

const ctx = () => buildCtx(OWNER, { tz: 'UTC' });
const theirs = () => buildCtx(STRANGER, { tz: 'UTC' });

let flat = 0;
let trip = 0;
let strangers = 0;
const todo: Record<string, number> = {};
const note: Record<string, number> = {};

function asEvent(token: string) {
	return {
		request: new Request('https://example.test/api/v1/inventory', {
			headers: { authorization: `Bearer ${token}` }
		}),
		locals: {}
	} as unknown as Parameters<typeof api.authenticateApi>[0];
}

beforeAll(async () => {
	sections = await import('../src/lib/services/notebook-sections');
	widgets = await import('../src/lib/server/services/phone-widgets');
	tokens = await import('../src/lib/server/services/tokens');
	api = await import('../src/lib/server/api/auth');
	({ widgetQuery } = await import('../src/lib/notebook-widget'));
	({ buildCtx } = await import('../src/lib/services/ctx'));

	const { createNotebook } = await import('../src/lib/services/notebooks');
	const { createTodo, setTodoStatus } = await import('../src/lib/services/todos');
	const { createEntry, pinEntry, archiveEntry } = await import('../src/lib/services/diary');

	flat = createNotebook(ctx(), { title: 'The flat', modules: ['notes', 'tasks', 'goals'] });
	trip = createNotebook(ctx(), { title: 'The trip', modules: ['notes', 'tasks'] });
	strangers = createNotebook(theirs(), { title: 'Theirs', modules: ['notes', 'tasks'] });

	// Written a second apart, so "added" has an order to find.
	const at = (second: number) =>
		buildCtx(OWNER, { tz: 'UTC', now: new Date(Date.UTC(2026, 8, 1, 9, 0, second)) });
	todo.paint = createTodo(at(1), { title: 'Paint the hall', notebookId: flat, tags: 'walls' });
	todo.tiles = createTodo(at(2), {
		title: 'Buy tiles',
		notebookId: flat,
		ratings: { urgency: 5, ease: null, interest: null }
	});
	todo.plumber = createTodo(at(3), { title: 'Call the plumber', notebookId: flat });
	setTodoStatus(ctx(), todo.plumber, 'done');
	todo.elsewhere = createTodo(at(4), { title: 'Book the ferry', notebookId: trip });

	note.measures = createEntry(at(1), { content: 'Measurements', notebookId: flat });
	note.colours = createEntry(at(2), { content: 'Colours we liked', notebookId: flat });
	note.old = createEntry(at(3), { content: 'Old quote', notebookId: flat });
	pinEntry(ctx(), note.colours);
	archiveEntry(ctx(), note.old);
});

describe('a tab as lines', () => {
	it('lists open tasks only, newest first, each linking to itself on its tab', () => {
		const answer = sections.sectionItems(ctx(), flat, widgetQuery('tasks', {}));
		expect(answer.items.map((one) => one.id)).toEqual([todo.tiles, todo.paint]);
		expect(answer.items[0].href).toBe(`/notebooks/${flat}?tab=tasks&item=${todo.tiles}`);
		expect(answer.href).toBe(`/notebooks/${flat}?tab=tasks`);
		expect(answer.notebook.title).toBe('The flat');
	});

	it('filters by status and by tag', () => {
		const done = sections.sectionItems(ctx(), flat, widgetQuery('tasks', { status: 'done' }));
		expect(done.items.map((one) => one.id)).toEqual([todo.plumber]);
		expect(done.items[0].done).toBe(true);

		const walls = sections.sectionItems(ctx(), flat, widgetQuery('tasks', { tag: '#walls' }));
		// `#walls` is not a tag; `walls` is — the widget stores what was picked.
		expect(walls.items).toEqual([]);
		const tagged = sections.sectionItems(ctx(), flat, widgetQuery('tasks', { tag: 'Walls' }));
		expect(tagged.items.map((one) => one.id)).toEqual([todo.paint]);
	});

	it('orders the way the tab does, both ways round', () => {
		const oldest = sections.sectionItems(
			ctx(),
			flat,
			widgetQuery('tasks', { order: 'created', direction: 'asc', status: 'all' })
		);
		expect(oldest.items.map((one) => one.id)).toEqual([todo.paint, todo.tiles, todo.plumber]);

		const priority = sections.sectionItems(
			ctx(),
			flat,
			widgetQuery('tasks', { order: 'priority' })
		);
		expect(priority.items[0].id).toBe(todo.tiles);
	});

	it('cuts to the limit but says how many there were', () => {
		const one = sections.sectionItems(
			ctx(),
			flat,
			widgetQuery('tasks', { status: 'all', limit: '1' })
		);
		expect(one.items).toHaveLength(1);
		expect(one.total).toBe(3);
	});

	it('keeps notes pinned first, and leaves archived ones out unless asked', () => {
		const open = sections.sectionItems(ctx(), flat, widgetQuery('notes', {}));
		expect(open.items.map((one) => one.id)).toEqual([note.colours, note.measures]);

		const pinned = sections.sectionItems(ctx(), flat, widgetQuery('notes', { status: 'pinned' }));
		expect(pinned.items.map((one) => one.id)).toEqual([note.colours]);

		const archived = sections.sectionItems(
			ctx(),
			flat,
			widgetQuery('notes', { status: 'archived' })
		);
		expect(archived.items.map((one) => one.id)).toEqual([note.old]);

		const byTitle = sections.sectionItems(
			ctx(),
			flat,
			widgetQuery('notes', { order: 'title', direction: 'desc', status: 'all' })
		);
		expect(byTitle.items.map((one) => one.title)).toEqual([
			'Colours we liked',
			'Old quote',
			'Measurements'
		]);
	});

	it('falls back to the first choice for anything the tab does not offer', () => {
		expect(widgetQuery('goals', { status: 'pinned', order: 'priority', tag: 'x' })).toMatchObject({
			status: 'open',
			order: 'period',
			tag: null
		});
	});

	it('answers a stranger exactly as it answers a notebook that does not exist', () => {
		expect(() => sections.sectionItems(theirs(), flat, widgetQuery('tasks', {}))).toThrow(
			/not found/i
		);
		expect(() => sections.sectionItems(ctx(), 999_999, widgetQuery('tasks', {}))).toThrow(
			/not found/i
		);
	});
});

describe('a widget and its key', () => {
	let made: { id: number; token: string };

	it('is made with a key confined to its notebook and granted its tab alone', () => {
		made = widgets.createPhoneWidget(ctx(), {
			notebookId: String(flat),
			section: 'tasks',
			status: 'open',
			order: 'created',
			direction: 'desc'
		});
		const key = tokens.authenticateToken(made.token, new Date());
		expect(key.scopes).toEqual(['tasks:read']);
		expect(key.confinement).toEqual({ kind: 'notebook', id: flat });

		const answer = widgets.widgetFor(ctx(), key);
		expect(answer.widget).toBe(made.id);
		expect(answer.items.map((one) => one.id)).toEqual([todo.tiles, todo.paint]);
	});

	it('refuses a tab the notebook does not hold, and a notebook somebody else owns', () => {
		expect(() =>
			widgets.createPhoneWidget(ctx(), { notebookId: String(trip), section: 'goals' })
		).toThrow();
		expect(() =>
			widgets.createPhoneWidget(ctx(), { notebookId: String(strangers), section: 'tasks' })
		).toThrow(/not found/i);
	});

	it('is listed for its owner and nobody else', () => {
		expect(widgets.listPhoneWidgets(ctx()).map((one) => one.id)).toContain(made.id);
		expect(widgets.listPhoneWidgets(theirs())).toEqual([]);
	});

	it('moves its key when it is pointed somewhere else', () => {
		widgets.updatePhoneWidget(ctx(), made.id, {
			notebookId: String(trip),
			section: 'notes',
			status: 'all',
			order: 'title',
			direction: 'asc'
		});
		const key = tokens.authenticateToken(made.token, new Date());
		expect(key.scopes).toEqual(['notes:read']);
		expect(key.confinement).toEqual({ kind: 'notebook', id: trip });
		expect(widgets.widgetFor(ctx(), key).notebook.id).toBe(trip);
	});

	it('cannot be changed or deleted by a stranger', () => {
		expect(() =>
			widgets.updatePhoneWidget(theirs(), made.id, {
				notebookId: String(strangers),
				section: 'tasks'
			})
		).toThrow(/not found/i);
		expect(() => widgets.deletePhoneWidget(theirs(), made.id)).toThrow(/not found/i);
		expect(widgets.listPhoneWidgets(ctx()).map((one) => one.id)).toContain(made.id);
	});

	it('is not answered for a key that is not its own', () => {
		const other = tokens.createToken(ctx(), {
			name: 'not a widget',
			scopes: ['notes:read'],
			confinedKind: 'notebook',
			confinedId: String(trip)
		});
		const key = tokens.authenticateToken(other.plaintext, new Date());
		expect(() => widgets.widgetFor(ctx(), key)).toThrow(/not found/i);
	});

	it('cannot use its key on an endpoint that answers for the whole account', () => {
		expect(() => api.authenticateApi(asEvent(made.token), 'notes:read')).toThrow(
			/confinedKeyCannotUseThis/
		);
		expect(
			api.authenticateApi(asEvent(made.token), 'notes:read', { confined: true }).token?.tokenId
		).toBeTruthy();
	});

	it('revokes its key when it is deleted', () => {
		widgets.deletePhoneWidget(ctx(), made.id);
		expect(widgets.listPhoneWidgets(ctx()).map((one) => one.id)).not.toContain(made.id);
		expect(() => tokens.authenticateToken(made.token, new Date())).toThrow(/revoked/i);
	});
});
