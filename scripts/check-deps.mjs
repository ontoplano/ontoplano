/**
 * Can this directory load everything its package.json calls a dependency?
 *
 * Runs on the server, after `yarn install --production`, before anything that
 * needs those packages. It exists because of one failed deploy whose symptom
 * was ERR_MODULE_NOT_FOUND at the migration step — which reads like a broken
 * script and was actually a stale manifest: the server was holding an older
 * package.json than the one the deploy thought it had just sent.
 *
 * Two ways that happens, and both are silent:
 *
 * - rsync decides by size and mtime, and moving one line of package.json
 *   between two objects can leave the file exactly the same size.
 * - yarn trusts `.yarn-integrity` over what is on disk, so after a package
 *   moves between dependencies and devDependencies it says "Already
 *   up-to-date" in half a second and leaves node_modules as it was.
 *
 * Prints what is missing and how many dependencies this manifest declares, so
 * the number can be compared with the one on the machine that deployed.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const declared = Object.keys(pkg.dependencies ?? {});

const missing = declared.filter((name) => {
	try {
		require.resolve(name);
		return false;
	} catch {
		return true;
	}
});

console.log(`${declared.length} dependencies declared, ${missing.length} missing`);

if (missing.length > 0) {
	console.log(`missing: ${missing.join(' ')}`);
	process.exit(1);
}
