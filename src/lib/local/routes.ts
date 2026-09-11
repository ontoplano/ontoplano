/**
 * The local instance's routing table.
 *
 * Each route that runs locally keeps its logic in a `page.local.ts` beside
 * its `+page.server.ts`, which re-exports it — one body, two callers. Layout
 * data comes from `layout.local.ts` the same way. This module collects them
 * all, matches a pathname the way SvelteKit would, and runs the right one
 * against the single local account. It runs inside the database worker,
 * because the services it calls are synchronous over the database that lives
 * there.
 */
import { isActionFailure, isRedirect, isHttpError } from '@sveltejs/kit';
import { LOCAL_USER_ID } from './config.js';

/**
 * The slice of SvelteKit's request event the local routes are written
 * against. Small on purpose: everything in it exists in a worker, so a route
 * that stays inside it runs identically on the server and on the device.
 */
export interface LocalRouteEvent {
	request: Request;
	url: URL;
	/** Every segment the route pattern names is present once it matched. */
	params: Record<string, string>;
	/**
	 * Optional to stay assignable from the server's own event, where a
	 * session may be absent. Locally it is always the one account, so route
	 * bodies keep the same `locals.user!.id` they were born with.
	 */
	locals: { user?: { id: string } | undefined };
}

type PageModule = {
	load?: (event: LocalRouteEvent) => unknown;
	actions?: Record<string, (event: LocalRouteEvent) => unknown>;
};
type LayoutModule = { load?: (event: LocalRouteEvent) => unknown };

const pages = import.meta.glob('/src/routes/**/page.local.ts', { eager: true }) as Record<
	string,
	PageModule
>;
const layouts = import.meta.glob('/src/routes/**/layout.local.ts', { eager: true }) as Record<
	string,
	LayoutModule
>;
// Keys only, never compiled: the node array a data request answers with has
// one slot per +layout.svelte on the branch, so their positions are needed
// even though their components never run here. `?url` keeps the Svelte
// compiler out of the worker build — the values are ignored.
const layoutShells = import.meta.glob('/src/routes/**/+layout.svelte', {
	query: '?url',
	import: 'default',
	eager: true
});

const PREFIX = '/src/routes';

/** '/src/routes/tasks/todo/page.local.ts' -> '/tasks/todo'; root -> '/'. */
function dirOf(key: string, suffix: string): string {
	return key.slice(PREFIX.length, -suffix.length) || '/';
}

type Matcher = { dir: string; pattern: RegExp; names: string[]; module: PageModule };

const matchers: Matcher[] = Object.entries(pages)
	.map(([key, module]) => {
		const dir = dirOf(key, '/page.local.ts');
		const names: string[] = [];
		const pattern = new RegExp(
			'^' +
				dir
					.split('/')
					.map((segment) => {
						const dynamic = segment.match(/^\[(.+)]$/);
						if (!dynamic) return segment.replace(/[.*+?^${}()|\\]/g, '\\$&');
						names.push(dynamic[1]);
						return '([^/]+)';
					})
					.join('/') +
				'$'
		);
		return { dir, pattern, names, module };
	})
	// Static segments outrank dynamic ones, the way SvelteKit ranks routes.
	.sort((a, b) => Number(a.dir.includes('[')) - Number(b.dir.includes('[')));

export function matchLocalRoute(
	pathname: string
): { matcher: Matcher; params: Record<string, string> } | null {
	const clean = pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	for (const matcher of matchers) {
		const hit = clean.match(matcher.pattern);
		if (hit) {
			const params: Record<string, string> = {};
			matcher.names.forEach((name, i) => (params[name] = decodeURIComponent(hit[i + 1])));
			return { matcher, params };
		}
	}
	return null;
}

function eventFor(url: URL, params: Record<string, string>, request?: Request): LocalRouteEvent {
	return {
		request: request ?? new Request(url),
		url,
		params,
		locals: { user: { id: LOCAL_USER_ID } }
	};
}

/** The branch of layout slots for a route dir, leaf excluded. */
function branchOf(dir: string): { shell: boolean; module: LayoutModule | null }[] {
	const prefixes = ['/'];
	if (dir !== '/') {
		const parts = dir.split('/').slice(1);
		for (let i = 1; i <= parts.length; i++) prefixes.push('/' + parts.slice(0, i).join('/'));
	}
	return prefixes
		.map((prefix) => {
			const at = prefix === '/' ? '' : prefix;
			return {
				shell: `${PREFIX}${at}/+layout.svelte` in layoutShells,
				module: layouts[`${PREFIX}${at}/layout.local.ts`] ?? null
			};
		})
		.filter((slot) => slot.shell || slot.module);
}

export type LoadReply =
	| { kind: 'data'; nodes: ({ data: unknown } | null)[] }
	| { kind: 'redirect'; location: string }
	| { kind: 'error'; status: number; message: string };

export async function runLocalLoad(pathname: string, search: string): Promise<LoadReply | null> {
	const hit = matchLocalRoute(pathname);
	if (!hit) return null;
	const url = new URL(pathname + search, self.location.origin);
	const event = eventFor(url, hit.params);
	try {
		const nodes: ({ data: unknown } | null)[] = [];
		for (const slot of branchOf(hit.matcher.dir)) {
			nodes.push(slot.module?.load ? { data: await slot.module.load(event) } : null);
		}
		nodes.push(hit.matcher.module.load ? { data: await hit.matcher.module.load(event) } : null);
		return { kind: 'data', nodes };
	} catch (e) {
		if (isRedirect(e)) return { kind: 'redirect', location: e.location };
		if (isHttpError(e)) return { kind: 'error', status: e.status, message: e.body.message };
		throw e;
	}
}

export type ActionReply =
	| { kind: 'success'; status: number; data: unknown }
	| { kind: 'failure'; status: number; data: unknown }
	| { kind: 'redirect'; status: number; location: string }
	| { kind: 'error'; status: number; message: string };

export async function runLocalAction(
	pathname: string,
	search: string,
	action: string,
	form: [string, string][]
): Promise<ActionReply | null> {
	const hit = matchLocalRoute(pathname);
	if (!hit) return null;
	const handler = hit.matcher.module.actions?.[action];
	if (!handler) return { kind: 'error', status: 405, message: `No such action: ${action}` };

	const body = new FormData();
	for (const [name, value] of form) body.append(name, value);
	const url = new URL(pathname + search, self.location.origin);
	const request = new Request(url, { method: 'POST', body });

	try {
		const result = await handler(eventFor(url, hit.params, request));
		if (isActionFailure(result))
			return { kind: 'failure', status: result.status, data: result.data };
		return { kind: 'success', status: result ? 200 : 204, data: result };
	} catch (e) {
		if (isRedirect(e)) return { kind: 'redirect', status: e.status, location: e.location };
		if (isHttpError(e)) return { kind: 'error', status: e.status, message: e.body.message };
		throw e;
	}
}
