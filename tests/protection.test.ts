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

/** A full local timestamp some milliseconds ago — it may cross midnight. */
function ago(ms: number): string {
	const d = new Date(Date.now() - ms);
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	);
}

describe('what the box blocked', () => {
	it('is honest about a log it cannot read', async () => {
		const out = await read(null);
		expect(out.readable).toBe(false);
		expect(out.recent).toEqual([]);
		// Not "0 blocked": the page says something else entirely for this.
		expect(out.lastDay).toBe(0);
	});

	it('says how many times an address has been back', async () => {
		/*
		 * The list shows the last handful of bans. Without a count, an address on
		 * its fourth visit is indistinguishable from one on its first — and the
		 * two want different buttons pressed.
		 */
		const out = await read(
			[
				line(today('08:00:00'), 'ontoplano-web', 'Ban', '203.0.113.4'),
				line(today('08:30:00'), 'ontoplano-web', 'Unban', '203.0.113.4'),
				line(today('09:00:00'), 'ontoplano-web', 'Ban', '203.0.113.4'),
				line(today('09:30:00'), 'ontoplano-web', 'Unban', '203.0.113.4'),
				line(today('10:00:00'), 'ontoplano-web', 'Ban', '203.0.113.4'),
				line(today('10:05:00'), 'sshd', 'Ban', '198.51.100.7'),
				''
			].join('\n')
		);

		const persistent = out.recent.find((b) => b.address === '203.0.113.4')!;
		const passing = out.recent.find((b) => b.address === '198.51.100.7')!;

		expect(persistent.times).toBe(3);
		// Every row for that address carries the same count, not a running one:
		// the question is "how often has this address been here", not "which of
		// its visits is this".
		expect(out.recent.filter((b) => b.address === '203.0.113.4').every((b) => b.times === 3)).toBe(
			true
		);
		expect(passing.times).toBe(1);
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

	it('counts the last 24 hours, not the whole log', async () => {
		const out = await read(
			[
				line('2020-01-01 09:00:00', 'ontoplano-web', 'Ban', '203.0.113.1'),
				line(ago(60 * 60 * 1000), 'ontoplano-web', 'Ban', '203.0.113.2'),
				line(ago(30 * 60 * 1000), 'sshd', 'Ban', '2001:db8::1'),
				''
			].join('\n')
		);

		expect(out.lastDay).toBe(2);
		expect(out.recent).toHaveLength(3);
	});

	it('counts a ban made minutes ago even when midnight has passed since', async () => {
		// The bug this guards: "0 addresses blocked today" printed above a row
		// saying "just now", because the count started at midnight and the ban
		// did not. A rolling day cannot have that seam — this timestamp lands
		// on yesterday's date whenever the test runs before 00:10.
		const out = await read(line(ago(10 * 60 * 1000), 'ontoplano-web', 'Ban', '203.0.113.4') + '\n');
		expect(out.lastDay).toBe(1);
	});

	it('counts addresses, not ban lines', async () => {
		// One scanner rebanned every half hour is still one scanner.
		const out = await read(
			[
				line(ago(90 * 60 * 1000), 'ontoplano-web', 'Ban', '203.0.113.4'),
				line(ago(30 * 60 * 1000), 'ontoplano-web', 'Ban', '203.0.113.4'),
				''
			].join('\n')
		);
		expect(out.lastDay).toBe(1);
	});

	it('says what each address did, not which jail it tripped', async () => {
		const out = await read(
			[
				line(ago(60_000), 'sshd', 'Ban', '198.51.100.2'),
				line(ago(30_000), 'made-up-jail', 'Ban', '203.0.113.9'),
				''
			].join('\n')
		);
		expect(out.recent[0].reason).toBe('tripped the made-up-jail jail');
		expect(out.recent[1].reason).toContain('SSH');
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

/**
 * Letting somebody back in, and keeping somebody out.
 *
 * The app runs as an unprivileged user and fail2ban does not, so these buttons
 * cross a privilege boundary through one root helper with a wildcard-free
 * sudoers rule. The rules that make that safe are: nothing goes through a
 * shell, and an instance that has not been set up for it offers no buttons at
 * all rather than buttons that fail.
 */
describe('the buttons beside a ban', () => {
	const original = process.env.ONTOPLANO_BAN_CONTROL;

	afterEach(() => {
		if (original === undefined) delete process.env.ONTOPLANO_BAN_CONTROL;
		else process.env.ONTOPLANO_BAN_CONTROL = original;
	});

	async function load() {
		return import('../src/lib/server/services/protection.js');
	}

	it('are absent on an instance that has not been set up for them', async () => {
		delete process.env.ONTOPLANO_BAN_CONTROL;
		const protection = await load();

		expect(protection.banControlEnabled()).toBe(false);
		// The page shows the bans and no buttons, rather than buttons that fail.
		expect(protection.permanentlyBlocked()).toEqual([]);
	});

	it('refuse to run at all when they are not enabled', async () => {
		delete process.env.ONTOPLANO_BAN_CONTROL;
		const protection = await load();

		// Not merely hidden: the action itself refuses, so a posted form cannot
		// reach the helper by skipping the page.
		expect(() => protection.unban('sshd', '203.0.113.9')).toThrow(/not enabled/);
		expect(() => protection.blockForever('203.0.113.9')).toThrow(/not enabled/);
		expect(() => protection.unblockForever('203.0.113.9')).toThrow(/not enabled/);
	});

	it('are off unless the box says exactly so', async () => {
		const protection = await load();
		for (const value of ['', 'false', '1', 'yes', 'TRUE']) {
			process.env.ONTOPLANO_BAN_CONTROL = value;
			expect(protection.banControlEnabled(), value).toBe(false);
		}

		process.env.ONTOPLANO_BAN_CONTROL = 'true';
		expect(protection.banControlEnabled()).toBe(true);
	});
});
