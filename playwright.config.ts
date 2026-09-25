import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserChecks, chromiumBrowser, DEVICE_TEST_TIMEOUT } from './e2e/settings';

// CI shards ordinary app tests; instance-wide mutations and the device build
// get their own runners. With no selection, local runs still cover everything.
const suite = process.env.PLAYWRIGHT_SUITE ?? 'all';
if (!['all', 'app', 'admin', 'device'].includes(suite)) {
	throw new Error(`Unknown PLAYWRIGHT_SUITE: ${suite}`);
}

/**
 * Every other checkout sitting inside this one.
 *
 * A git worktree is a whole second copy of the repo, and a spec found in one
 * is loaded against that copy's files — where `$lib` does not resolve, so the
 * run dies before a single test starts, naming a path nobody was working in.
 * `.worktrees/` was ignored by name below; worktrees made anywhere else were
 * not, and one called `aaaa` at the root took the whole suite out.
 *
 * Found rather than listed: a directory with a `.git` in it is not part of
 * this working tree, whatever it is called. That covers the sibling
 * repositories too, which is right for the same reason.
 */
/*
 * Anchored to this file, not to `**`.
 *
 * `**\/.worktrees/**` reads as "anywhere called .worktrees" and Playwright
 * matches it against absolute paths — so running the suite from *inside* a
 * checkout under `.worktrees/` ignored every spec in it and reported "no
 * tests found", which is a confusing way to say "you are in the wrong
 * directory". Rooted at the config's own directory it means what it says:
 * checkouts nested below this one.
 */
const here = import.meta.dirname;

const otherCheckouts = readdirSync(here, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && existsSync(join(here, entry.name, '.git')))
	.map((entry) => `${here}/${entry.name}/**`);

/**
 * And every hidden directory, for the same reason and in the same shape: what
 * sits under one — a worktree, tool state, another copy of the repo — is never
 * this suite's specs.
 */
const nestedCopies = [`${here}/.*/**`];

/**
 * The tests get their own database.
 *
 * Without this the suite booted against `~/.local/share/ontoplano/ontoplano.db`
 * — a real one, on whichever machine ran it. `e2e/prepare.mjs` creates the
 * schema in a throwaway file and the server is pointed at it.
 */
const TEST_DB = process.env.PLAYWRIGHT_DB ?? join(tmpdir(), 'ontoplano-e2e.db');

/**
 * And their own instance config.
 *
 * Registration is closed by default, so a suite that reads the developer's
 * config file would pass or fail on what that file happens to say.
 * `e2e/prepare.mjs` writes an open one here.
 */
export const TEST_CONFIG_DIR =
	process.env.PLAYWRIGHT_CONFIG_DIR ?? join(tmpdir(), 'ontoplano-e2e-config');

