import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Reading what fail2ban blocked.
 *
 * Every case here is one the administration page renders differently, and two
 * of them are the ones that matter: an unreadable log must not look like a
 * quiet night, and a log this process cannot open must not take the page down
 * with it.
 *
 * The module reads the path from the environment when it is imported, so each
 * test imports it fresh — `vi.resetModules` plus a dynamic import, rather than
 * a static one that would bind to whatever the first test set.
 */
const dir = mkdtempSync(join(tmpdir(), 'ontoplano-f2b-'));
afterEach(() => {
	delete process.env.ONTOPLANO_FAIL2BAN_LOG;
});
afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 2 }));

async function read(contents: string | null, limit?: number) {
	const path = join(dir, `log-${Math.random().toString(36).slice(2)}`);
	if (contents !== null) writeFileSync(path, contents);
	process.env.ONTOPLANO_FAIL2BAN_LOG = path;
	const { resetModules } = await import('vitest').then((m) => ({
		resetModules: m.vi.resetModules
	}));
	resetModules();
	const mod = await import('../src/lib/server/services/protection');
	return mod.protection(limit);
}

/** The log's own format: local time, the jail in brackets, then the verb. */
function line(at: string, jail: string, action: string, address: string): string {
	return `${at},123 fail2ban.actions        [1234]: NOTICE  [${jail}] ${action} ${address}`;
}

function today(time: string): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
}

describe('what the box blocked', () => {
	it('is honest about a log it cannot read', async () => {
		const out = await read(null);
		expect(out.readable).toBe(false);
		expect(out.recent).toEqual([]);
		// Not "0 blocked today": the page says something else entirely for this.
		expect(out.today).toBe(0);
	});

	it('reads bans, and only bans', async () => {
		const out = await read(
			[
				line(today('09:00:00'), 'ontoplano-web', 'Ban', '203.0.113.4'),
				line(today('09:05:00'), 'sshd', 'Ban', '198.51.100.7'),
				line(today('09:10:00'), 'ontoplano-web', 'Unban', '203.0.113.4'),
				`${today('09:11:00')},1 fail2ban.filter [1]: INFO    [sshd] Found 198.51.100.7`,
				''
			].join('\n')
		);

		expect(out.readable).toBe(true);
		expect(out.recent.map((b) => b.address)).toEqual(['198.51.100.7', '203.0.113.4']);
		expect(out.recent[0].jail).toBe('sshd');
	});

	it('counts today, not the whole log', async () => {
		const out = await read(
			[
				line('2020-01-01 09:00:00', 'ontoplano-web', 'Ban', '203.0.113.1'),
				line(today('09:00:00'), 'ontoplano-web', 'Ban', '203.0.113.2'),
				line(today('10:00:00'), 'sshd', 'Ban', '2001:db8::1'),
				''
			].join('\n')
		);

		expect(out.today).toBe(2);
		expect(out.recent).toHaveLength(3);
	});

	it('shows the newest first, and no more than asked for', async () => {
		const many = Array.from({ length: 30 }, (_, i) =>
			line(today(`10:${String(i).padStart(2, '0')}:00`), 'ontoplano-web', 'Ban', `203.0.113.${i}`)
		);
		const out = await read(many.join('\n') + '\n', 5);

		expect(out.recent).toHaveLength(5);
		expect(out.recent[0].address).toBe('203.0.113.29');
		expect(out.recent[4].address).toBe('203.0.113.25');
	});

	it('keeps its head when the tail starts mid-line', async () => {
		// What a rotated or truncated read looks like: a partial line first.
		const out = await read(
			`4]: NOTICE  [ontoplano-web] Ban 203.0.113.9\n${line(today('11:00:00'), 'sshd', 'Ban', '198.51.100.2')}\n`
		);

		expect(out.recent.map((b) => b.address)).toEqual(['198.51.100.2']);
	});
});
