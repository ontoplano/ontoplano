/**
 * What the chat may do is the account's answer, not the route's.
 *
 * It shipped with `destructive` left out in code and "never deleting" written
 * into the docs, which made the permission the app already has a lie in one
 * place. The grant is off until somebody ticks it, and ticking it has to reach
 * the dispatcher — both halves are here, because either one alone is the bug.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let chatScopes: typeof import('../src/lib/server/services/assistant-chat').chatScopes;
let setChatMayDelete: typeof import('../src/lib/services/settings').setChatMayDelete;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let visibleTools: typeof import('../src/lib/server/mcp/protocol').visibleTools;

beforeAll(async () => {
	({ chatScopes } = await import('../src/lib/server/services/assistant-chat'));
	({ setChatMayDelete } = await import('../src/lib/services/settings'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ visibleTools } = await import('../src/lib/server/mcp/protocol'));
});

const ctx = (user = OWNER) => buildCtx(user, { tz: 'UTC', now: new Date('2026-09-22T10:00:00Z') });

/** A tool that removes a row for good, whatever it is called this year. */
const deleting = (scopes: readonly string[]) =>
	visibleTools({ ctx: ctx(), scopes }).filter((t) => t.annotations.destructiveHint);

describe('the deleting grant', () => {
	it('is off until somebody says otherwise', () => {
		expect(chatScopes(ctx())).not.toContain('destructive');
		expect(deleting(chatScopes(ctx()))).toHaveLength(0);
	});

	it('reaches the dispatcher once it is ticked', () => {
		setChatMayDelete(OWNER, true);
		expect(chatScopes(ctx())).toContain('destructive');
		// Not merely present in a list: the tools that delete are offered now.
		expect(deleting(chatScopes(ctx())).length).toBeGreaterThan(0);
	});

	it('can be taken back', () => {
		setChatMayDelete(OWNER, true);
		setChatMayDelete(OWNER, false);
		expect(chatScopes(ctx())).not.toContain('destructive');
	});

	it('is one account at a time', () => {
		setChatMayDelete(OWNER, true);
		expect(chatScopes(ctx(STRANGER))).not.toContain('destructive');
	});

	it('still offers everything an assistant reads and writes', () => {
		setChatMayDelete(OWNER, false);
		const scopes = chatScopes(ctx());
		expect(scopes).toContain('tasks:write');
		expect(scopes).toContain('today:read');
	});
});