export default defineConfig({
	...browserChecks,
	/*
	 * Two servers, because there are two builds to test.
	 *
	 * The first is the one production runs. The second is the artefact a phone
	 * actually gets: static files with `PUBLIC_ONTOPLANO_ISOLATED` baked in,
	 * served by nothing smarter than a file server with an SPA fallback, which
	 * is the contract Capacitor honours. It used to live in a config of its own
	 * that only `make test-isolated` invoked — so the build that ships to the
	 * stores was the one build no push ever tested, and three bugs in it
	 * survived a green pipeline.
	 */
	webServer: [
		{
			/*
			 * The server production runs, not the one Vite lends you.
			 *
			 * This was `vite preview`, which is a different server from the
			 * adapter-node build the box starts — so `BODY_SIZE_LIMIT`, the header
			 * handling and the shutdown path were all being exercised in something
			 * that never ships. It also closed idle keep-alive sockets after Node's
			 * default five seconds while Playwright's request context pooled them,
			 * and a call landing in that window read ECONNRESET: three unrelated
			 * specs failed that way in one afternoon, each passing on its own.
			 * `KEEP_ALIVE_TIMEOUT` below is longer than any gap in the suite.
			 */
			// The preparation is part of the command on purpose: `globalSetup` runs
			// after the server, which meant the server opened the database that was
			// about to be deleted. See `e2e/prepare.mjs`.
			command: 'node e2e/prepare.mjs && npm run build && node build',
			port: 4173,
			reuseExistingServer: !process.env.CI,
			timeout: 300_000,
			env: {
				DATABASE_URL: TEST_DB,
				// adapter-node listens where it is told; vite preview picked this.
				PORT: '4173',
				HOST: '127.0.0.1',
				// Seconds. Longer than the longest pause between two requests on one
				// pooled connection, so the server never closes a socket a client is
				// about to write to.
				KEEP_ALIVE_TIMEOUT: '120',
				ORIGIN: 'http://localhost:4173',
				BETTER_AUTH_URL: 'http://localhost:4173',
				BETTER_AUTH_SECRET: 'playwright-secret-playwright-secret',
				// Lets a test flip one page into local mode with `?isolated`, so the
				// suite can drive the device instance and the server through one
				// build. Dead in any build that does not opt in.
				PUBLIC_ONTOPLANO_ISOLATED_OPT_IN: 'true',
				// Keep the tests off whatever the developer's own config says.
				ONTOPLANO_CONFIG_DIR: TEST_CONFIG_DIR,
				// The instance-owner pages only exist on a self-hosted instance, and
				// they are part of what the suite checks.
				ONTOPLANO_SELF_HOST: 'true',
				// adapter-node's default is smaller than the pictures this app
				// accepts, and the app refuses to start when the two disagree — the
				// suite runs the real built server, so it needs the real setting.
				BODY_SIZE_LIMIT: '12M',
				// So a test can present itself as a distinct client and not spend the
				// whole suite's share of the sign-in rate limit.
				ONTOPLANO_TRUST_PROXY: 'true',
				// `/healthz` only discloses disk and memory to a probe that knows this.
				ONTOPLANO_HEALTH_TOKEN: 'playwright-health-token',
				XDG_CONFIG_HOME: join(homedir(), '.config'),
				// The administration page reads fail2ban's log; `e2e/prepare.mjs`
				// writes this one, so the test does not need the real thing.
				// The server runs in UTC for the same reason the unit suite does:
				// otherwise "today" is a different day here and on a laptop three
				// hours west, and a failure means the machine rather than the code.
				TZ: 'UTC'
			}
		},
		{
			// The phone's copy. `make isolated` compiles every route a second
			// time into the database worker, which is why this is slow to start
			// and why it is worth having: none of that path is exercised above.
			command: 'make -s isolated && node scripts/serve-isolated.mjs',
			port: 4180,
			reuseExistingServer: !process.env.CI,
			timeout: 300_000
		}
	].filter((_, index) => suite === 'all' || index === (suite === 'device' ? 1 : 0)),
	// The browser keeps the server's clock, for the same reason the server is
	// pinned to UTC above. Left on the machine's own timezone, a browser three
	// hours west computes a "today" the server calls yesterday, and anything
	// planned for today lands outside the window the plan draws — a suite that
	// passes all day and fails after 21:00.
	use: { ...browserChecks.use, baseURL: 'http://localhost:4173' },
	testMatch: '**/*.e2e.{ts,js}',
	// Worktrees are whole copies of the repo; without this every spec would
	// run once per open worktree.
	testIgnore: [...nestedCopies, ...otherCheckouts],

	/*
	 * The registration tests go last, on their own.
	 *
	 * They change an instance-wide setting — who may create an account — by
	 * rewriting the config file the server reads. Every other test registers
	 * one, so the two cannot overlap: this makes "everything else" a project
	 * that must finish first.
	 */
	projects: [
		{
			name: 'owner',
			testMatch: '**/owner.setup.ts',
			use: chromiumBrowser
		},
		{
			name: 'app',
			use: chromiumBrowser,
			// A project's own `testIgnore` replaces the one above rather than
			// adding to it, so the list of other checkouts has to be spread in
			// here as well. `admin` and `registration` set only `testMatch` and
			// keep the top-level list.
			testIgnore: [
				'**/{registration,admin}.e2e.ts',
				...nestedCopies,
				'**/e2e-isolated/**',
				...otherCheckouts
			]
		},
		/*
		 * The pages only the instance's owner can open.
		 *
		 * The owner is the oldest account, so this cannot run until something
		 * has made accounts — and not beside `app` either, which is making
		 * them: "the oldest account" is a moving target while that project
		 * runs, and signing in as it races.
		 */
		{
			name: 'admin',
			testMatch: '**/admin.e2e.ts',
			use: chromiumBrowser,
			dependencies: [suite === 'admin' ? 'owner' : 'app']
		},
		{
			name: 'registration',
			testMatch: '**/registration.e2e.ts',
			dependencies: ['admin'],
			use: chromiumBrowser
		},
		/*
		 * Firefox, for what only Firefox gets wrong.
		 *
		 * Its range input runs a thumb drag of its own, and a rating dragged
		 * with the mouse used to flick back after letting go there and nowhere
		 * else. One spec, not the suite: the rest is layout and wiring, which
		 * one engine answers.
		 */
		{
			name: 'firefox',
			testMatch: '**/rating-slider.e2e.ts',
			grep: /with a mouse/,
			use: { browserName: 'firefox' }
		},
		/*
		 * The build that ships to the stores.
		 *
		 * Its own server, its own address, and no accounts anywhere — there is
		 * no server to hold one. Everything above reaches isolated mode through
		 * the `?isolated` switch, which is a hybrid: the shell is still rendered
		 * by a server. This is the artefact itself.
		 *
		 * A project rather than a config of its own, because a suite somebody
		 * has to remember to run separately is a suite that does not run. The
		 * separate one never did on a push, and the app in the store was the
		 * only build nothing tested.
		 */
		{
			name: 'device',
			timeout: DEVICE_TEST_TIMEOUT,
			testDir: 'e2e-isolated',
			testIgnore: ['**/.*/**', ...otherCheckouts],
			use: { ...chromiumBrowser, baseURL: 'http://localhost:4180' }
		}
	].filter(({ name }) => {
		if (suite === 'all') return name !== 'owner';
		if (suite === 'app') return ['app', 'firefox'].includes(name);
		if (suite === 'admin') return ['owner', 'admin', 'registration'].includes(name);
		return name === 'device';
	})
});
