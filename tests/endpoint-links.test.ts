import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A link may not point at an endpoint.
 *
 * SvelteKit's client router intercepts same-origin `<a>` clicks and looks for
 * a *page* at the target. A route that is only a `+server.ts` has none, so the
 * tap raises "Not found" in the router instead of downloading anything — and
 * the second tap, after the error had torn the page down, appeared to work.
 * That is exactly how the expired account's "Download your data" button came
 * to spend two of a day's two exports on one impatient double-tap.
 *
 * The fix on that page was a form, which submits natively. This is the rule
 * made mechanical, so the next endpoint link is caught here instead of on
 * somebody's phone: point a link at an endpoint and either give it a form or
 * `data-sveltekit-reload`, which tells the router to stay out of it.
 */
const ROUTES = 'src/routes';

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

const files = walk(ROUTES);

/** Every route that answers with data rather than a page. */
const endpointRoutes = new Set(
	files
		.filter((f) => f.endsWith('+server.ts'))
		.map((f) => f.slice(ROUTES.length, -'/+server.ts'.length))
		.filter((r) => {
			// Only those with no page beside them: a route can have both.
			return !files.includes(join(ROUTES + r, '+page.svelte'));
		})
);

describe('links into endpoints', () => {
	it('knows which routes are endpoints', () => {
		expect(endpointRoutes.has('/settings/account/export')).toBe(true);
		expect(endpointRoutes.has('/healthz')).toBe(true);
	});

	for (const file of files.filter((f) => f.endsWith('.svelte'))) {
		const source = readFileSync(file, 'utf8');

		it(`${file} routes no <a> into an endpoint`, () => {
			for (const anchor of source.matchAll(/<a\b[\s\S]*?>/g)) {
				const tag = anchor[0];
				const href =
					tag.match(/href=\{resolve\('([^']+)'\)\}/)?.[1] ?? tag.match(/href="(\/[^"]*)"/)?.[1];
				if (!href) continue;
				// `data-sveltekit-reload` is the escape hatch: it hands the click
				// back to the browser, which is what an endpoint needs.
				if (tag.includes('data-sveltekit-reload')) continue;

				expect(
					endpointRoutes.has(href.split('?')[0]),
					`${href} is an endpoint, so this link must be a form or carry data-sveltekit-reload`
				).toBe(false);
			}
		});
	}
});
