import { mdsvex } from 'mdsvex';
import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		/*
		 * A working directory per build, not one shared by both.
		 *
		 * The two builds — adapter-node into `build/`, adapter-static into
		 * `build-isolated/` — compile through `.svelte-kit/output` before their
		 * adapters copy out of it. Sharing that directory means they cannot run
		 * at the same time, and Playwright starts both web servers at once: one
		 * build's chunks landed in the other's `build/`, and the server died
		 * mid-suite on a hashed file that no longer existed. Forty-two tests
		 * failed for it, all of them `ERR_CONNECTION_REFUSED`, none of them
		 * about the thing they were testing.
		 *
		 * A directory each is the whole fix, and it is also what lets `make
		 * build` and `make isolated` run in parallel during a release.
		 */
		outDir: process.env.ONTOPLANO_ISOLATED_BUILD === '1' ? '.svelte-kit-isolated' : '.svelte-kit',
		// All CSS inlined into the HTML: a first, cold visit was rendering the
		// page before the stylesheet arrived — a giant unstyled section glyph
		// and a bare link, then the real page. An app this size is one person's
		// tool; a bigger HTML beats a flash of wreckage.
		inlineStyleThreshold: 1024 * 1024,
		/*
		 * Two builds from one tree. The server build is adapter-node, as ever.
		 * ONTOPLANO_ISOLATED_BUILD=1 produces the isolated instance instead: static
		 * files, no server anywhere — every page is the SPA fallback, the
		 * fetch bridge answers the app's own requests from the worker, and
		 * whatever serves the files (Capacitor, a static host) needs to know
		 * nothing. `make local` is the front door.
		 */
		adapter:
			process.env.ONTOPLANO_ISOLATED_BUILD === '1'
				? adapterStatic({
						pages: 'build-isolated',
						assets: 'build-isolated',
						fallback: 'index.html'
					})
				: adapterNode(),

		/*
		 * No service worker while developing.
		 *
		 * Vite serves modules at URLs with a version query, and those change
		 * whenever the dev server restarts. A worker that had cached a page kept
		 * handing back HTML pointing at modules that no longer existed: every
		 * import failed, the client never hydrated, the offline fallback appeared
		 * and the page reloaded into the same state forever — with nothing in the
		 * server log, because none of it reached the server.
		 *
		 * It is a production concern anyway. `npm run build && npm run preview`
		 * is where to test it.
		 */
		serviceWorker: { register: false },

		/*
		 * CSP is configured here rather than as a header in hooks, because
		 * SvelteKit emits an inline bootstrap script and only it knows the hash.
		 * A hand-written `script-src 'self'` blocks that script: the page still
		 * server-renders, so it looks fine, but nothing hydrates and every
		 * button stops working.
		 *
		 * `unsafe-inline` stays on styles because the app sets colours inline
		 * from user-defined category values, which is precisely what CSP cannot
		 * express. Scripts get no such exemption — that is where XSS lands.
		 */
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				/*
				 * SPIKE: WebAssembly needs saying out loud.
				 *
				 * `script-src 'self'` refuses `WebAssembly.instantiate` outright, so
				 * SQLite on the device cannot start. `wasm-unsafe-eval` permits
				 * compiling WebAssembly and nothing else — it does not bring
				 * `eval()` or `new Function()` with it, which is what `unsafe-eval`
				 * would have meant. Still a widening, and Estevão's call to keep.
				 */
				'script-src': ['self', 'wasm-unsafe-eval'],
				'style-src': ['self', 'unsafe-inline'],
				// @fontsource inlines some faces as data: URIs.
				'font-src': ['self', 'data:'],
				'img-src': ['self', 'data:'],
				'connect-src': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none'],
				'base-uri': ['self'],
				'object-src': ['none']
			}
		}
		// csrf.checkOrigin is left at its default of `true`. It is the only CSRF
		// defence this app has — there are no tokens — so turning it off makes
		// every form action forgeable by any page on the internet. If a form
		// starts failing behind a proxy, the fix is to set ORIGIN correctly, not
		// to disable the check.
	},
	preprocess: [mdsvex({ extensions: ['.svx', '.md'] })],
	extensions: ['.svelte', '.svx', '.md']
};

export default config;
