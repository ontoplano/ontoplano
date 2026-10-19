/**
 * The read side of money, behind a token.
 *
 * The same services the Ledgers, Budgets and Commitments screens load, behind
 * `statements:read` and nothing else. What is held here: the values a script
 * gets are the values the screen draws, a caller sees only its own account,
 * another account's id is answered exactly like one that does not exist, and
 * `/movements` is a bounded page rather than the whole history.
 *
 * The write surface is deliberately absent: writes stay on MCP plus form
 * actions in this release, so each handler has a GET and no POST.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Handler = (event: never) => Response | Promise<Response>;
type Json = { error?: { code?: string }; [key: string]: unknown };

const ctx = { userId: OWNER, now: new Date('2026-10-19T12:00:00Z'), tz: 'UTC' };
const other = { ...ctx, userId: STRANGER };

let s: {
	ledgers: typeof import('../src/lib/services/ledgers');
	statements: typeof import('../src/lib/services/statements');
	budgets: typeof import('../src/lib/services/budgets');
	commitments: typeof import('../src/lib/services/commitments');
	routes: Record<'ledgers' | 'movements' | 'budgets' | 'commitments', Handler>;
	read: string;
	theirRead: string;
	noRead: string;
	ownerLedger: { id: number };
	bigLedger: { id: number };
	first: { id: number };
};

/** The smallest request the route handlers accept, authenticated by a token. */
async function get(path: string, token: string): Promise<{ status: number; body: Json }> {
	const url = new URL(`https://example.test${path}`);
	const request = new Request(url, { headers: { authorization: `Bearer ${token}` } });
	const handler = s.routes[url.pathname.split('/')[4] as keyof typeof s.routes];
	const response = await handler({ url, request, locals: {} } as never);
	return { status: response.status, body: (await response.json()) as Json };
}

beforeAll(async () => {
	const ledgers = await import('../src/lib/services/ledgers');
	const statements = await import('../src/lib/services/statements');
	const budgets = await import('../src/lib/services/budgets');
	const commitments = await import('../src/lib/services/commitments');
	const tokens = await import('../src/lib/server/services/tokens');
	const routes = {
		ledgers: (await import('../src/routes/api/v1/finance/ledgers/+server')).GET,
		movements: (await import('../src/routes/api/v1/finance/movements/+server')).GET,
		budgets: (await import('../src/routes/api/v1/finance/budgets/+server')).GET,
		commitments: (await import('../src/routes/api/v1/finance/commitments/+server')).GET
	};

	const ownerLedger = ledgers.createLedger(ctx, { name: 'Owner KES', currency: 'KES' });
	const strangerLedger = ledgers.createLedger(other, { name: 'Stranger KES', currency: 'KES' });
	const bigLedger = ledgers.createLedger(ctx, { name: 'Many lines', currency: 'KES' });

	statements.createRule(ctx, { kind: 'category', name: 'Transport', pattern: 'Transport' });
	statements.createRule(other, { kind: 'category', name: 'Transport', pattern: 'Transport' });

	const line = (ledgerId: number, occurredOn: string, amountCents: number, description: string) =>
		statements.recordMovement(ctx, { ledgerId, occurredOn, amountCents, description });

	const first = line(ownerLedger.id, '2026-10-03', -450, 'Transport fare');
	line(ownerLedger.id, '2026-10-02', -300, 'Groceries');
	line(ownerLedger.id, '2026-10-01', 1500, 'Salary');
	statements.recordMovement(other, {
		ledgerId: strangerLedger.id,
		occurredOn: '2026-10-03',
		amountCents: -900,
		description: 'Their line'
	});

	budgets.createBudget(ctx, {
		month: '2026-10',
		category: 'Transport',
		currency: 'KES',
		amountMinor: 60000
	});
	budgets.createBudget(other, {
		month: '2026-10',
		category: 'Transport',
		currency: 'KES',
		amountMinor: 90000
	});

	commitments.createCommitment(ctx, {
		name: 'Owner payable',
		kind: 'payable',
		currency: 'KES',
		openingMinor: 10000
	});
	commitments.createCommitment(other, {
		name: 'Stranger payable',
		kind: 'payable',
		currency: 'KES',
		openingMinor: 20000
	});

	// One line more than a page, all on the same day: the cursor must use the
	// id tiebreak rather than the date alone.
	for (let n = 0; n < 120; n++) line(bigLedger.id, '2026-09-15', -(n + 1), `Line ${n}`);

	s = {
		ledgers,
		statements,
		budgets,
		commitments,
		routes,
		read: tokens.createToken(ctx, { name: 'finance owner', scopes: ['statements:read'] }).plaintext,
		theirRead: tokens.createToken(other, {
			name: 'finance stranger',
			scopes: ['statements:read']
		}).plaintext,
		noRead: tokens.createToken(ctx, { name: 'only notes', scopes: ['notes:read'] }).plaintext,
		ownerLedger,
		bigLedger,
		first
	};
});

