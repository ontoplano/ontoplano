/**
 * Can the scheduled jobs run where they are deployed?
 *
 * The box installs `yarn install --production`, so the deployed tree has
 * `dependencies` and none of `devDependencies`. The jobs are TypeScript run by
 * `tsx`, which resolves imports at runtime — so a service that reaches for a
 * dev-only package fails there and nowhere else. Twice now: first
 * `drizzle-orm` (the unit ran in a directory with no modules at all), then
 * `@sveltejs/kit`, imported by `services/errors.ts` for `fail()`, which every
 * service imports for its error classes.
 *
 * Neither was visible in this repo, where every package is installed. So this
 * walks the import graph of each job the way tsx will, and asks of every bare
 * specifier: is it a real dependency, or only a development one?
 *
 *   node scripts/check-job-deps.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const prod = new Set(Object.keys(pkg.dependencies ?? {}));
const dev = new Set(Object.keys(pkg.devDependencies ?? {}));

/** The systemd units run these. One line each in ontoplano-server/systemd. */
const JOBS = [
	'scripts/deliver-reminders.ts',
	'scripts/weekly-reviews.ts',
	'scripts/reconcile-billing.ts'
];

/** `@scope/name/deep` → `@scope/name`; `pkg/deep` → `pkg`. */
const packageOf = (spec) =>
	spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];

/**
 * Comments out, first.
 *
 * The files here explain themselves at length, and prose contains the word
 * "from" followed by a quote often enough that scanning the raw text reported
 * a package called `I swapped today` — out of a sentence about swapping a gym
 * slot for a run. Naive on purpose: it only has to be right about import
 * lines, and an import specifier never contains a comment.
 */
function withoutComments(source) {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

/**
 * The static imports and the dynamic ones, kept apart.
 *
 * A static `import … from 'x'` is resolved before a line of the module runs and
 * cannot be caught, so a missing `x` is fatal. `await import('x')` can be, and
 * where it is, it is a deliberate probe: `db/index.ts` asks for
 * `$app/environment` inside a try, precisely so that a script without Vite gets
 * a "no" rather than a crash. So dynamic imports are followed and never
 * complained about — the author has already handled the answer.
 */
function importsIn(source) {
	const statics = [];
	const dynamics = [];
	for (const m of source.matchAll(/from\s*['"]([^'"]+)['"]/g)) statics.push(m[1]);
	for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) dynamics.push(m[1]);
	// `import 'x'` for its side effects is static too.
	for (const m of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) statics.push(m[1]);
	return { statics, dynamics };
}

/**
 * Type-only imports are erased before anything is resolved, so a `import type`
 * of a dev package is not a runtime dependency. Read literally, per line,
 * because that is exactly how much of TypeScript this needs to understand.
 */
function runtimeImports(source) {
	const typeOnly = new Set();
	for (const m of source.matchAll(/import\s+type[^'"]*['"]([^'"]+)['"]/g)) typeOnly.add(m[1]);
	const { statics, dynamics } = importsIn(source);
	return {
		statics: statics.filter((spec) => !typeOnly.has(spec)),
		dynamics
	};
}

const seen = new Set();
const problems = [];

function walk(file, from) {
	const path = resolve(file);
	if (seen.has(path)) return;
	seen.add(path);
	if (!existsSync(path)) return;

	const { statics, dynamics } = runtimeImports(withoutComments(readFileSync(path, 'utf8')));
	for (const spec of [...statics, ...dynamics]) {
		const fatal = statics.includes(spec);
		if (spec.startsWith('.')) {
			// `./x.js` in TypeScript source is `./x.ts` on disk.
			const target = join(dirname(path), spec.replace(/\.js$/, '.ts'));
			if (existsSync(target)) walk(target, path);
			else if (existsSync(`${target}/index.ts`)) walk(`${target}/index.ts`, path);
			continue;
		}
		if (spec.startsWith('node:')) continue;

		// `$lib/x` is this repository's own alias for `src/lib/x`, and tsx
		// follows it through tsconfig. Walked like a relative import.
		if (spec.startsWith('$lib/')) {
			const target = resolve('src/lib', spec.slice(5).replace(/\.js$/, '.ts'));
			if (existsSync(target)) walk(target, path);
			else if (existsSync(`${target}/index.ts`)) walk(`${target}/index.ts`, path);
			continue;
		}

		// `$app/…` and `$env/…` are Vite's, invented during a build. Nothing
		// under `tsx` can resolve them, so a job that reaches one is broken on
		// the box however well it runs here.
		if (spec.startsWith('$app/') || spec.startsWith('$env/')) {
			if (fatal) {
				problems.push(
					`${spec} — a Vite virtual module, imported by ${path.replace(`${process.cwd()}/`, '')} (from ${from})`
				);
			}
			continue;
		}

		const name = packageOf(spec);
		if (prod.has(name)) continue;

		if (!fatal) continue;

		const where = path.replace(`${process.cwd()}/`, '');
		problems.push(
			dev.has(name)
				? `${name} — a devDependency, imported by ${where} (from ${from})`
				: // In neither list: it resolves here because something else pulled
					// it into node_modules, and a production install has no reason to.
					`${name} — declared nowhere, imported by ${where} (from ${from})`
		);
	}
}

for (const job of JOBS) walk(job, 'the unit');

if (problems.length === 0) {
	console.log(`jobs: ${JOBS.length} scheduled scripts, every import a real dependency`);
	process.exit(0);
}

console.error('These jobs import development-only packages, and will fail on the box:\n');
for (const problem of [...new Set(problems)]) console.error(`  ${problem}`);
console.error('\nMove what the job needs out of the module that reaches for it, or make the');
console.error('package a real dependency. `yarn install --production` is what runs there.');
process.exit(1);
