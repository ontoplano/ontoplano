import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * Making a key that is tied to one thing.
 *
 * The enforcement is `tests/mcp-confinement.test.ts`; this is about the key
 * itself — what may be written onto one, and what is refused. Two things are
 * never taken on trust, and both of them arrive from a form somebody else
 * could compose: the kind, which has to name a row in the confinement table
 * rather than be a string, and the id, which has to be one this account could
 * list at the moment the key was made.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let createToken: typeof import('../src/lib/server/services/tokens').createToken;
let listTokens: typeof import('../src/lib/server/services/tokens').listTokens;
let authenticateToken: typeof import('../src/lib/server/services/tokens').authenticateToken;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let describeConfinement: typeof import('../src/lib/server/mcp/confinement').describeConfinement;
let confinementChoices: typeof import('../src/lib/server/mcp/confinement').confinementChoices;

const ctx = () => buildCtx(OWNER, { tz: 'UTC' });
const theirs = () => buildCtx(STRANGER, { tz: 'UTC' });

let mine = 0;
let notMine = 0;

beforeAll(async () => {
	({ createToken, listTokens, authenticateToken } =
		await import('../src/lib/server/services/tokens'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ describeConfinement, confinementChoices } = await import('../src/lib/server/mcp/confinement'));

	const { createNotebook } = await import('../src/lib/services/notebooks');
	const idOf = (made: unknown) => (typeof made === 'number' ? made : (made as { id: number }).id);
	mine = idOf(createNotebook(ctx(), { title: 'The flat' }));
	notMine = idOf(createNotebook(theirs(), { title: 'Somebody else’s' }));
});

describe('a key tied to a notebook', () => {
	it('remembers what it was tied to, through authentication', () => {
		const made = createToken(ctx(), {
			name: 'the flat',
			scopes: ['tasks:read', 'tasks:write'],
			confinedKind: 'notebook',
			confinedId: String(mine)
		});

		expect(made.confinement).toEqual({ kind: 'notebook', id: mine });
		expect(authenticateToken(made.plaintext, new Date()).confinement).toEqual({
			kind: 'notebook',
			id: mine
		});
	});

	it('is listed as what it is, named the way the person named it', () => {
		const row = listTokens(ctx()).find((t) => t.name === 'the flat');
		expect(row?.confinement).toEqual({ kind: 'notebook', id: mine });
		expect(describeConfinement(ctx(), row!.confinement)).toBe('notebook: The flat');
	});

	it('is refused a notebook belonging to somebody else', () => {
		expect(() =>
			createToken(ctx(), {
				name: 'nope',
				scopes: ['tasks:read'],
				confinedKind: 'notebook',
				confinedId: String(notMine)
			})
		).toThrow();
	});

	it('is refused a notebook that does not exist', () => {
		expect(() =>
			createToken(ctx(), {
				name: 'nope',
				scopes: ['tasks:read'],
				confinedKind: 'notebook',
				confinedId: '987654'
			})
		).toThrow();
	});

	it('is refused a kind that is not a kind', () => {
		// The one thing a request must never be able to do is invent a reach.
		for (const kind of ['everything', 'user', '__proto__', 'constructor', 'toString'])
			expect(() =>
				createToken(ctx(), {
					name: 'nope',
					scopes: ['tasks:read'],
					confinedKind: kind,
					confinedId: String(mine)
				})
			).toThrow();
	});

	it('is refused a kind with no id, rather than tied to nothing', () => {
		expect(() =>
			createToken(ctx(), { name: 'nope', scopes: ['tasks:read'], confinedKind: 'notebook' })
		).toThrow();
	});
});

describe('a key that is not tied to anything', () => {
	it('is what an empty answer makes, not an error', () => {
		for (const confinedKind of [undefined, null, '']) {
			const made = createToken(ctx(), {
				name: `open ${String(confinedKind)}`,
				scopes: ['tasks:read'],
				confinedKind
			});
			expect(made.confinement).toBeNull();
		}
	});

	it('describes as nothing at all', () => {
		expect(describeConfinement(ctx(), null)).toBeNull();
	});
});

describe('the choices the form is given', () => {
	it('are the account’s own things, and say what each still grants', () => {
		const choices = confinementChoices(ctx());
		const notebooks = choices.find((c) => c.kind === 'notebook');

		expect(notebooks?.things.map((t) => t.label)).toContain('The flat');
		expect(notebooks?.things.map((t) => t.id)).not.toContain(notMine);

		// Tasks and notes, because that is what lives in a notebook. Not the
		// shopping list, which would be a box that granted nothing.
		expect(notebooks?.scopes).toContain('tasks:write');
		expect(notebooks?.scopes).toContain('notes:read');
		expect(notebooks?.scopes).not.toContain('inventory:write');
		expect(notebooks?.scopes).not.toContain('bills:read');
	});

	it('leaves out a kind with nothing to point at', () => {
		// The stranger has one notebook of their own, so this is about the
		// account that has none: offering "tie it to a notebook" there is
		// offering a dead end.
		const fresh = buildCtx('nobody-with-notebooks', { tz: 'UTC' });
		expect(confinementChoices(fresh)).toEqual([]);
	});
});
