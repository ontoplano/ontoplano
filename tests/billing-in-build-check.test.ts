import { describe, it, expect } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `make _billing-in-build` on a tree with no payment provider.
 *
 * The check exists for builds that DO carry the provider — it catches Vite's
 * cache dropping the module. But every recipe line runs in its own shell, so
 * the old guard's `exit 0` only ended the guard's line, and a fresh clone —
 * which has no provider and never will — failed `make deploy-local` with
 * "the provider is in the tree and NOT in the build". This pins the fresh
 * clone's side: no provider in the tree, no verdict about the build.
 */
const ROOT = join(import.meta.dirname, '..');

/** A directory that looks like a checkout, as far as this target reads. */
function checkout(): string {
	const dir = mkdtempSync(join(tmpdir(), 'onto-billing-check-'));
	cpSync(join(ROOT, 'Makefile'), join(dir, 'Makefile'));
	cpSync(join(ROOT, 'defaults.env'), join(dir, 'defaults.env'));
	mkdirSync(join(dir, 'build', 'server'), { recursive: true });
	mkdirSync(join(dir, 'src/lib/server/billing/providers'), { recursive: true });
	return dir;
}

function run(dir: string): { status: number; out: string } {
	try {
		const out = execFileSync('make', ['-C', dir, '_billing-in-build'], {
			stdio: 'pipe',
			encoding: 'utf8'
		});
		return { status: 0, out };
	} catch (error) {
		const failed = error as { status?: number; stdout?: string; stderr?: string };
		return { status: failed.status ?? 1, out: `${failed.stdout ?? ''}${failed.stderr ?? ''}` };
	}
}

describe('make _billing-in-build', () => {
	it('passes on a fresh clone, where there is no provider to look for', () => {
		const dir = checkout();
		try {
			// A build made from that clone: real chunks, none of them the provider.
			writeFileSync(join(dir, 'build/server/index.js'), 'export const app = 1;\n');
			const { status, out } = run(dir);
			expect(out).not.toContain('NOT in the build');
			expect(status).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('still fails a build that dropped the provider it was given', () => {
		const dir = checkout();
		try {
			writeFileSync(join(dir, 'src/lib/server/billing/providers/paddle.ts'), 'export {};\n');
			writeFileSync(join(dir, 'build/server/index.js'), 'export const app = 1;\n');
			const { status, out } = run(dir);
			expect(status).not.toBe(0);
			expect(out).toContain('NOT in the build');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('and passes when the provider made it into the bundle', () => {
		const dir = checkout();
		try {
			writeFileSync(join(dir, 'src/lib/server/billing/providers/paddle.ts'), 'export {};\n');
			writeFileSync(
				join(dir, 'build/server/index.js'),
				'const providers = { "./providers/paddle.ts": 1 };\n'
			);
			const { status } = run(dir);
			expect(status).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
