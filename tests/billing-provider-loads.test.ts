import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The provider survives the build, and the build survives Node.
 *
 * `import.meta.glob` is Vite rewriting a call expression, not a function that
 * exists at run time. The resolver guarded it with
 * `typeof import.meta.glob === 'function'` so that a plain `tsx` script would
 * not call something undefined — and Vite replaced the call, left the
 * condition, and shipped a bundle that read:
 *
 *     typeof import.meta.glob === "function" ? { "./providers/paddle.ts": … } : {}
 *
 * false in Node. The provider was bundled, imported, and thrown away on every
 * production start. Nothing failed, nothing logged, and the instance decided it
 * had no way to take money — for a fortnight, while the file sat in the tree.
 *
 * This reads the source rather than the bundle, because the bundle is not
 * present in a plain checkout and this has to fail in CI: the shape to refuse
 * is a runtime test of anything Vite resolves at build time.
 */
describe('the billing resolver', () => {
	/*
	 * Comments out first — the file explains this failure at length, and the
	 * explanation contains the very shape being refused. A test that reads its
	 * own docblock is a test that fails on being documented.
	 */
	const source = readFileSync('src/lib/server/billing/index.ts', 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|\s)\/\/[^\n]*/g, '$1');

	test('does not decide at run time what Vite decided at build time', () => {
		expect(
			source,
			'a `typeof import.meta.glob` guard is always false in the built server'
		).not.toMatch(/typeof\s*\(?\s*import\.meta[^)]*\)?\s*\.?\s*glob/);
	});

	test('and still survives a script with no Vite at all', () => {
		// `tsx` reaches the same line and there is no glob to call, so the call
		// has to be inside something that catches. `load.ts` is how a script is
		// then told which provider to use.
		const glob = source.indexOf('import.meta.glob');
		const tryAt = source.lastIndexOf('try {', glob);
		expect(tryAt, 'the glob call is not guarded for a plain tsx run').toBeGreaterThan(0);
		expect(source.slice(tryAt, glob)).not.toContain('}');
	});
});