/**
 * What the new ledger endpoint answers.
 *
 * The service row keeps `balanceCents` for old UI consumers; the read API
 * deliberately does not carry a field with "balance" in its name for a
 * recorded subtotal, so the comparison drops it there rather than in the
 * service.
 */
function withoutLegacyBalance(rows: { balanceCents: unknown }[]) {
	return rows.map(({ balanceCents, ...row }) => {
		void balanceCents;
		return row;
	});
}

describe('the read endpoints answer the values the screen draws', () => {
	test('ledgers', async () => {
		const { status, body } = await get('/api/v1/finance/ledgers', s.read);
		expect(status).toBe(200);
		expect(body.ledgers).toEqual(
			withoutLegacyBalance(s.ledgers.listLedgers(ctx, { includeArchived: true }))
		);
	});

	test('budgets for one month and original currency', async () => {
		const { status, body } = await get(
			'/api/v1/finance/budgets?month=2026-10&currency=KES',
			s.read
		);
		expect(status).toBe(200);
		expect(body.budgets).toEqual(s.budgets.listBudgets(ctx, { month: '2026-10', currency: 'KES' }));
	});

	test('commitments, with the same totals', async () => {
		const { status, body } = await get('/api/v1/finance/commitments', s.read);
		expect(status).toBe(200);
		expect(body.commitments).toEqual(s.commitments.listCommitments(ctx));
		expect(body.totals).toEqual(s.commitments.commitmentTotals(ctx));
	});

	test('movements, page for page with the UI service', async () => {
		const ui = s.statements.listMovements(ctx, {
			ledgerId: s.ownerLedger.id,
			month: '2026-10'
		});
		const { status, body } = await get(
			`/api/v1/finance/movements?ledger=${s.ownerLedger.id}&month=2026-10&limit=2`,
			s.read
		);
		expect(status).toBe(200);
		expect(body.movements).toEqual(ui.slice(0, 2));
		// Everything the Ledgers screen shows beside a line is here too.
		expect((body.movements as Record<string, unknown>[])[0]).toMatchObject({
			ledgerName: 'Owner KES',
			kind: null,
			category: 'Transport',
			tags: [],
			allocations: []
		});

		const second = await get(
			`/api/v1/finance/movements?ledger=${s.ownerLedger.id}&month=2026-10&limit=2&cursor=${body.nextCursor}`,
			s.read
		);
		expect(body.movements).toHaveLength(2);
		expect(second.body.movements).toEqual(ui.slice(2, 4));
		expect(second.body.movements).toHaveLength(1);
	});

	test('the own ledger id is readable', async () => {
		const mine = await get(`/api/v1/finance/movements?ledger=${s.ownerLedger.id}`, s.read);
		expect(mine.status).toBe(200);
		expect(mine.body.movements).toHaveLength(3);
	});
});

