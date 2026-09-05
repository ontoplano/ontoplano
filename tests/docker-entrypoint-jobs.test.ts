import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The container's own clock, run against a stub of the app.
 *
 * The image has no systemd, so `docker-entrypoint.sh` is what makes reminders
 * and the weekly review mail exist there — a background loop asking the job
 * endpoints with the health token. This runs the real script (with a stub
 * standing where the app would listen) and checks the loop actually knocks on
 * both doors, with the right token. The 15-second grace the script gives the
 * app to come up is why this test carries a long timeout.
 */
const ROOT = join(import.meta.dirname, '..');

const TOKEN = 'entrypoint-test-token';

describe('the docker entrypoint', () => {
	let dir: string;
	let stub: Server;
	let port: number;
	let child: ChildProcess | undefined;
	const asked: { path: string; token: string | undefined }[] = [];

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'onto-entrypoint-'));
		stub = createServer((req, res) => {
			asked.push({ path: req.url ?? '', token: req.headers['x-health-token'] as string });
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ ok: true, pushed: 0, sent: 0 }));
		});
		await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
		const address = stub.address();
		port = typeof address === 'object' && address ? address.port : 0;
	});

	afterAll(() => {
		if (child?.pid) {
			try {
				process.kill(-child.pid, 'SIGKILL');
			} catch {
				/* already gone */
			}
		}
		stub.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('asks both job endpoints, carrying the health token', { timeout: 40_000 }, async () => {
		child = spawn('sh', [join(ROOT, 'docker-entrypoint.sh'), 'sleep', '60'], {
			cwd: ROOT,
			// Its own process group, so the background loop dies with the test.
			detached: true,
			stdio: 'pipe',
			env: {
				...process.env,
				BETTER_AUTH_SECRET: 'entrypoint-test-secret',
				DATABASE_URL: join(dir, 'entrypoint.db'),
				PORT: String(port),
				ONTOPLANO_HEALTH_TOKEN: TOKEN
			}
		});

		// The migration ran, the loop slept its grace period, the first tick
		// asks both jobs (the hourly one fires on tick zero).
		const deadline = Date.now() + 35_000;
		while (Date.now() < deadline) {
			if (
				asked.some((a) => a.path === '/api/jobs/reminders') &&
				asked.some((a) => a.path === '/api/jobs/weekly-reviews')
			)
				break;
			await new Promise((resolve) => setTimeout(resolve, 250));
		}

		expect(asked.map((a) => a.path)).toContain('/api/jobs/reminders');
		expect(asked.map((a) => a.path)).toContain('/api/jobs/weekly-reviews');
		for (const ask of asked) expect(ask.token).toBe(TOKEN);
	});
});
