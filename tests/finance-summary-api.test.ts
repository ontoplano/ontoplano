/**
 * One money picture, three doors.
 *
 * The page loader, the assistant's `summary` tool and `GET
 * /api/v1/finance/summary` must answer the same object for the same month and
 * balance date — not three assemblies that agree today. Every one of them
 * calls `moneyOverview`; this is the test that would fail the day one of them
 * started doing its own arithmetic.
 *
 * The caller's account is the boundary: a second account with nothing in it
 * gets an empty picture, and the first account's figures never appear in its
 * answer.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Overview = {
	month: string;
	asOf: string;
	currencies: Record<string, unknown>[];
};

const ctx = { userId: OWNER, now: new Date('2026-10-19T12:00:00Z'), tz: 'UTC' };
const other = { ...ctx, userId: STRANGER };

let s: {
	load: (event: never) => { overview: Overview };
	summary: (event: never) => Response | Promise<Response>;
	handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
	tokens: typeof import('../src/lib/server/services/tokens');
	moneyOverview: typeof import('../src/lib/services/finance-summary').moneyOverview;
	read: string;
	theirRead: string;
	noRead: string;
};

async function callSummary(token: string, query = 'month=2026-10') {
	const url = new URL(`https://example.test/api/v1/finance/summary?${query}`);
	const request = new Request(url, { headers: { authorization: `Bearer ${token}` } });
	const response = await s.summary({ url, request, locals: {} } as never);
	return {
		status: response.status,
		body: (await response.json()) as Overview & { error?: unknown }
	};
}

function mcpSummary(
	who: typeof ctx,
	scopes: string[],
	args: Record<string, unknown>,
	confinement?: { kind: string; id: number }
) {
	const response = s.handleBody(
		{ ctx: who, scopes, ...(confinement ? { confinement } : {}) } as never,
		{
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'summary', arguments: args }
		}
	) as {
		error?: unknown;
		result?: { isError?: boolean; structuredContent?: Overview & { error?: unknown } };
	};
	return {
		failed: !!response.error || !!response.result?.isError,
		data: response.result?.structuredContent
	};
}

beforeAll(async () => {
	const ledgers = await import('../src/lib/services/ledgers');
	const statements = await import('../src/lib/services/statements');
	const budgets = await import('../src/lib/services/budgets');
	const commitments = await import('../src/lib/services/commitments');
	const summary = await import('../src/lib/services/finance-summary');
	const page = await import('../src/routes/finance/+page.server');
	const route = await import('../src/routes/api/v1/finance/summary/+server');
	const protocol = await import('../src/lib/server/mcp/protocol');
	const tokens = await import('../src/lib/server/services/tokens');

	const kes = ledgers.createLedger(ctx, {
		name: 'Owner summary KES',
		currency: 'KES',
		openingOn: '2026-09-01',
		openingMinor: 100000
	});
	ledgers.createLedger(ctx, {
		name: 'Owner summary USD',
		currency: 'USD',
		openingOn: '2026-09-01',
		openingMinor: 50000
	});
	statements.createRule(ctx, { kind: 'category', name: 'Transport', pattern: 'Transport' });
	statements.recordMovement(ctx, {
		ledgerId: kes.id,
		occurredOn: '2026-10-02',
		amountCents: -2500,
		description: 'Transport ride'
	});
	budgets.createBudget(ctx, {
		month: '2026-10',
		category: 'Transport',
		currency: 'KES',
		amountMinor: 60000
	});
	commitments.createCommitment(ctx, {
		name: 'Owner summary payable',
		kind: 'payable',
		currency: 'KES',
		openingMinor: 10000
	});

	s = {
		load: page.load,
		summary: route.GET,
		handleBody: protocol.handleBody,
		tokens,
		moneyOverview: summary.moneyOverview,
		read: tokens.createToken(ctx, { name: 'summary read', scopes: ['statements:read'] }).plaintext,
		theirRead: tokens.createToken(other, {
			name: 'summary stranger',
			scopes: ['statements:read']
		}).plaintext,
		noRead: tokens.createToken(ctx, { name: 'summary no read', scopes: ['notes:read'] }).plaintext
	};
});

test('the page, the assistant and the script answer the same money picture', async () => {
	const page = s.load({
		locals: { user: { id: OWNER } },
		url: new URL('https://example.test/finance?month=2026-10')
	} as never);
	const asOf = page.overview.asOf;
	expect(page.overview.month).toBe('2026-10');
	expect(page.overview.currencies.map((row) => row.currency)).toEqual(['KES', 'USD']);

	// The page and the service are one assembly, not two that agree.
	expect(page.overview).toEqual(s.moneyOverview(ctx, { month: '2026-10', asOf }));

	const assistant = mcpSummary(ctx, ['statements:read'], {
		month: '2026-10',
		as_of: asOf
	});
	expect(assistant.failed).toBe(false);
	expect(assistant.data).toEqual(page.overview);

	const script = await callSummary(s.read, `month=2026-10&as_of=${asOf}`);
	expect(script.status).toBe(200);
	expect(script.body).toEqual(page.overview);
});

test('another account gets its own empty picture, and a read grant is required', async () => {
	const theirs = await callSummary(s.theirRead, 'month=2026-10');
	expect(theirs.status).toBe(200);
	expect(theirs.body.currencies).toEqual([]);
	expect(JSON.stringify(theirs.body)).not.toContain('Owner summary');

	const assistant = mcpSummary(other, ['statements:read'], { month: '2026-10' });
	expect(assistant.failed).toBe(false);
	expect(assistant.data?.currencies).toEqual([]);

	const refused = await callSummary(s.noRead, 'month=2026-10');
	expect(refused.status).toBe(403);
	expect((refused.body.error as { code?: string }).code).toBe('forbidden');
	expect(mcpSummary(ctx, ['notes:read'], { month: '2026-10' }).failed).toBe(true);

	// The picture is the whole account's, so a key pinned to one notebook is
	// not offered it — the refusal is the same rule that hides `diary`.
	expect(
		mcpSummary(ctx, ['statements:read'], { month: '2026-10' }, { kind: 'notebook', id: 1 }).failed
	).toBe(true);
});