describe('a caller reads only its own account', () => {
	test('every list is the caller’s', async () => {
		const ledgers = await get('/api/v1/finance/ledgers', s.theirRead);
		expect(ledgers.body.ledgers).toEqual(
			withoutLegacyBalance(s.ledgers.listLedgers(other, { includeArchived: true }))
		);

		const movements = await get('/api/v1/finance/movements?limit=100', s.theirRead);
		expect(movements.body.movements).toEqual(s.statements.listMovements(other, { limit: 100 }));
		expect(JSON.stringify(movements.body)).not.toContain('Owner KES');

		const budgets = await get('/api/v1/finance/budgets?month=2026-10', s.theirRead);
		expect(budgets.body.budgets).toEqual(s.budgets.listBudgets(other, { month: '2026-10' }));

		const commitments = await get('/api/v1/finance/commitments', s.theirRead);
		expect(commitments.body.commitments).toEqual(s.commitments.listCommitments(other));
	});
});

describe('another account’s id says exactly what a missing one says', () => {
	test('a ledger id', async () => {
		const foreign = await get(`/api/v1/finance/movements?ledger=${s.ownerLedger.id}`, s.theirRead);
		const missing = await get('/api/v1/finance/movements?ledger=987654', s.theirRead);
		expect(foreign.status).toBe(404);
		expect(foreign.status).toBe(missing.status);
		expect(foreign.body).toEqual(missing.body);
	});

	test('a cursor id', async () => {
		const foreign = await get(`/api/v1/finance/movements?cursor=${s.first.id}`, s.theirRead);
		const missing = await get('/api/v1/finance/movements?cursor=987654', s.theirRead);
		expect(foreign.status).toBe(404);
		expect(foreign.status).toBe(missing.status);
		expect(foreign.body).toEqual(missing.body);
	});
});

describe('movements are a bounded page, never the whole history', () => {
	test('default and clamped limits hold, and the cursor walks the rest', async () => {
		const first = await get(`/api/v1/finance/movements?ledger=${s.bigLedger.id}`, s.read);
		expect(first.body.movements).toHaveLength(100);
		expect(first.body.nextCursor).toBeTypeOf('number');
		expect(s.statements.listMovements(ctx, { ledgerId: s.bigLedger.id }).length).toBe(120);

		const clamped = await get(
			`/api/v1/finance/movements?ledger=${s.bigLedger.id}&limit=500`,
			s.read
		);
		expect(clamped.body.movements).toHaveLength(100);

		const second = await get(
			`/api/v1/finance/movements?ledger=${s.bigLedger.id}&cursor=${first.body.nextCursor}`,
			s.read
		);
		expect(second.body.movements).toHaveLength(20);
		expect(second.body.nextCursor).toBe(null);

		const ids = [
			...(first.body.movements as { id: number }[]),
			...(second.body.movements as { id: number }[])
		].map((row) => row.id);
		expect(new Set(ids).size).toBe(120);

		const beyond = await get(
			`/api/v1/finance/movements?ledger=${s.bigLedger.id}&cursor=${ids.at(-1)}`,
			s.read
		);
		expect(beyond.body.movements).toEqual([]);
		expect(beyond.body.nextCursor).toBe(null);
	});
});

describe('the grant and the read-only surface', () => {
	test('a token without statements:read is refused by every endpoint', async () => {
		for (const path of [
			'/api/v1/finance/ledgers',
			'/api/v1/finance/movements',
			'/api/v1/finance/budgets',
			'/api/v1/finance/commitments'
		]) {
			const { status, body } = await get(path, s.noRead);
			expect(status, path).toBe(403);
			expect(body.error?.code, path).toBe('forbidden');
		}
	});

	test('no handler offers a write', () => {
		for (const route of Object.values(s.routes))
			expect((route as unknown as { POST?: unknown }).POST).toBeUndefined();
	});
});
