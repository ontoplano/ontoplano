import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasBillingProvider } from './helpers/billing.js';

/**
 * The provider has to be findable by a process Vite never built.
 *
 * `billing/index.ts` resolves the provider with `import.meta.glob`, which is
 * Vite's and does not exist under plain `tsx` — and `scripts/reconcile-billing`
 * is run under plain `tsx`, nightly, by a systemd timer. When the extraction
 * first landed, the glob threw there: the nightly pass over billing would have
 * stopped dead, or worse, found no provider and reported a clean night while
 * checking nothing. `billing/load.ts` is the answer and this is what pins it.
 *
 * A subprocess rather than an import, because the thing being tested is what
 * happens *outside* this runner: vitest is Vite, so in here the glob works and
 * the bug is invisible. The one way to see it is to leave.
 */
/** Run one module under tsx, outside Vite, and give back what it printed. */
function outsideVite(source: string): string {
	// A file rather than `--eval`: the source uses top-level await, and tsx only
	// allows that in something it can see is a module.
	const dir = mkdtempSync(join(tmpdir(), 'billing-'));
	const file = join(dir, 'probe.mts');
	try {
		writeFileSync(file, source);
		return execFileSync('npx', ['tsx', file], {
			cwd: process.cwd(),
			encoding: 'utf8',
			// The provider pulls the database in behind it, and this probe is about
			// resolution rather than data: an empty in-memory one is enough.
			env: {
				...process.env,
				DATABASE_URL: ':memory:',
				ONTOPLANO_SKIP_MIGRATION_CHECK: 'true'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		}).trim();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** The probe runs from a temp directory, so it names the module absolutely. */
const mod = (file: string) => join(process.cwd(), 'src/lib/server/billing', file);

describe('billing, outside a Vite build', () => {
	it('imports the resolver without throwing', () => {
		const out = outsideVite(
			`const m = await import(${JSON.stringify(mod('index.ts'))});
			 console.log(typeof m.provider());`
		);
		expect(out).toBe('object');
	});

	it.runIf(hasBillingProvider())('finds the provider on disk', () => {
		const out = outsideVite(
			`const { loadProvider } = await import(${JSON.stringify(mod('load.ts'))});
			 const { provider } = await import(${JSON.stringify(mod('index.ts'))});
			 console.log(await loadProvider(), provider().name);`
		);
		expect(out).toMatch(/^true \S+$/);
		expect(out).not.toContain('none');
	});

	it.runIf(!hasBillingProvider())('says so plainly when there is none', () => {
		const out = outsideVite(
			`const { loadProvider } = await import(${JSON.stringify(mod('load.ts'))});
			 const { provider } = await import(${JSON.stringify(mod('index.ts'))});
			 console.log(await loadProvider(), provider().name);`
		);
		expect(out).toBe('false none');
	});
});
