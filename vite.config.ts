import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * What is actually running, baked in at build time.
 *
 * Baked rather than read from a file at runtime, because the question this
 * answers is "is what is deployed the thing I think I deployed" — and a build
 * that carries its own version cannot disagree with itself. A file beside the
 * bundle could be stale, missing, or from the previous deploy.
 *
 * The commit is best-effort: a build from a tarball, or in a container without
 * the git directory, has no repository to ask, and that is not a reason to fail
 * a build.
 */
function git(command: string): string {
	try {
		return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return 'unknown';
	}
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const commit = git('git rev-parse --short HEAD');
const dirty = git('git status --porcelain') !== '' ? '+' : '';

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		// A trailing "+" means the build had uncommitted changes in it, which is
		// worth knowing when a deployed version does not behave like the tag.
		__APP_COMMIT__: JSON.stringify(commit === 'unknown' ? commit : commit + dirty),
		__APP_BUILT_AT__: JSON.stringify(new Date().toISOString())
	},
	plugins: [tailwindcss(), sveltekit()],
	server: {
		/**
		 * Listen on every address, not just `localhost`.
		 *
		 * Vite's default binds to `localhost`, which Node may resolve to
		 * `127.0.0.1` alone — while a browser asking for a name like
		 * `ontoplano.localhost` may pick `::1`. Nothing is listening there, so the
		 * connection is refused: intermittently, because which address wins depends
		 * on the resolver's mood. It looks exactly like the server having crashed,
		 * and it is one of the few ways to get `NS_ERROR_CONNECTION_REFUSED` with a
		 * perfectly healthy process and an empty log.
		 */
		host: true,
		/**
		 * And say so rather than silently moving.
		 *
		 * Without this Vite picks the next free port when 5173 is taken, so a
		 * second `yarn dev` in another terminal quietly steals the name and the
		 * first one is talking to nobody.
		 */
		strictPort: true
	}
});
