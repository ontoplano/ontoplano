/**
 * A route the device compiles may not reach for the server.
 *
 * The isolated build compiles every ported route's server file into the
 * database worker, so those files run in a browser. One `import` of
 * `$lib/server/*` there drags in `node:os`, `node:fs` and `node:path`, and the
 * whole build stops compiling:
 *
 *     "homedir" is not exported by "__vite-browser-external"
 *
 * Which is a message about Rollup, several layers from the line that caused
 * it, and it arrives at the end of a five-minute build — or, worse, in the
 * phone app's build, long after the change. Anything a page needs from the
 * deployment comes through the host seam (`$lib/services/host.ts`), which is
 * what the seam is for: a device answers for itself.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const TABLE = 'src/lib/isolated/routes.ts';

/**
 * Every route file the device actually compiles.
 *
 * The table is two lists with different shapes. `pages` is a wildcard with
 * exclusions — every `+page.server.ts` except the screens that are about a
 * deployment — and `endpoints` is an enumeration. A third list, `notHere`, is
 * globbed `?url`: those never enter the bundle and may import whatever a
 * server has, so sweeping every quoted path would fail on files that are fine.
 */
function ported(): string[] {
	const table = readFileSync(TABLE, 'utf8');

	const listIn = (declaration: string): string[] => {
		const at = table.indexOf(declaration);
		expect(at, `${TABLE} no longer declares ${declaration.trim()}`).toBeGreaterThan(-1);
		const block = table.slice(at, table.indexOf('}\n)', at));
		return [...block.matchAll(/'(![^']+|\/src\/routes\/[^']+)'/g)].map((m) => m[1]);
	};

	const patterns = [
		...listIn('const pages = import.meta.glob('),
		...listIn('const endpoints = import.meta.glob(')
	];
	const excluded = patterns
		.filter((p) => p.startsWith('!'))
		.map((p) => p.slice(2).replace(/\*\*$/, ''));
	const named = patterns
		.filter((p) => !p.startsWith('!') && !p.includes('*'))
		.map((p) => p.slice(1));

	/** Every server file under the routes, which is what the wildcard covers. */
	const all: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.name === '+page.server.ts') all.push(path);
		}
	};
	walk('src/routes');

	const wild = all.filter((path) => !excluded.some((prefix) => path.startsWith(prefix)));
	return [...new Set([...wild, ...named])];
}

describe('a route that runs on the device', () => {
	test('there are some, and they are read from the table', () => {
		// A regex that matched nothing would make every assertion below pass.
		expect(ported().length).toBeGreaterThan(10);
	});

	test('never imports from $lib/server', () => {
		const reaching: string[] = [];
		for (const path of ported()) {
			let source: string;
			try {
				source = readFileSync(path, 'utf8');
			} catch {
				// The table names a file that is gone: a different test's problem.
				continue;
			}
			if (/from\s+'\$lib\/server\//.test(source)) reaching.push(path);
		}
		expect(reaching, `these are compiled into the worker and reach for the server`).toEqual([]);
	});
});
