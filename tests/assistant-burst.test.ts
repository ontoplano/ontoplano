import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

/**
 * The sweep that turns a burst of assistant writes into one notification.
 *
 * Three things have to hold. A burst that is still going is left alone, so a
 * long instruction is one notification rather than one a minute while it runs.
 * A burst that has gone quiet is said once and never again. And one account's
 * writes never reach another account's devices, which is the one that would
 * matter.
 *
 * The push itself is mocked: what is under test is which accounts get told
 * what, not whether `web-push` can reach a browser.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const pushes: { userId: string; title: string; body?: string }[] = [];

vi.mock('../src/lib/server/services/push.js', () => ({
	pushToUser: async (userId: string, payload: { title: string; body?: string }) => {
		pushes.push({ userId, ...payload });
		return { sent: 1, failed: [] };
	}
}));

let notify: typeof import('../src/lib/server/services/assistant-notify');
let log: typeof import('../src/lib/server/services/assistant-log');
let ctxFor: (id: string) => { userId: string };

/** A write, recorded as the MCP layer records one. */
function wrote(userId: string, tool: string) {
	log.recordAssistantCall(ctxFor(userId) as never, {
		tool,
		args: {},
		before: null,
		destroyed: false
	});
}

/** Move every recorded call back in time, so the burst counts as over. */
function ageEverything(seconds: number) {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const Database = require('better-sqlite3');
	const db = new Database(database.path);
	db.prepare(`update assistant_calls set created_at = datetime(created_at, ?)`).run(
		`-${seconds} seconds`
	);
	db.close();
}

beforeAll(async () => {
	notify = await import('../src/lib/server/services/assistant-notify');
	log = await import('../src/lib/server/services/assistant-log');
	const { buildCtx } = await import('../src/lib/services/ctx');
	ctxFor = (id: string) => buildCtx(id) as unknown as { userId: string };
}, 60_000);

describe('a burst of writes', () => {
	test('is not said while it is still going', async () => {
		wrote(OWNER, 'add_task');
		wrote(OWNER, 'add_task');

		const result = await notify.notifyAssistantBursts();
		expect(result.waiting).toBe(1);
		expect(result.busy, 'a burst written a moment ago was said too early').toBe(1);
		expect(pushes).toEqual([]);
	});

	test('is said once when it goes quiet', async () => {
		ageEverything(notify.BURST_QUIET_SECONDS + 5);

		const first = await notify.notifyAssistantBursts();
		expect(first.pushed).toBe(1);
		expect(pushes).toHaveLength(1);
		expect(pushes[0].userId).toBe(OWNER);
		expect(pushes[0].title).toMatch(/2 tasks/);
	});

	test('and not again on the next sweep', async () => {
		const again = await notify.notifyAssistantBursts();
		expect(again.waiting, 'the same burst was still pending').toBe(0);
		expect(pushes).toHaveLength(1);
	});

	test('a later burst is its own notification', async () => {
		wrote(OWNER, 'write_entry');
		ageEverything(notify.BURST_QUIET_SECONDS + 5);

		await notify.notifyAssistantBursts();
		expect(pushes).toHaveLength(2);
		expect(pushes[1].title).toMatch(/1 entry/);
	});
});

describe('and nobody else', () => {
	test("one account's writes never reach another account", async () => {
		pushes.length = 0;
		wrote(STRANGER, 'add_task');
		wrote(STRANGER, 'finish_block');
		ageEverything(notify.BURST_QUIET_SECONDS + 5);

		await notify.notifyAssistantBursts();
		expect(pushes.map((p) => p.userId)).toEqual([STRANGER]);
	});

	test('and switching them off stops them without stopping the log', async () => {
		const { setUserSetting } = await import('../src/lib/server/settings');
		setUserSetting(OWNER, notify.ASSISTANT_PUSH_KEY, 'off');
		pushes.length = 0;

		wrote(OWNER, 'add_task');
		ageEverything(notify.BURST_QUIET_SECONDS + 5);
		const result = await notify.notifyAssistantBursts();

		expect(result.muted).toBe(1);
		expect(pushes).toEqual([]);
		// The write is still in the log, which is the record rather than the
		// telling: turning the notification off is not turning off the history.
		const rows = log.listAssistantCalls(ctxFor(OWNER) as never, { limit: 50 });
		expect(rows.some((r) => r.tool === 'add_task')).toBe(true);
	});
});
