import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const { handleBody } = await import('../src/lib/server/mcp/protocol');
const { createLedger } = await import('../src/lib/services/ledgers');
const { recordMovement, listMovements } = await import('../src/lib/services/statements');
const { createNotebook } = await import('../src/lib/services/notebooks');
const { listAssistantCalls, putBack } = await import('../src/lib/server/services/assistant-log');
const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-18T12:00:00Z') };
const scopes = ['statements:read', 'statements:write', 'destructive'];

function call(
	name: string,
	args: Record<string, unknown>,
	options: {
		scopes?: string[];
		userId?: string;
		confinement?: { kind: string; id: number };
	} = {}
) {
	const response = handleBody(
		{
			ctx: { ...ctx, userId: options.userId ?? OWNER },
			scopes: options.scopes ?? scopes,
			...(options.confinement ? { confinement: options.confinement } : {})
		} as never,
		{
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name, arguments: args }
		}
	) as {
		error?: unknown;
		result?: {
			isError?: boolean;
			structuredContent?: Record<string, unknown>;
			content?: { text: string }[];
		};
	};
	return {
		failed: !!response.error || !!response.result?.isError,
		data: response.result?.structuredContent ?? {},
		response
	};
}

function made(name: string, args: Record<string, unknown>) {
	const result = call(name, args);
	expect(result.failed, JSON.stringify(result.response)).toBe(false);
	return result.data.id as number;
}

function stock(name: string, kind = 'payable', openingMinor = 10000) {
	return made('add_commitment', { name, kind, currency: 'KES', opening_minor: openingMinor });
}

test('MCP creates and reads commitments without creating bank movements; grants and retries are enforced', () => {
	const args = {
		name: 'Synthetic payable',
		kind: 'payable',
		currency: 'KES',
		opening_minor: 10000,
		requestId: 'commitment-create-0001'
	};
	expect(call('add_commitment', args, { scopes: ['statements:read'] }).failed).toBe(true);
	const id = made('add_commitment', args);
	expect(made('add_commitment', args)).toBe(id);
	const result = call('commitments', {}, { scopes: ['statements:read'] });
	expect(result.failed).toBe(false);
	expect(result.data.items).toEqual(
		expect.arrayContaining([expect.objectContaining({ id, currency: 'KES', balanceMinor: 10000 })])
	);
	expect(listMovements(ctx)).toEqual([]);
});

test('MCP changes only named fields and archives/reopens through the shared service', () => {
	const id = stock('Editable reserve', 'reserve', 5000);
	expect(call('change_commitment', { id, name: 'Renamed reserve' }).failed).toBe(false);
	let rows = call('commitments', {}).data.items as Record<string, unknown>[];
	expect(rows.find((row) => row.id === id)).toMatchObject({
		name: 'Renamed reserve',
		kind: 'reserve',
		currency: 'KES',
		openingMinor: 5000
	});
	expect(call('archive_commitment', { id, archived: true }).failed).toBe(false);
	rows = call('commitments', { include_archived: true }).data.items as Record<string, unknown>[];
	expect(rows.find((row) => row.id === id)).toMatchObject({ status: 'archived' });
	expect(call('archive_commitment', { id, archived: false }).failed).toBe(false);
	expect(call('close_commitment', { id }).failed).toBe(true);
	expect(
		call('close_commitment', { id, write_off_note: 'Explicit synthetic write-off' }).failed
	).toBe(false);
});

