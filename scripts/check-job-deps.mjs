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
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const prod = new Set(Object.keys(pkg.dependencies ?? {}));
const dev = new Set(Object.keys(pkg.devDependencies ?? {}));

/** What scheduled jobs and operators run by hand outside the built app. */
const JOBS = [
	'scripts/deliver-reminders.ts',
	'scripts/weekly-reviews.ts',
	'scripts/reconcile-billing.ts'
];

/**
 * The file an import means, or null.
 *
 * `existsSync` is true for a directory, so `$lib/server/db` — a folder with an
 * `index.ts` in it — resolved to the folder, and reading it threw EISDIR and
 * took the whole check down with a stack trace. A directory is not a module;
 * the module is the index inside it.
 */
/** @param {string} target */
const moduleAt = (target) => {
	if (existsSync(target) && statSync(target).isFile()) return target;
	if (existsSync(`${target}/index.ts`)) return `${target}/index.ts`;
	return null;
};

/** `@scope/name/deep` → `@scope/name`; `pkg/deep` → `pkg`. */
/** @param {string} spec */
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
 *
 * @param {string} source
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
 *
 * @param {string} source
 */
export function importsIn(source) {
	const statics = [];
	const dynamics = [];
	/*
	 * `from` has to be a word of its own, not the end of one and not inside a
	 * string.
	 *
	 * This matched the bare word anywhere, so a tool with arguments called
	 * `from` and `to` — `day(args.from, 'from')` — read as an import of
	 * everything between that quote and the next: the checker reported a
	 * package named `), day(args.to,` and failed the build over it.
	 *
	 * Naming what may precede a `from` was the first answer, and it was not
	 * enough: a generated catalogue holds `'A file downloaded from'`, where the
	 * word is preceded by a space and followed by a quote, and the build failed
	 * over a package named `,\n\t`. So the statement is matched from its start
	 * instead — a real one begins with `import` or `export`, and the run to the
	 * `from` cannot cross a quote, which is what keeps it out of prose.
	 */
	for (const m of source.matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/gm))
		statics.push(m[1]);
	for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) dynamics.push(m[1]);
	// `import 'x'` for its side effects is static too.
	for (const m of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) statics.push(m[1]);
	return { statics, dynamics };
}

/**
 * Exported for `tests/job-deps-reads-imports.test.ts`: what counts as an
 * import is the whole of this file's cleverness, and it got it wrong.
 *
 * Type-only imports are erased before anything is resolved, so a `import type`
 * of a dev package is not a runtime dependency. Read literally, per line,
 * because that is exactly how much of TypeScript this needs to understand.
 *
 * @param {string} source
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
/** @type {string[]} */
const problems = [];

/**
 * @param {string} file
 * @param {string} from
 */
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
			const target = moduleAt(join(dirname(path), spec.replace(/\.js$/, '.ts')));
			if (target) walk(target, path);
			continue;
		}
		if (spec.startsWith('node:')) continue;

		// `$lib/x` is this repository's own alias for `src/lib/x`, and tsx
		// follows it through tsconfig. Walked like a relative import.
		if (spec.startsWith('$lib/')) {
			const target = moduleAt(resolve('src/lib', spec.slice(5).replace(/\.js$/, '.ts')));
			if (target) walk(target, path);
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

/*
 * Run when run, stay quiet when imported.
 *
 * The scanner above is the whole of this file's cleverness, and it got the
 * simplest thing wrong — so it is unit-tested, which means this module gets
 * imported. Without this guard the import runs the check and calls
 * `process.exit`, taking the test runner with it.
 */
const RUN_DIRECTLY = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (RUN_DIRECTLY) check();

function check() {
	for (const job of JOBS) walk(job, 'the unit');

	/*
	 * And does the job open a database before it asks one anything?
	 *
	 * The services read a binding rather than a connection — the same code has to
	 * run against the server's SQLite and against the copy in a browser — and
	 * `$lib/server/db` is what binds the server's. A job that imports a service
	 * without it dies on its first query with "No database is bound to this
	 * runtime", at one minute past whatever, in a timer nobody is watching.
	 * Reminders and the weekly review mail both did, and the way it was found was
	 * a shell test in another repository rather than anything here.
	 *
	 * A direct import in every job, rather than trusting that some service in the
	 * graph happens to pull it in: `reconcile-billing.ts` worked purely because
	 * the billing loader did, which is not a property anybody was maintaining.
	 */
	const BINDS_A_DATABASE = 'src/lib/server/db/index.js';
	for (const job of JOBS) {
		const source = readFileSync(job, 'utf8');
		if (!source.includes(BINDS_A_DATABASE))
			problems.push(
				`${job} — imports no database. Add \`import '../${BINDS_A_DATABASE}';\` first, ` +
					`for its side effect: opening the server database is what binds one.`
			);
	}

	if (problems.length === 0) {
		console.log(
			`jobs: ${JOBS.length} scheduled scripts, every import a real dependency, each with a database`
		);
		process.exit(0);
	}

	console.error('These jobs will fail on the box:\n');
	for (const problem of [...new Set(problems)]) console.error(`  ${problem}`);
	console.error('\nFor a package: move what the job needs out of the module that reaches for it,');
	console.error('or make the package a real dependency — `yarn install --production` is what');
	console.error('runs there. For a database: import it first, before any service.');
	process.exit(1);
}
