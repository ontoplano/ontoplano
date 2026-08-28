import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The scripts that run on the server must only import things that are there.
 *
 * `make deploy` installs with `--production` on purpose: the box has a couple
 * of gigabytes free and the dev tree is most of a gigabyte. So anything a
 * shipped script imports has to be a real dependency, not a devDependency that
 * happens to exist on the machine that built it.
 *
 * This failed in production exactly once, and silently until the migration ran:
 * `drizzle-orm` was a devDependency, the built app had it bundled in, and
 * `migrate.mjs` — which imports it at runtime — did not.
 */
const SHIPPED = ['scripts/migrate.mjs', 'scripts/db-snapshot.mjs', 'scripts/check-deps.mjs'];

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
};

/** Bare specifiers only — relative paths and node: builtins ship with the file. */
function packagesImportedBy(file: string): string[] {
	const source = readFileSync(file, 'utf8');
	const found = new Set<string>();
	for (const match of source.matchAll(/(?:^|\s)(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g)) {
		const spec = match[1];
		if (spec.startsWith('.') || spec.startsWith('node:')) continue;
		// `drizzle-orm/better-sqlite3/migrator` is the `drizzle-orm` package.
		found.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
	}
	return [...found];
}

describe('scripts that run on the server', () => {
	for (const file of SHIPPED) {
		it(`${file} imports only production dependencies`, () => {
			const imported = packagesImportedBy(file);

			for (const name of imported) {
				expect(
					pkg.dependencies[name],
					`${file} imports ${name}, which is not in "dependencies". ` +
						`\`yarn install --production\` on the server will not install it, and the ` +
						`deploy fails at the migration step with ERR_MODULE_NOT_FOUND.`
				).toBeDefined();
			}
		});
	}
});