test('MCP splits a mixed payment atomically; checks every commitment reference and preserves ledger truth', () => {
	const ledger = createLedger(ctx, { name: 'Split MCP account', currency: 'KES' });
	const movement = recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-17',
		amountCents: -250000,
		description: 'Mixed payment'
	});
	const id = stock('Mixed payment payable', 'payable', 10000);
	const args = {
		id: movement.id,
		allocations: [
			{ kind: 'personal', amount_minor: -247500, category: 'Synthetic spending' },
			{ kind: 'custody', amount_minor: -2500, commitment_id: id }
		],
		requestId: 'movement-split-0001'
	};
	expect(call('split_movement', args).failed).toBe(false);
	expect(call('split_movement', args).failed).toBe(false);
	expect(listMovements(ctx, { ledgerId: ledger.id })[0].amountCents).toBe(-250000);
	const entries = call('commitment_entries', { commitment_id: id });
	expect(entries.failed).toBe(false);
	expect(entries.data.items).toEqual([
		expect.objectContaining({ amountMinor: -2500, transactionId: movement.id })
	]);
	expect(call('unsplit_movement', { id: movement.id }).failed).toBe(true);
	const other = { ...ctx, userId: STRANGER };
	const foreign = call(
		'add_commitment',
		{ name: 'Other account', kind: 'payable', currency: 'KES', opening_minor: 1000 },
		{ userId: STRANGER }
	);
	expect(foreign.failed).toBe(false);
	const fresh = recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-17',
		amountCents: -1000,
		description: 'Not theirs'
	});
	const bad = {
		id: fresh.id,
		allocations: [{ kind: 'custody', amount_minor: -1000, commitment_id: foreign.data.id }]
	};
	const missing = { ...bad, allocations: [{ ...bad.allocations[0], commitment_id: 987654 }] };
	expect(call('split_movement', bad).response).toEqual(call('split_movement', missing).response);
	expect(listMovements(other)).toEqual([]);
});

test('settlement retries reduce a stock once; entry removal needs destructive permission and can be put back', () => {
	const id = stock('Settlement payable');
	const ledger = createLedger(ctx, { name: 'Settlement MCP account', currency: 'KES' });
	const line = recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-16',
		amountCents: -3000,
		description: 'Owner expense'
	});
	const args = { commitment_id: id, transaction_id: line.id, requestId: 'settlement-request-0001' };
	expect(call('settle_commitment', args).failed).toBe(false);
	expect(call('settle_commitment', args).failed).toBe(false);
	const entries = call('commitment_entries', { commitment_id: id }).data.items as Record<
		string,
		unknown
	>[];
	expect(entries).toHaveLength(1);
	const entryId = entries[0].id;
	expect(
		call('delete_commitment_entry', { id: entryId }, { scopes: ['statements:write'] }).failed
	).toBe(true);
	expect(call('delete_commitment_entry', { id: entryId }).failed).toBe(false);
	const removed = listAssistantCalls(ctx, { limit: 1 })[0];
	expect(removed.tool).toBe('delete_commitment_entry');
	expect(removed.destroyed).toBe(true);
	expect(() => putBack({ ...ctx, userId: STRANGER }, removed.id)).toThrow();
	expect(putBack(ctx, removed.id).made).toMatch(/entry/i);
	const restored = call('commitment_entries', { commitment_id: id }).data.items as Record<
		string,
		unknown
	>[];
	expect(restored).toHaveLength(1);
	expect(restored[0]).toMatchObject({ amountMinor: -3000, transactionId: line.id });
	expect(() => putBack(ctx, removed.id)).toThrow();
});

test('notebook confinement cannot reach global stocks through a nested allocation or settlement', () => {
	const book = createNotebook(ctx, { title: 'Scoped finance', modules: 'ledgers' });
	const ledger = createLedger(ctx, {
		name: 'Scoped MCP account',
		currency: 'KES',
		notebookId: book
	});
	const line = recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-16',
		amountCents: -500,
		description: 'Scoped line'
	});
	const id = stock('Global stock');
	const options = { confinement: { kind: 'notebook', id: book } };
	expect(call('commitments', {}, options).failed).toBe(true);
	expect(
		call('settle_commitment', { commitment_id: id, transaction_id: line.id }, options).failed
	).toBe(true);
	expect(
		call(
			'split_movement',
			{ id: line.id, allocations: [{ kind: 'custody', amount_minor: -500, commitment_id: id }] },
			options
		).failed
	).toBe(true);
	expect(
		call(
			'split_movement',
			{
				id: line.id,
				allocations: [{ kind: 'personal', amount_minor: -500, category: 'Personal only' }]
			},
			options
		).failed
	).toBe(false);
});
