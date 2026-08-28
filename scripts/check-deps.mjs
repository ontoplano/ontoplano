/**
 * Can this directory load what it is about to run?
 *
 * Runs on the server after `yarn install --production`, before anything that
 * needs those packages. Two deploys failed here, each looking like the other:
 *
 * 1. A dependency that was not installed at all, because the server held an
 *    older package.json than the deploy thought it had sent.
 * 2. A dependency that was installed and still could not load, because
 *    `better-sqlite3` is a native module compiled for one Node ABI. A tree
 *    built under Node 20 has `lib/binding/node-v115-linux-x64`, and Node 22
 *    looks for `node-v127` and finds nothing.
 *
 * The second is why this does two different checks. `require.resolve` finds the
 * package's entry file and never opens it, so it is blind to exactly the case
 * where a package is present and unusable. Actually importing is the only way
 * to know — but importing everything is wrong too, since some dependencies here
 * are browser code that has no business being loaded in Node.
 *
 * So: resolve everything declared, and *load* what the scripts in this
 * directory actually import. Breadth where it is cheap, depth where it matters.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const declared = Object.keys(pkg.dependencies ?? {});

/** Bare specifiers imported by the scripts that ship alongside this one. */
function neededByScripts() {
	const needed = new Set();
	for (const file of readdirSync(here).filter((f) => f.endsWith('.mjs'))) {
		const source = readFileSync(join(here, file), 'utf8');
		for (const m of source.matchAll(/(?:^|\s)import[^'"]*from\s*['"]([^'"]+)['"]/g)) {
			const spec = m[1];
			if (spec.startsWith('.') || spec.startsWith('node:')) continue;
			needed.add(spec);
		}
	}
	return [...needed];
}

const missing = declared.filter((name) => {
	try {
		require.resolve(name);
		return false;
	} catch {
		return true;
	}
});

/**
 * Importing is still not enough for a native module.
 *
 * `better-sqlite3` loads its `.node` binding when a Database is constructed,
 * not when the module is imported — which is why the failed deploy got all the
 * way to `new Database(...)` inside the snapshot before saying anything. So the
 * one native dependency here gets the smallest thing that touches its binding.
 */
const SMOKE = {
	'better-sqlite3': async (mod) => {
		const db = new mod.default(':memory:');
		db.close();
	}
};

const broken = [];
for (const spec of neededByScripts()) {
	try {
		const mod = await import(spec);
		await SMOKE[spec]?.(mod);
	} catch (error) {
		broken.push(`${spec}: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
	}
}

console.log(
	`${declared.length} dependencies declared, ${missing.length} missing, ${broken.length} unloadable`
);
if (missing.length > 0) console.log(`missing: ${missing.join(' ')}`);
for (const line of broken) console.log(`cannot load ${line}`);

if (missing.length > 0 || broken.length > 0) process.exit(1);
